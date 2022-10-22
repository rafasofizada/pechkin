import { Duplex, Readable } from "stream";

import { ByteLengthStreamFn } from './ByteLengthStreamFn';
import { Restrictions } from './restrictions';


export class FileHandler {
  private count: number = 0;
  private maxFileByteLength: number;
  private maxFileCount: number;

  constructor(field: string, { general, fileOverride }: Restrictions) {
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
    this.count += 1;

    if (this.count > this.maxFileCount) {
      // TODO: error
      throw new Error("Exceeded file count per field limit.");
    }
  }

  byteLength(inputStream: Readable): { stream: Duplex, byteLength: Promise<number> } {
    const { stream: byteLengthStream, events } = ByteLengthStreamFn(this.maxFileByteLength);

    return {
      stream: inputStream.pipe(byteLengthStream),
      byteLength: new Promise((resolve, reject) => {
        events.byteLength.then(resolve);
        // TODO: Error
        events.limit.then(reject);
      })
    }
  }
}