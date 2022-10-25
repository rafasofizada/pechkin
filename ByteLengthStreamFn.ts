import { Readable } from 'stream';

import { SafeEventEmitter } from "./SafeEventEmitter";

const resultEvent = 'byteLength';
const maxEvent = 'maxByteLength';

export const ByteLengthStreamEvents = {
  RESULT: resultEvent,
  MAX: maxEvent
} as const;

export function trackStreamByteLength(this: unknown, source: Readable, maxByteLength: number): SafeEventEmitter<ByteLengthStreamEvents>['once'] {
  let byteLength = 0;
  const ee = new SafeEventEmitter<ByteLengthStreamEvents>();

  source.pause();

  
  // TODO(IMPORTANT): Limit stream size?
  // TODO(SOLUTION): Write 'data' chunks from source to a final passthrough stream; when limit reached, truncate the last chunk, write it and end the stream (by `write(null)`).
  // https://github.com/seangarner/node-truncate-stream/blob/master/truncate-stream.js

  // TODO(IMPORTANT): Setting data listeners on a stream in flowing mode is not allowed. Use stream.pause() to switch to non-flowing mode first.
  // https://stackoverflow.com/a/51121956/6539857
  // Attaching a 'data' event listener to a stream that has not been explicitly paused will switch the stream into flowing mode. Data will then be passed as soon as it is available.
  // Solution: stream.pause()?
  source.on('data', (chunk) => {
    const buffer = Buffer.from(chunk);
    
    if (byteLength + buffer.byteLength > maxByteLength) {
      // TODO: Research stream.destroy() vs stream.unpipe() vs stream.end()
      // TODO: Test stream.destroy() on AWS S3
      ee.emit(
        maxEvent,
        {
          maxByteLength,
          byteLengthBeforeLastChunk: byteLength,
          lastChunkByteLength: buffer.byteLength
        }
      );
    }

    byteLength += buffer.byteLength;
  });

  source.on('end', () => ee.emit(resultEvent, byteLength));

  // Turn into event promises to always bind event listeners on once()
  return ee.once.bind(ee);
}

type ByteLengthStreamEvents = {
  [maxEvent]: { maxByteLength: number, byteLengthBeforeLastChunk: number, lastChunkByteLength: number },
  [resultEvent]: number,
};