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
    Iterator protocol, as throw() rejects with an error, when by protocol it should
    reject with an IteratorResult.
    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols.
    */
    .once('partsLimit', () => asyncIterator.throw!(new TotalLimitError("maxTotalPartCount")))
    .once('filesLimit', () => asyncIterator.throw!(new TotalLimitError("maxTotalFileCount")))
    .once('error', (error) => asyncIterator.throw!(error))
    .once('finish', () => asyncIterator.return!());

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
  cleanupFn?: () => void,
): Internal.FileIterator {
  const busboyAsyncIterator = busboyIterator[Symbol.asyncIterator]();

  const nextFn = async (): Promise<IteratorResult<Internal.File, undefined>> => {
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
      /*
      Three possibilities of ending up here:
      1. busboyAsyncIterator.next() threw because we called throw() previously
      2. busboyAsyncIterator.next() encountered an error and threw "naturally"
      3. processBusboyFileEventPayload() threw (which shouldn't happen but whatever)

      In case 1, cleanupFn() has already been run in throw(), but still it wouldn't hurt to run it again.
      In case 2 & 3, cleanupFn() hasn't been run ever, so we run it here.

      In all cases, we want to rethrow the error.
      */
      cleanupFn?.();
      throw error;
    }
  };

  const throwFn = (() => {
    /*
    Without the `thrown` flag, the following scenario:
  
    1. `filesLimit` event is emitted, maxTotalFileCount error is thrown
    2. THEN `partsLimit` event is emitted, maxTotalPartCount error is thrown
  
    will result in maxTotalPartCount error being thrown, instead of maxTotalFileCount.
    
    `thrown` flag and checks in every event listener acts as a locking mechanism.
    
    Q:
    Why does iterator.throw() not act like reject() in Promises?
    Why doesn't the first throw() "lock" the iterator?

    A:
    throw() sets the local error variable inside events.on().
    The last call to throw() "wins" and sets the final error value.

    TODO: Can this be changed in Node.js?
    */
    let thrown = false;

    return (error: Error) => {
      if (thrown) return;
      thrown = true;

      cleanupFn?.();
      busboyAsyncIterator.throw!(error);
    };
  })();

  const returnFn = async () => {
    cleanupFn?.();
    return busboyAsyncIterator.return!() as Promise<IteratorReturnResult<undefined>>;
  };

  return Object.create(
    busboyAsyncIterator,
    {
      next: { value: nextFn },
      throw: { value: throwFn },
      return: { value: returnFn },
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