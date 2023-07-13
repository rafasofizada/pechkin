import { Transform, TransformCallback } from 'stream';
import { FieldLimitError } from './error';

export class ByteLengthTruncateStream extends Transform {
  private _bytesRead: number = 0;
  private _bytesWritten: number = 0;
  private _truncated: boolean = false;

  get bytesRead(): number {
    return this._bytesRead;
  }

  get bytesWritten(): number {
    return this._bytesWritten;
  }

  get truncated(): boolean {
    return this._truncated;
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
    const chunkBuffer = encoding === 'buffer'
      ? chunk as Buffer
      : Buffer.from(chunk as string, encoding);

    this._bytesRead += chunkBuffer.byteLength;

    if (this._truncated) {
      return callback();
    }
    
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
}