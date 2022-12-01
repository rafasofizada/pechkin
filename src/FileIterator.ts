import busboy from "busboy";
import { on, Readable } from "stream";

import { ByteLengthTruncateStream } from "./ByteLengthTruncateStream";
import { TotalLimitError, FieldLimitError } from "./error";
import { FileCounter } from "./FileCounter";
import { Internal } from "./types";

type BusboyFileEventPayload = [field: string, stream: Readable, info: busboy.FileInfo];

type BusboyFileIterator = AsyncIterableIterator<BusboyFileEventPayload>;

export function FileIterator(
  parser: busboy.Busboy,
  config: Internal.Config,
  fileFieldConfig: Internal.FileFieldConfig,
): Internal.Files {
  const busboyIterator: AsyncIterableIterator<BusboyFileEventPayload> = on(parser, "file");
  const fileCounter = FileCounter(config, fileFieldConfig);

  const asyncIterator = BusboyIteratorWrapper(busboyIterator, fileFieldConfig, fileCounter);

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
   parser
     .once('partsLimit', () => {
       if (thrown) return;

       thrown = true;
       // TODO: INVESTIGATE: Why does iterator.throw() not act like reject() in Promises?
       // Why doesn't the first throw() "lock" the iterator?
       return asyncIterator.throw!(new TotalLimitError("maxTotalPartCount"));
     })
     .once('filesLimit', () => {
       if (thrown) return;

       thrown = true;
       return asyncIterator.throw!(new TotalLimitError("maxTotalFileCount"))
     })
     .once('error', (error) => {
       if (thrown) return;

       thrown = true;
       return asyncIterator.throw!(error);
     })
     .once('close', () => { 
       return asyncIterator.return!();
     });

  // for-await-of loop calls [Symbol.asyncIterator]
  return Object.create(asyncIterator, { [Symbol.asyncIterator]: { value: () => asyncIterator } });
}

function BusboyIteratorWrapper(
  busboyIterator: BusboyFileIterator,
  fileFieldConfig: Internal.FileFieldConfig,
  fileCounter: FileCounter,
): Internal.FileIterator {
  const asyncIterator = busboyIterator[Symbol.asyncIterator]();

  const next = async (): Promise<IteratorResult<Internal.File, undefined>> => {
    const iterElement = await asyncIterator.next();
  
    // `=== true` to narrow `boolean | undefined` to `boolean`
    return iterElement.done === true
      ? iterElement
      : {
        done: false,
        value: processBusboyFileEventPayload(iterElement.value, fileFieldConfig, fileCounter)
      };
  }

  return Object.create(asyncIterator, { next: { value: next } });
}

function processBusboyFileEventPayload(
  [field, stream, info]: BusboyFileEventPayload,
  { [field]: { maxFileByteLength, abortOnFileByteLengthLimit } }: Internal.FileFieldConfig,
  fileCounter: FileCounter,
): Internal.File {
  // May throw!
  fileCounter[field] += 1;

  const truncatedStream = stream.pipe(new ByteLengthTruncateStream(maxFileByteLength));

  return {
    field,
    stream: truncatedStream,
    byteLength: truncatedStream.byteLengthEvent
      .then((payload) => {
        if (payload.truncated && abortOnFileByteLengthLimit) {
          throw new FieldLimitError("maxFileByteLength", field, maxFileByteLength);
        }

        return payload;
      }),
    ...info,
  };
}