import { Transform, TransformCallback } from 'stream';

import { SafeEventEmitter } from './SafeEventEmitter';

export class ByteLengthTruncateStream extends Transform {
  public readonly byteLengthEvent: Promise<FileByteLengthInfo>;

  private readonly ee: SafeEventEmitter<ByteLengthStreamEvents>;
  private truncated: boolean = false;
  private readBytes: number = 0;

  constructor(private readonly maxByteLength: number) {
    super();

    this.ee = new SafeEventEmitter();

    // Snapshot state on 'byteLength'. `this.truncated` and `this.readBytes` are primitives, so we don't need to worry about
    // them changing after the event is emitted.
    this.byteLengthEvent = new Promise((resolve) => {
      this.ee.on('byteLength', () => {
        return resolve({
          truncated: this.truncated,
          readBytes: this.readBytes,
        });
      });
    });
  }

  // encoding = 'buffer': https://nodejs.org/api/stream.html#transform_transformchunk-encoding-callback
  public _transform(chunk: Buffer | string, encoding: BufferEncoding | 'buffer', callback: TransformCallback): void {
    if (this.truncated) {
      return callback();
    }

    const chunkBuffer = encoding === 'buffer'
      ? chunk as Buffer
      : Buffer.from(chunk as string, encoding);
    
    if (this.readBytes + chunkBuffer.byteLength > this.maxByteLength) {
      const truncatedChunk = chunkBuffer.subarray(0, this.maxByteLength - this.readBytes);
      this.readBytes += truncatedChunk.byteLength;
      this.truncated = true;

      this.ee.emit('byteLength', undefined);

      return callback(null, truncatedChunk);
    }

    this.readBytes += chunkBuffer.byteLength;
    return callback(null, chunk);
  }

  public _flush(callback: TransformCallback): void {
    this.ee.emit('byteLength', undefined);

    return callback();
  }
}

export type FileByteLengthInfo = {
  truncated: boolean;
  readBytes: number;
};

type ByteLengthStreamEvents = {
  byteLength: void;
};