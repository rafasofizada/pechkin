import busboy from "busboy";
import { on, Readable } from "stream";

import { ByteLengthTruncateStream } from "./ByteLengthTruncateStream";
import { TotalLimitError, FieldLimitError } from "./error";
import { FileCounter } from "./FileCounter";
import { Internal } from "./types";

type BusboyFileEventPayload = [field: string, stream: Readable, info: busboy.FileInfo];

type BusboyFileIterator = AsyncIterableIterator<BusboyFileEventPayload>;

/*
TODO: Test the iteration protocol.

1. Promise rejections in next() don't get caught by the for-await-of loop,
   so return() is not triggered. Has to be handled manually
2. Check that errors thrown inside the loop body get caught and return() is triggered
*/

export function FileIterator(
  parser: busboy.Busboy,
  config: Internal.Config,
  fileFieldConfig: Internal.FileFieldConfig,
  cleanupFn?: () => Promise<void> | void,
): Internal.Files {
  const busboyIterator: AsyncIterableIterator<BusboyFileEventPayload> = on(parser, "file");
  const fileCounter = FileCounter(config, fileFieldConfig);

  const asyncIterator = BusboyIteratorWrapper(busboyIterator, fileFieldConfig, fileCounter, cleanupFn);

  /*
  AsyncIterableIterator interface's next(), return(), throw() methods are optional, however,
  from the Node.js source code for on(), the returned object always contains them.
  */
  parser
    /*
    The async iterator returned by events.on() apparently doesn't conform to the
    Iterator protocol, as throw() expects an error, when by protocol it should
    expect a IteratorResult.
    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols.
    */
    .once('partsLimit', () => asyncIterator.throw!(new TotalLimitError("maxTotalPartCount")))
    .once('filesLimit', () => asyncIterator.throw!(new TotalLimitError("maxTotalFileCount")))
    .once('error', (error) => asyncIterator.throw!(error))
    .once('close', () => asyncIterator.return!());

  const asyncIterableIterator = {
    ...asyncIterator,
    [Symbol.asyncIterator]() { return asyncIterableIterator; },
  };

  // for-await-of loop calls [Symbol.asyncIterator]
  return Object.create(asyncIterator, { [Symbol.asyncIterator]: { value: () => asyncIterator } });
}

function BusboyIteratorWrapper(
  busboyIterator: BusboyFileIterator,
  fileFieldConfig: Internal.FileFieldConfig,
  fileCounter: FileCounter,
  cleanupFn?: () => Promise<void> | void,
): Internal.FileIterator {
  const busboyAsyncIterator = busboyIterator[Symbol.asyncIterator]();

  const next = async (): Promise<IteratorResult<Internal.File, undefined>> => {
    try {
      const iterElement = await busboyAsyncIterator.next();
    
      // `=== true` to narrow `boolean | undefined` to `boolean`
      return iterElement.done === true
        ? iterElement
        : {
          done: false,
          value: processBusboyFileEventPayload(iterElement.value, fileFieldConfig, fileCounter)
        };
    } catch (error) {
      throwFn(error as Error);
      return { done: true, value: undefined };
    }
  };

  const throwFn = (() => {
    /*
    Without the `thrown` flag, the following scenario:
  
    1. `filesLimit` event is emitted, maxTotalFileCount error is thrown
    2. THEN `partsLimit` event is emitted, maxTotalPartCount error is thrown
  
    will result in maxTotalPartCount error being thrown, instead of maxTotalFileCount.
    
    `thrown` flag and checks in every event listener acts as a locking mechanism.
    
    TODO: INVESTIGATE: Why does iterator.throw() not act like reject() in Promises?
    Why doesn't the first throw() "lock" the iterator?
    */
    let thrown = false;

    return async (error: Error): Promise<unknown> => {
      if (thrown) return;

      thrown = true;

      await cleanupFn?.();

      return busboyAsyncIterator.throw!(error);
    };
  })();

  return Object.create(
    busboyAsyncIterator,
    {
      next: { value: next },
      throw: { value: throwFn },
      return: { value: cleanupFn },
    }
  );
}

function processBusboyFileEventPayload(
  [field, stream, info]: BusboyFileEventPayload,
  { [field]: { maxFileByteLength, abortOnFileByteLengthLimit } }: Internal.FileFieldConfig,
  fileCounter: FileCounter,
): Internal.File {
  // FileCounter may throw, it's a Proxy!
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