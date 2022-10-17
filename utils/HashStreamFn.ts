import { Duplex, Readable } from 'stream';
import { createHash, Hash } from 'crypto';
import { StreamFn } from './types';

export function HashStreamFn(algorithm: string): StreamFn<Buffer> {
  const resultEventName = 'hash';

  const hashInstance: Hash = createHash(algorithm);

  const stream = Duplex.from(async function* (this: Duplex, source: Readable) {
    for await (const chunk of source) {
      hashInstance.update(chunk);
      yield chunk;
    }

    // TODO: Necessity?
    process.nextTick(() => this.emit(resultEventName, hashInstance.digest()));
  });

  const result = new Promise<Buffer>((resolve) => stream.once(resultEventName, resolve));

  return { stream, result };
}