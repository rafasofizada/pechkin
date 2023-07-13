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
  cleanupFn?: () => void,
): Internal.Files {
  const fileCounter = FileCounter(config);
  const busboyIterableIterator: BusboyFileIterator = on(parser, "file");

  const pechkinIterableIterator = Object.create(
    busboyIterableIterator,
    {
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
  onError?: () => Promise<unknown> | unknown,
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

      In case 1, onError() has already been run in throw(), but still it wouldn't hurt to run it again.
      In case 2 & 3, onError() hasn't been run ever, so we run it here.

      In all cases, we want to rethrow the error.
      */
      // TODO: if onError can return a promise, we should await it?
      // TODO: Pass error to onError?
      onError?.();
      throw error;
    }
  };
}

function throwFnFactory(busboyIterator: AsyncIterableIterator<BusboyFileEventPayload>) {
  /*
  events.on()[Symbol.asyncIterator]().throw() is NOT idempotent.
  Called multiple times with an error passed as an argument,
  the LAST error passed will be the one that is thrown.

  `thrown` flag is needed to provide idempotency.
  TODO: Test the effect of `thrown` flag on error order.
  */
  let thrown = false;

  return function throwFn(error: Error) {
    if (thrown) return;
    thrown = true;

    busboyIterator.throw!(error);
  };
}

function returnFnFactory(
  busboyIterator: AsyncIterableIterator<BusboyFileEventPayload>,
  cleanupFn?: () => Promise<unknown> | unknown,
) {
  return async function returnFn() {
    await cleanupFn?.();
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

  const lengthLimiter = new ByteLengthTruncateStream(maxFileByteLength, abortOnFileByteLengthLimit, field);
  const truncatedStream = stream.pipe(lengthLimiter);

  // stream.on('error', (error) => {
  //   truncatedStream.destroy(error);
  // });

  return {
    field,
    stream: truncatedStream,
    ...info,
  };
}

/*

> eIter = events.on(target, event, handler);

unconsumedEvents = [];
unconsumedPromises = [];
ERROR = null;
FINISHED = false;

--------------------------------------------
CASE:
- next() called BEFORE any event is emitted

for await (const event of eIter)
  eIter.next()
    unconsumedEvents.shift() // undefined
    unconsumedPromises.push(new Promise()) // uP = [ P0 ]
    <AWAIT 0> ...await uP[0]...

> busboy.emit('file')

eventHandler()
  unconsumedPromises.shift() // P0, uP = []
  P0.resolve(<result<event0>>) // { value: event0, done: false }

    <AWAIT 0 CONT> await P0 => { value: event0, done: false }

// IF throw() is called in this case, the P0 awaited by the for-await-of loop
// will reject and throw. OK. 

--------------------------------------------
CASE:
- next() called AFTER an 2 events has been emitted
- throw() called AFTER event1 has been emitted

> busboy.emit('file')

eventHandler()
  unconsumedPromises.shift() // undefined, =>
  unconsumedEvents.push(event1) // uE = [ event1 ]

> busboy.emit('partsLimit')
  > eIter.throw(new Error('partsLimit'))
    ERROR = new Error('partsLimit')

> busboy.emit('file')

eventHandler()
  unconsumedPromises.shift() // undefined, =>
  unconsumedEvents.push(event2) // uE = [ event1, event2 ]

for await (const event of eIter)
  eIter.next() // uE = [ event1, event2 ]
    unconsumedEvents.shift() // event1

Execution stack:
<event0>, <event1>, ..., <eventN>,
error check,  <-- throw() acts here
finished (return) check,
<promise0>, <promise1>, ..., <promiseN>
| 
|---- AbortSignal() acts here

*/