import busboy from "busboy";
import { on, Readable } from "stream";

import { ByteLengthTruncateStream } from "./ByteLengthTruncateStream";
import { TotalLimitError } from "./error";
import { FileCounter } from "./FileCounter";
import { Internal } from "./types";

type BusboyFileEventPayload = [field: string, stream: Readable, info: busboy.FileInfo];

type BusboyFileIterator = AsyncIterableIterator<BusboyFileEventPayload>;

export function FileIterator(
  parser: busboy.Busboy,
  config: Internal.CombinedConfig,
  cleanupFn: Internal.CleanupFn,
): Internal.Files {
  const fileCounter = FileCounter(config);
  const busboyIterableIterator: BusboyFileIterator = on(parser, "file");

  const pechkinIterableIterator = Object.create(
    busboyIterableIterator,
    {
      /*
      Error handling:

      Errors inside next() DON'T cause return() (cleanup) to be performed
      Errors inside for-await-of body DO cause return() (cleanup) to be performed

      Throw() serves only as a signal for the subsequent next() call to throw the error
      and stop the iterator. for-await-of loop never calls throw() itself.
      */
      next: { value: nextFnFactory(busboyIterableIterator, config, fileCounter, cleanupFn), writable: true },
      throw: { value: throwFnFactory(busboyIterableIterator), writable: true },
      return: { value: returnFnFactory(busboyIterableIterator, cleanupFn), writable: true },
      // for-await-of loop calls [Symbol.asyncIterator]
      [Symbol.asyncIterator]: { value: () => pechkinIterableIterator, writable: true },
    }
  );

  /*
  AsyncIterableIterator interface's next(), return(), throw() methods are optional, however,
  from the Node.js source code for on(), the returned object always contains them.
  */
  parser
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols.
    .once('partsLimit', () => pechkinIterableIterator.throw!(new TotalLimitError("maxTotalPartCount")))
    .once('filesLimit', () => pechkinIterableIterator.throw!(new TotalLimitError("maxTotalFileCount")))
    .once('error', (error) => pechkinIterableIterator.throw!(error))
    .once('finish', () => pechkinIterableIterator.return!());

  return pechkinIterableIterator;
}

function nextFnFactory(
  busboyIterator: AsyncIterableIterator<BusboyFileEventPayload>,
  fileFieldConfig: Internal.FileFieldConfig,
  fileCounter: FileCounter,
  cleanupFn: Internal.CleanupFn,
) {
  return async function nextFn(): Promise<IteratorResult<Internal.File, undefined>> {
    try {
      const iterElement = await busboyIterator.next();

      if (iterElement.done) return iterElement;

      return {
        done: false,
        value: processBusboyFileEventPayload(iterElement.value, fileFieldConfig, fileCounter)
      };
    } catch (error) {
      /*
      Three possibilities of ending up here:
      1. busboyAsyncIterator.next() threw because we called throw() previously
      2. busboyAsyncIterator.next() encountered an error and threw "naturally"
      3. processBusboyFileEventPayload() threw (which shouldn't happen but whatever)

      In case 1, cleanupFn() has already been run in throw(), but still it wouldn't hurt to run it again.
      In case 2 & 3, cleanupFn() hasn't been run ever, so we run it here.

      In all cases, we want to rethrow the error.
      */
      // TODO: if onError can return a promise, we should await it?
      // TODO: Pass error to onError?
      cleanupFn();
      throw error;
    }
  };
}

/*
What:
throwFnFactory() adds error-idempotency on top of throw() using the `thrown` flag.

Why:
events.on()[Symbol.asyncIterator]().throw() by itself is NOT idempotent.
Called multiple times with an error passed as an argument,
the LAST error passed will be the one that is thrown.

TODO: Test the effect of `thrown` flag on error order.
*/
function throwFnFactory(busboyIterator: AsyncIterableIterator<BusboyFileEventPayload>) {
  let thrown = false;

  return function throwFn(error: Error) {
    if (thrown) return;
    thrown = true;
    busboyIterator.throw!(error);
  };
}

function returnFnFactory(
  busboyIterator: AsyncIterableIterator<BusboyFileEventPayload>,
  cleanupFn: Internal.CleanupFn,
) {
  return function returnFn() {
    cleanupFn();
    return busboyIterator.return!();
  };
}

function processBusboyFileEventPayload(
  [field, stream, info]: BusboyFileEventPayload,
  { [field]: { maxFileByteLength, abortOnFileByteLengthLimit } }: Internal.FileFieldConfig,
  fileCounter: FileCounter,
): Internal.File {
  // FileCounter may throw, it's a Proxy!
  fileCounter[field] += 1;

  const truncatedStream = new ByteLengthTruncateStream(maxFileByteLength, abortOnFileByteLengthLimit, field);

  stream
    .on('error', (error) => {
      error.message = `Error in busboy file stream: ${error.message}`;
      truncatedStream.destroy(error);
    })
    .pipe(truncatedStream);

  return {
    field,
    stream: truncatedStream,
    ...info,
  };
}

