import { Duplex, EventEmitter, Readable } from 'stream';

import { StreamFn } from './types';

export function SizeStreamFn(): StreamFn<number> {
  const resultEventName = 'byteLength';

  let byteLength = 0;

  const ee = new EventEmitter();

  async function* generator (this: unknown, source: Readable) {
    for await (const chunk of source) {
      byteLength += chunk.byteLength;
      yield chunk;
    }

    ee.emit(resultEventName, byteLength);
  }

  const stream = Duplex.from(generator);
  const result = new Promise<number>((resolve, reject) => {
    ee.once(resultEventName, resolve);
    stream.once('error', reject);
  });

  return { stream, result };
}