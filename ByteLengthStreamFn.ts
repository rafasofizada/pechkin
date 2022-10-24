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

  // TODO: on('readable')
  source.on('data', (chunk) => {
    const buffer = Buffer.from(chunk);
    
    if (byteLength + buffer.byteLength > maxByteLength) {
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

  return ee.once.bind(ee);
}

type ByteLengthStreamEvents = {
  [maxEvent]: { maxByteLength: number, byteLengthBeforeLastChunk: number, lastChunkByteLength: number },
  [resultEvent]: number,
};