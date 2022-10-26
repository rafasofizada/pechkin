import { Transform, TransformCallback } from 'stream';

import { SafeEventEmitter } from "./SafeEventEmitter";

// TODO:
// 'limit' –> 'truncated'
// Return { byteLength, truncated } instead of byteLength

export class ByteLengthTruncateStream extends Transform {
  public result: Promise<
    | { event: 'limit', value: ByteLengthStreamEvents['limit'] }
    | { event: 'byteLength', value: ByteLengthStreamEvents['byteLength'] }
  >;

  private readonly ee: SafeEventEmitter<ByteLengthStreamEvents>;
  private truncated: boolean = false;
  private readBytes: number = 0;

  constructor(private readonly maxByteLength: number) {
    super();

    this.ee = new SafeEventEmitter();

    // Event listeners (.once()) need to be registered as soon as possible, preferrably during initialization, to guarantee that they catch events in _transform
    this.result = new Promise((resolve) => {
      this.ee.once('limit', (limitInfo) => resolve({ event: 'limit', value: limitInfo }));
      this.ee.once('byteLength', (byteLength) => resolve({ event: 'byteLength', value: byteLength }));
    });
  }

  // encoding = 'buffer': https://nodejs.org/api/stream.html#transform_transformchunk-encoding-callback
  public _transform(chunk: Buffer | string, encoding: BufferEncoding | 'buffer', callback: TransformCallback): void {
    const buffer = encoding === 'buffer'
      ? chunk as Buffer
      : Buffer.from(chunk as string, encoding);

    this.readBytes += buffer.byteLength;

    if (this.readBytes > this.maxByteLength) {
      if (this.truncated) {
        return callback();
      }

      this.truncated = true;
      const truncatedChunk = buffer.subarray(0, this.maxByteLength - this.readBytes);

      this.ee.emit('limit', {
        maxByteLength: this.maxByteLength,
        readBytes: this.readBytes,
        lastChunkByteLength: buffer.byteLength
      });

      // TODO: why does this.end() halt the stream?
      this.readBytes += truncatedChunk.byteLength;

      return callback(null, truncatedChunk);
    }

    return callback(null, chunk);
  }

  public _flush(callback: TransformCallback): void {
    this.ee.emit('byteLength', this.readBytes);

    return callback();
  }
}

type ByteLengthStreamEvents = {
  limit: { maxByteLength: number, readBytes: number, lastChunkByteLength: number },
  byteLength: number,
};