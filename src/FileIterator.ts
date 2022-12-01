import busboy from "busboy";
import { on, Readable } from "stream";

import { ByteLengthTruncateStream } from "./ByteLengthTruncateStream";
import { TotalLimitError, FieldLimitError } from "./error";
import { Pechkin } from "./types";

type BusboyFileEventPayload = [field: string, stream: Readable, info: busboy.FileInfo];

export class FileIterator {
  private readonly iterator: AsyncIterableIterator<BusboyFileEventPayload>;
  private readonly fileFields: Map<
    string,
    {
      count: number;
      config: Pechkin.FileFieldConfig;
    }
  > = new Map();

  constructor(
    private readonly parser: busboy.Busboy,
    private readonly config: Pechkin.Config,
    private readonly fileFieldConfigOverride: Record<string, Partial<Pechkin.FileFieldConfig>>,
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
     * from the Node.js source code for on(), the returned object always contains them.
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

  [Symbol.asyncIterator](): AsyncIterator<Pechkin.File> {
    const asyncIterator = this.iterator[Symbol.asyncIterator]();

    const next = async (): Promise<IteratorResult<Pechkin.File, undefined>> => {
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
          config: {
            ...this.config,
            ...(this.fileFieldConfigOverride[field] ?? {}),
          }
        });
      }

      const fileField = this.fileFields.get(field)!;

      // TODO: Test maxTotalFileFieldCount
      if ([...this.fileFields.keys()].length > this.config.maxTotalFileFieldCount) {
        throw new TotalLimitError("maxTotalFileFieldCount", this.config.maxTotalFileFieldCount);
      }

      if (fileField.count + 1 > fileField.config.maxFileCountPerField) {
        // Abort...
        if (fileField.config.abortOnFileCountPerFieldLimit) {
          // TODO: Abort the entire request in return()/cleanup()
          throw new FieldLimitError("maxFileCountPerField", field, fileField.config.maxFileCountPerField);
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

      const truncatedStream = stream.pipe(new ByteLengthTruncateStream(fileField.config.maxFileByteLength));
  
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

              if (payload.truncated && fileField.config.abortOnFileByteLengthLimit) {
                // TODO: Abort the entire request in return()/cleanup()
                throw new FieldLimitError("maxFileByteLength", field, fileField.config.maxFileByteLength);
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

function busboyLimitListener(...busboyArgs: unknown[]) {
  throw new Error(
    `\
Busboy 'limit' event.
Busboy 'fileSize' limit set by pechkinConfigToBusboyLimits(), for some reason, was reached before Pechkin 'maxFileByteLength' was reached.
This should not happen, please report this issue.
Busboy args: ${JSON.stringify(busboyArgs, null, 2)}`
  );
};