import { Duplex, Readable } from 'stream';

import { StreamFn } from './StreamFn';
import { TypeSafeEventEmitter } from './TypeSafeEventEmitter';

const resultEvent = 'byteLength';
const limitEvent = 'limit';

export type ByteLengthStreamEvents = {
  [limitEvent]: { limit: number, byteLength: number },
  [resultEvent]: number,
};

export function ByteLengthStreamFn(limit: number = Infinity): StreamFn<ByteLengthStreamEvents> {
  let byteLength = 0;

  const ee = new TypeSafeEventEmitter<ByteLengthStreamEvents>();

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

  return { stream, once: ee.once.bind(ee) };
}