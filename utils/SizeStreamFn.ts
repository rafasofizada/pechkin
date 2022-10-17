import { Duplex, Readable } from 'stream';
import { StreamFn } from './types';

export function SizeStreamFn(): StreamFn<number> {
  const resultEventName = 'byteLength';

  let byteLength = 0;

  const stream = Duplex.from(async function* (this: Duplex, source: Readable) {
    for await (const chunk of source) {
      byteLength += chunk.byteLength;
      yield chunk;
    }

    // TODO: Necessity?
    process.nextTick(() => this.emit(resultEventName, byteLength));
  });

  const result = new Promise<number>((resolve) => stream.once(resultEventName, resolve));

  return { stream, result };
}