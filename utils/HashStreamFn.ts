import { Duplex, EventEmitter, Readable } from 'stream';
import { createHash, Hash } from 'crypto';

import { StreamFn } from './types';

export function HashStreamFn(algorithm: string): StreamFn<Buffer> {
  const resultEventName = 'hash';

  const hashInstance: Hash = createHash(algorithm);

  const ee = new EventEmitter();

  const stream = Duplex.from(async function* (this: Duplex, source: Readable) {
    for await (const chunk of source) {
      hashInstance.update(chunk);
      yield chunk;
    }

    ee.emit(resultEventName, hashInstance.digest());
  });

  const result = new Promise<Buffer>((resolve, reject) => {
    ee.once(resultEventName, resolve);
    stream.once('error', reject);
  })

  return { stream, result };
}