import { Duplex, Readable } from "stream";

import { ByteLengthStreamFn } from './ByteLengthStreamFn';
import { FieldRestrictionError } from "./error";
import { Restrictions } from './restrictions';


export class FileHandler {
  private fileCount: number = 0;
  private readonly maxFileByteLength: number;
  private readonly maxFileCount: number;

  constructor(private readonly field: string, { general, fileOverride }: Restrictions) {
    // TODO: Runtime checks, runtime config check

    this.maxFileByteLength =
        fileOverride?.[field]?.maxFileByteLength
        ?? general.maxFileByteLength;

    this.maxFileCount =
        fileOverride?.[field]?.maxFileCount
        ?? general.maxFileCountPerField
        ?? general.maxTotalFileCount
        ?? general.maxTotalPartCount
        ?? Infinity;
  }

  fileCountControl() {
    this.fileCount += 1;

    if (this.fileCount > this.maxFileCount) {
      throw new FieldRestrictionError("maxFileCountPerField", this.field, this.maxFileCount);
    }
  }

  byteLength(inputStream: Readable): { stream: Duplex, byteLength: Promise<number> } {
    const { stream: byteLengthStream, events } = ByteLengthStreamFn(this.maxFileByteLength);

    return {
      stream: inputStream.pipe(byteLengthStream),
      byteLength: new Promise((resolve, reject) => {
        events.byteLength.then(resolve);
        events.limit.then(() => reject(new FieldRestrictionError("maxFileByteLength", this.field, this.maxFileCount)));
      })
    }
  }
}