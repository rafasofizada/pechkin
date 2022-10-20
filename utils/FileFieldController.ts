import { Duplex } from "stream";

import { ByteLengthStreamFn } from '.';
import { FieldFileConfig, BusboyFile, PechkinFile } from "../types";

export class FileFieldController {
  static fileCountPerField: Record<string, number> = {};

  constructor(private readonly config: FieldFileConfig) {}

  fromBusboyFile([field, stream, info]: BusboyFile): PechkinFile {
    FileFieldController.fileCountPerField[field] ??= 0;
    FileFieldController.fileCountPerField[field] += 1;

    if (FileFieldController.fileCountPerField[field] > this.config.maxFileCount) {
      // TODO: error
      throw new Error("Exceeded file count per field limit.");
    }

    const { stream: transformStream, byteLength } = this.byteLength();

    return {
      field,
      stream: stream.pipe(transformStream),
      byteLength,
      ...info,
    }
  }

  private byteLength(): { stream: Duplex, byteLength: Promise<number> } {
    const { stream, once } = ByteLengthStreamFn(this.config.maxFileByteLength);

    return {
      stream,
      byteLength: new Promise((resolve, reject) => {
        once('byteLength', resolve);
        // TODO: Error
        once('limit', (payload) => reject(payload))
      })
    }
  }
}