import { on } from 'events';
import busboy from 'busboy';
import { Readable } from 'stream';
import { IncomingMessage } from 'http';

import { FieldLimitError, TotalLimitError } from './error';
import { defaultPechkinConfig, pechkinConfigToBusboyLimits } from './config';
import { BusboyFile, Fields, ParserDependency, FileFieldLimits, PechkinFile, RequiredPechkinConfig, PechkinConfig} from './types';
import { ByteLengthTruncateStream } from './length';

export async function parseFormData(
  request: IncomingMessage,
  pechkinConfig?: PechkinConfig,
  busboyConfig?: Omit<busboy.BusboyConfig, 'headers' | 'limits'> & { headers?: busboy.BusboyConfig['headers'] }
): Promise<{
  fields: Fields,
  files: FileIterator,
}> {
  const config = {
    ...(pechkinConfig ?? defaultPechkinConfig),
    base: {
      ...defaultPechkinConfig.base,
      ...(pechkinConfig?.base ?? {}),
    }
  } as RequiredPechkinConfig;

  const parser = busboy({
    headers: request.headers,
    // Overwrite headers...
    ...(busboyConfig ?? {}),
    // ...but don't overwrite limits
    limits: pechkinConfigToBusboyLimits(config),
  });

  const fields = FieldsPromise(parser);
  const files = new FileIterator(parser, config);
  
  request.pipe(parser);

  return { fields: await fields, files };
}

function FieldsPromise(parser: ParserDependency): Promise<Fields> {
  return new Promise<Fields>((resolve, reject) => {
    const fields: Fields = {};

    parser
      .on('field', (name: string, value: string, info: busboy.FieldInfo) => {
        // Bug in Busboy (https://github.com/mscdex/busboy/issues/6)
        if (info.nameTruncated) reject(new FieldLimitError("maxFieldKeyByteLength", name));
        if (info.valueTruncated) reject(new FieldLimitError("maxFieldValueByteLength", name));

        fields[name] = value;
      })
      .once('file', () => {
        return resolve(fields);
      })
      .once('partsLimit', () => {
        return reject(new TotalLimitError("maxTotalPartCount"));
      })
      .once('fieldsLimit', () => {
        return reject(new TotalLimitError("maxTotalFieldCount"));
      })
      .once('error', (error) => {
        return reject(error);
      })
      .once('finish', () => { 
        return resolve(fields);
      });
  });
}

class FileIterator {
  private readonly iterator: AsyncIterableIterator<BusboyFile>;
  private readonly fileController: FileController;

  constructor(
    private readonly parser: busboy.Busboy,
    private readonly config: RequiredPechkinConfig,
  ) {
    this.fileController = new FileController(config);

    this.iterator = on(this.parser, 'file');

    // AsyncIterableIterator interface's next(), return(), throw() methods are optional, however,
    // from the Node.js source code for on(), the returned object always providers
    // implementations for next(), return(), throw().
    this.parser
      .once('partsLimit', () => {
        return this.iterator.throw!(new TotalLimitError("maxTotalPartCount"));
      })
      .once('filesLimit', () => {
        return this.iterator.throw!(new TotalLimitError("maxTotalFileCount"))
      })
      .once('error', (error) => {
        return this.iterator.throw!(error);
      })
      .once('close', () => { 
        return this.iterator.return!();
      });
  }

  [Symbol.asyncIterator](): AsyncIterator<PechkinFile> {
    const asyncIterator = this.iterator[Symbol.asyncIterator]();

    const next = async (): Promise<IteratorResult<PechkinFile, undefined>> => {
      // asyncIterator.next() returned by Events.on() accepts no args
      // https://github.com/nodejs/node/blob/main/lib/events.js#L1017
      const iterElement = await asyncIterator.next();
    
      // === true to narrow down types
      // TODO: Research/report issue to TypeScript?
      if (iterElement.done === true) {
        return { done: true, value: undefined };
      }

      const [field, stream, info] = iterElement.value;

      const [totalFileFieldCountError, fileFieldController] =  this.fileController.getFieldControllerUpsert(field);
      if (totalFileFieldCountError) throw totalFileFieldCountError;

      const [fileCountPerFieldError, count] = fileFieldController.limitCount();
      if (fileCountPerFieldError) throw fileCountPerFieldError;

      const skipped = Number.isNaN(count);

      if (skipped) {
        skipFileStream(stream);

        return {
          done: false,
          value: {
            field,
            stream: null,
            skipped,
            byteLength: Promise.resolve(NaN),
            ...info,
          },
        };
      }

      const measuredTruncatedStream = fileFieldController.processFileStream(stream);

      return {
        done: false,
        value: {
          field,
          stream: measuredTruncatedStream,
          byteLength: measuredTruncatedStream.byteLengthEvent,
          // Throws if the stream is truncated and onFileByteLengthLimit === "throw"
          truncated: measuredTruncatedStream.truncatedEvent,
          skipFile: () => skipFileStream(measuredTruncatedStream),
          skipped: false,
          ...info,
        }
      };
    }

    /**
     * From MDN (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of#description):
     * If the for await...of loop exited early (e.g. a break statement is encountered or an error is thrown),
     * the return() method of the iterator is called to perform any cleanup.
     * The returned promise is awaited before the loop exits.
     */
    const cleanup = (): Promise<IteratorReturnResult<undefined>> => {
      this.parser.destroy();
      return asyncIterator.return!() as Promise<IteratorReturnResult<undefined>>;
    };
    
    return {
      next,
      return: cleanup,
      __proto__: asyncIterator
    } as AsyncIterator<PechkinFile>;
  }
}

class FileController {
  private readonly fileFieldControllers: Record<string, SingleFileFieldController> = {};

  constructor(private readonly config: RequiredPechkinConfig) {}

  getFieldControllerUpsert(field: string): [TotalLimitError] | [null, SingleFileFieldController] {
    this.fileFieldControllers[field] ??= new SingleFileFieldController(field, this.config);

    if (Object.keys(this.fileFieldControllers).length > this.config.base.maxTotalFileFieldCount) {
      return [new TotalLimitError("maxTotalFileFieldCount")];
    }

    return [null, this.fileFieldControllers[field]];
  }
}

class SingleFileFieldController {
  private count: number = 0;
  private readonly limits: FileFieldLimits;

  constructor(
    private readonly field: string,
    config: RequiredPechkinConfig
  ) {
    this.limits = this.fileFieldLimits(field, config);
  }

  limitCount(): [FieldLimitError | null, number]  {
    this.count += 1;

    if (this.count > this.limits.maxFileCountPerField) {
      return this.limits.onFileCountPerFieldLimit === "throw"
        ? [new FieldLimitError("maxFileCountPerField", this.field, this.limits.maxFileCountPerField), NaN]
        : [null, NaN];
    }

    return [null, this.count];
  }

  processFileStream(stream: Readable): ByteLengthTruncateStream {
    const truncateTransform = new ByteLengthTruncateStream(this.limits.maxFileByteLength);
    const truncatedStream = stream.pipe(truncateTransform);

    // Add a listener for BusboyLimits.fileSize event ('limit')
    stream.addListener('limit', busboyLimitListener);
    // Cleanup and throw if configured
    truncateTransform.truncatedEvent.then(() => {
      stream.removeListener('limit', busboyLimitListener);

      if (this.limits.onFileByteLengthLimit === "throw") {
        throw new FieldLimitError("maxFileByteLength", this.field, this.limits.maxFileByteLength);
      }
    });

    return truncatedStream;
  }

  private fileFieldLimits(field: string, config: RequiredPechkinConfig): FileFieldLimits {
    return {
      ...config.base,
      ...(config.fileOverride?.[field] ?? {}),
    };
  }
}

function skipFileStream(stream: Readable) {
  stream.resume();
}

function busboyLimitListener(...busboyArgs: unknown[]) {
  throw new Error(
    `Busboy 'limit' event. Busboy 'fileSize' limit set by pechkinConfigToBusboyLimits(), for some reason, was reached before Pechkin 'maxFileByteLength' was reached. This should not happen, please report this issue. Busboy args: ${JSON.stringify(busboyArgs)}`
  );
};