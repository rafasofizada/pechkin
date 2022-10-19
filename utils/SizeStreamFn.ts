import { Duplex, Readable } from 'stream';

import { StreamFn } from './types';
import { TypeSafeEventEmitter } from './TypeSafeEventEmitter';

const resultEvent = 'byteLength';
const limitEvent = 'limit';

export type SizeStreamEvents = {
  [limitEvent]: { limit: number, byteLength: number },
  [resultEvent]: number,
};

export function SizeStreamFn(limit: number = Infinity): StreamFn<SizeStreamEvents> {
  let byteLength = 0;

  const ee = new TypeSafeEventEmitter<SizeStreamEvents>();

  async function* generator (this: unknown, source: Readable) {
    for await (const chunk of source) {
      byteLength += chunk.byteLength;
      
      if (byteLength > limit) {
        ee.emit(limitEvent, { limit, byteLength });
      }

      yield chunk;
    }

    ee.emit(resultEvent, byteLength);
  }

  const stream = Duplex.from(generator);

  return { stream, on: ee.on.bind(ee) };
}