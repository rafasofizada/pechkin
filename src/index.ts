import { on } from 'events';
import busboy from 'busboy';
import { IncomingMessage } from 'http';

import { FieldLimitError, TotalLimitError } from './error';
import { defaultPechkinConfig, pechkinConfigToBusboyLimits } from './config';
import { BusboyFile, Fields, ParserDependency, FileFieldLimits, PechkinFile, RequiredPechkinConfig, PechkinConfig, Limits } from './types';
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
  private readonly fileFields: Map<
    string,
    {
      count: number;
      limits: FileFieldLimits;
    }
  > = new Map();

  constructor(
    private readonly parser: busboy.Busboy,
    private readonly config: RequiredPechkinConfig,
  ) {
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

      if (!this.fileFields.has(field)) {
        this.fileFields.set(field, {
          count: 0,
          limits: fileFieldLimits(this.config, field),
        });
      }

      if ([...this.fileFields.keys()].length > this.config.base.maxTotalFileFieldCount) {
        throw new TotalLimitError("maxTotalFileFieldCount", this.config.base.maxTotalFileFieldCount);
      }

      const fileField = this.fileFields.get(field);

      if (fileField.count + 1 > fileField.limits.maxFileCountPerField) {
        // Abort...
        if (fileField.limits.abortOnFileCountPerFieldLimit) {
          // TODO: Abort the entire request in return()/cleanup()
          throw new FieldLimitError("maxFileCountPerField", field, fileField.limits.maxFileCountPerField);
        }

        // ...or skip
        stream.resume();

        return {
          done: false,
          value: {
            field,
            stream: null,
            skipped: true,
            byteLength: Promise.resolve({ truncated: false, readBytes: 0 }),
            ...info,
          },
        };
      }
      
      fileField.count += 1;

      const truncatedStream = stream.pipe(new ByteLengthTruncateStream(fileField.limits.maxFileByteLength));
  
      // Busboy's "byteLength" analogue
      stream.addListener('limit', busboyLimitListener);

      return {
        done: false,
        value: {
          field,
          stream: truncatedStream,
          skipped: false,
          byteLength: truncatedStream.byteLengthEvent
            .then((payload) => {
              stream.removeListener('limit', busboyLimitListener);

              if (payload.truncated && fileField.limits.abortOnFileByteLengthLimit) {
                // TODO: Abort the entire request in return()/cleanup()
                throw new FieldLimitError("maxFileByteLength", field, fileField.limits.maxFileByteLength);
              }

              return payload;
            }),
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

    return Object.create(asyncIterator, {
      next: { value: next, enumerable: true },
      return: { value: cleanup, enumerable: true },
    });
  }
}

function fileFieldLimits(config: RequiredPechkinConfig, field: string): FileFieldLimits {
  return {
    ...config.base,
    ...(config.fileOverride?.[field] ?? {}),
  };
}

function busboyLimitListener(...busboyArgs: unknown[]) {
  throw new Error(
    `\
Busboy 'limit' event.
Busboy 'fileSize' limit set by pechkinConfigToBusboyLimits(), for some reason, was reached before Pechkin 'maxFileByteLength' was reached.
This should not happen, please report this issue.
Busboy args: ${JSON.stringify(busboyArgs, null, 2)}`
  );
};