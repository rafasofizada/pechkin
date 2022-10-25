import { Transform, TransformCallback } from 'stream';

import { SafeEventEmitter } from "./SafeEventEmitter";

export class ByteLengthTruncateStream extends Transform {
  public byteLength: Promise<number>;

  private readonly byteLengthEventEmitter: SafeEventEmitter<ByteLengthStreamEvents>;
  private truncated: boolean = false;
  private readBytes: number = 0;

  constructor(private readonly maxByteLength: number) {
    super();

    this.byteLengthEventEmitter = new SafeEventEmitter();

    this.byteLength = new Promise<number>((resolve, reject) => {
      this.byteLengthEventEmitter.once('result', resolve);
      this.byteLengthEventEmitter.once('limit', reject);
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

      this.byteLengthEventEmitter.emit('limit', {
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
    this.byteLengthEventEmitter.emit('result', this.readBytes);

    return callback();
  }
}

type ByteLengthStreamEvents = {
  limit: { maxByteLength: number, readBytes: number, lastChunkByteLength: number },
  result: number,
};