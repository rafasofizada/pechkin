import { Transform, TransformCallback } from 'stream';

import { SafeEventEmitter } from "./SafeEventEmitter";
import { TruncationInfo } from './types';

export class ByteLengthTruncateStream extends Transform {
  public readonly onTruncated: (listener: (payload: ByteLengthStreamEvents['truncated']) => void) => void;
  public readonly byteLengthEvent: Promise<ByteLengthStreamEvents['byteLength']>;

  private readonly ee: SafeEventEmitter<ByteLengthStreamEvents>;
  private truncated: boolean = false;
  private readBytes: number = 0;

  constructor(private readonly maxByteLength: number) {
    super();

    this.ee = new SafeEventEmitter();

    // Event listeners need to be registered as soon as possible (during initialization),
    // to guarantee that they catch events in _transform()
    this.onTruncated = this.ee.on.bind(this.ee, 'truncated');
    this.byteLengthEvent = this.ee.once('byteLength').then(([byteLength]) => byteLength);
  }

  // encoding = 'buffer': https://nodejs.org/api/stream.html#transform_transformchunk-encoding-callback
  public _transform(chunk: Buffer | string, encoding: BufferEncoding | 'buffer', callback: TransformCallback): void {
    const buffer = encoding === 'buffer'
      ? chunk as Buffer
      : Buffer.from(chunk as string, encoding);

    this.readBytes += buffer.byteLength;

    if (this.truncated) {
      return callback();
    }

    if (this.readBytes > this.maxByteLength) {
      this.truncated = true;
      const truncatedChunk = buffer.subarray(0, this.maxByteLength - this.readBytes);

      this.ee.emit('truncated', {
        maxByteLength: this.maxByteLength,
        readBytes: this.readBytes,
        lastChunkByteLength: buffer.byteLength
      });

      // TODO: why does `this.end()` halt the stream?
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
  truncated: TruncationInfo,
  byteLength: number,
};