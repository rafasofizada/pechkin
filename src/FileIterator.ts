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
  config: Internal.CombinedConfig,
  cleanupFn?: () => void,
): Internal.Files {
  const busboyIterator: AsyncIterableIterator<BusboyFileEventPayload> = on(parser, "file");
  
  const asyncIterator = BusboyIteratorWrapper(busboyIterator, config, cleanupFn);

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

  // for-await-of loop calls [Symbol.asyncIterator]
  return Object.create(asyncIterator, { [Symbol.asyncIterator]: { value: () => asyncIterator } });
}

function BusboyIteratorWrapper(
  busboyIterable: BusboyFileIterator,
  config: Internal.CombinedConfig,
  cleanupFn?: () => void,
): Internal.FileIterator {
  const fileCounter = FileCounter(config);
  const busboyIterator = busboyIterable[Symbol.asyncIterator]();

  return Object.create(
    busboyIterator,
    {
      next: { value: nextFnFactory(busboyIterable, config, fileCounter, cleanupFn) },
      throw: { value: throwFnFactory(busboyIterator) },
      return: { value: returnFnFactory(busboyIterator, cleanupFn) },
    }
  );
}

function nextFnFactory(
  busboyIterator: AsyncIterableIterator<BusboyFileEventPayload>,
  fileFieldConfig: Internal.FileFieldConfig,
  fileCounter: FileCounter,
  cleanupFn?: () => void,
) {
  return async function nextFn(): Promise<IteratorResult<Internal.File, undefined>> {
    try {
      const iterElement = await busboyIterator.next();
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
}

function throwFnFactory(busboyIterator: AsyncIterableIterator<BusboyFileEventPayload>) {
  /*
  events.on()[Symbol.asyncIterator]().throw() is NOT idempotent.
  Called multiple times with an error passed as an argument,
  the LAST error passed will be the one that is thrown.

  `thrown` flag is needed to provide idempotency.
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
  cleanupFn?: () => void,
) {
  return async function returnFn() {
    cleanupFn?.();
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