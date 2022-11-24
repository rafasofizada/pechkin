import * as busboy from 'busboy';
import { on } from 'events';
import { IncomingMessage } from 'http';

import { FieldLimitError, TotalLimitError } from './error';
import { defaultPechkinConfig, pechkinConfigToBusboyLimits } from './config';
import { BusboyFile, Fields, ParserDependency, FileFieldLimits, PechkinFile, RequiredPechkinConfig, PechkinConfig } from './types';
import { ByteLengthTruncateStream } from './length';

export async function parseFormData(
  request: IncomingMessage,
  pechkinConfig?: PechkinConfig,
  busboyConfig?: Omit<busboy.BusboyConfig, 'headers' | 'limits'> & { headers?: busboy.BusboyConfig['headers'] }
): Promise<{
  fields: Fields,
  files: FileIterator,
}> {
  // TODO: Test, separate into a function
  const config = {
    base: {
      ...defaultPechkinConfig.base,
      ...(pechkinConfig?.base ?? {}),
    },
    fileOverride: pechkinConfig?.fileOverride,
  } as RequiredPechkinConfig;

  const parser = busboy.default({
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
  /**
   * Note: we cleanup only `parts`, `error` and `finish` listeners,
   * as they also appear in the `files` iterator.
   */
  let partsLimitHandler: () => void;
  let errorHandler: (error: Error) => void;
  let finishHandler: () => void;

  const cleanup = () => {
    // TODO: Test listener cleanup
    parser.removeListener('partsLimit', partsLimitHandler);
    parser.removeListener('error', errorHandler);
    parser.removeListener('finish', finishHandler);
  };
  
  return new Promise<Fields>((resolve, reject) => {
    const fields: Fields = {};

    partsLimitHandler = () => reject(new TotalLimitError('maxTotalPartCount'));
    errorHandler = (error: Error) => reject(error);
    finishHandler = () => resolve(fields);

    /**
     * `cleanup()`s are called before every Promise resolution/rejection
     * Why not in finally() after the Promise? It fires too late – after the event
     * handlers in `file` iterator have already fired.
     */
    parser
      // TODO: Add a limit on maxFieldKeyByteLength
      // TODO: Test maxFieldKeyByteLength
      // TODO: Test maxFieldValueByteLength
      // TODO: Test 'error' and 'finish' events
      .on('field', (name: string, value: string, info: busboy.FieldInfo) => {
        // Bug in Busboy (https://github.com/mscdex/busboy/issues/6)
        if (info.nameTruncated) (cleanup(), reject(new FieldLimitError("maxFieldKeyByteLength", name)));
        if (info.valueTruncated) (cleanup(), reject(new FieldLimitError("maxFieldValueByteLength", name)));

        fields[name] = value;
      })
      .once('file', () => (cleanup(), resolve(fields)))
      .once('partsLimit', (cleanup(), partsLimitHandler))
      .once('fieldsLimit', () => (cleanup(), reject(new TotalLimitError("maxTotalFieldCount"))))
      .once('error', (cleanup(), errorHandler))
      .once('finish', (cleanup(), finishHandler));
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

    /**
     * Without the `thrown` flag, the following scenario:
     *
     * 1. `filesLimit` event is emitted, maxTotalFileCount error is thrown
     * 2. THEN `partsLimit` event is emitted, maxTotalPartCount error is thrown
     *
     * will result in maxTotalPartCount error being thrown, instead of maxTotalFileCount.
     * 
     * `thrown` flag and checks in every event listener acts as a locking mechanism.
     */
    let thrown = false;

    /**
     * AsyncIterableIterator interface's next(), return(), throw() methods are optional, however,
     * from the Node.js source code for on(), the returned object always providers
     * implementations for next(), return(), throw().
     */
    // TODO: Test that this.iterator.throw() and this.iterator[Symbol.asyncIterator].throw() are the same function.
    this.parser
      .once('partsLimit', () => {
        if (thrown) return;

        thrown = true;
        // TODO: INVESTIGATE: Why does this.iterator.throw() not act like reject() in Promises?
        // Why doesn't the first throw() "lock" the iterator?
        return this.iterator.throw!(new TotalLimitError("maxTotalPartCount"));
      })
      .once('filesLimit', () => {
        if (thrown) return;

        thrown = true;
        return this.iterator.throw!(new TotalLimitError("maxTotalFileCount"))
      })
      .once('error', (error) => {
        if (thrown) return;

        thrown = true;
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
    
      // `=== true` to narrow `boolean | undefined` to `boolean`
      if (iterElement.done === true) {
        return { done: true, value: undefined };
      }

      const [field, stream, info] = iterElement.value;

      if (!this.fileFields.has(field)) {
        // TODO: Test the fileFields exists/not->set functionality 
        this.fileFields.set(field, {
          count: 0,
          limits: fileFieldLimits(this.config, field),
        });
      }

      const fileField = this.fileFields.get(field)!;

      // TODO: Test maxTotalFileFieldCount
      if ([...this.fileFields.keys()].length > this.config.base.maxTotalFileFieldCount) {
        throw new TotalLimitError("maxTotalFileFieldCount", this.config.base.maxTotalFileFieldCount);
      }

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
    // TODO: Test cleanup
    const cleanup = (): Promise<IteratorReturnResult<undefined>> => {
      // TODO: Cleanup
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