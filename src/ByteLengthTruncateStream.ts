import { Readable, Transform, TransformCallback } from 'stream';
import { FieldLimitError } from './error';

export class ByteLengthTruncateStream extends Transform {
  private _bytesWritten: number = 0;
  private _truncated: boolean = false;

  get bytesWritten(): number {
    return this._bytesWritten;
  }

  get truncated(): boolean {
    return this._truncated;
  }

  public on(event: 'byteLength', listener: (bytesWritten: number) => void): this;
  public on(event: 'close', listener: () => void): this;
  public on(event: 'data', listener: (chunk: any) => void): this;
  public on(event: 'end', listener: () => void): this;
  public on(event: 'error', listener: (err: Error) => void): this;
  public on(event: 'pause', listener: () => void): this;
  public on(event: 'readable', listener: () => void): this;
  public on(event: 'resume', listener: () => void): this;
  public on(event: 'close', listener: () => void): this;
  public on(event: 'drain', listener: () => void): this;
  public on(event: 'finish', listener: () => void): this;
  public on(event: 'pipe', listener: (src: Readable) => void): this;
  public on(event: 'unpipe', listener: (src: Readable) => void): this;
  public on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  constructor(
    private readonly limit: number,
    private readonly abortOnFileByteLengthLimit: boolean,
    private readonly field: string,
  ) {
    super();
  }

  // encoding = 'buffer': https://nodejs.org/api/stream.html#transform_transformchunk-encoding-callback
  public _transform(chunk: Buffer | string, encoding: BufferEncoding | 'buffer', callback: TransformCallback): void {
    if (this._truncated) {
      return callback();
    }

    const chunkBuffer = encoding === 'buffer'
      ? chunk as Buffer
      : Buffer.from(chunk as string, encoding);
    
    if (this._bytesWritten + chunkBuffer.byteLength > this.limit) {
      const truncatedChunk = chunkBuffer.subarray(0, this.limit - this._bytesWritten);
      this._bytesWritten += truncatedChunk.byteLength;
      this.push(truncatedChunk);

      if (this.abortOnFileByteLengthLimit) {
        return callback(new FieldLimitError('maxFileByteLength', this.field!, this.limit));
      } else {
        this._truncated = true;
        return callback();
      }
    } else {
      this.push(chunkBuffer);
      this._bytesWritten += chunkBuffer.byteLength;
      
      return callback();
    }
  }

  public _flush(callback: TransformCallback): void {
    this.emit('byteLength', this._bytesWritten);

    return callback();
  }
}

export type FileByteLengthInfo = {
  readBytes: number;
  truncated: boolean;
};