import * as busboy from "busboy";
import { Readable } from "stream";

import { FileByteLengthInfo } from "./ByteLengthTruncateStream";

export namespace Pechkin {
  export type Fields = Record<string, string>;

  export type File = busboy.FileInfo & {
    field: string;
    byteLength: Promise<FileByteLengthInfo>;
    stream: Readable;
  };

  export type BusboyConfig = Omit<busboy.BusboyConfig, 'headers' | 'config'>;

  export type Config = {                     
    maxTotalHeaderPairs: number;
    maxFieldKeyByteLength: number;
    maxFieldValueByteLength: number;
    maxFileByteLength: number;
    maxTotalFieldCount: number;
    maxTotalFileCount: number;
    maxTotalPartCount: number;
    maxTotalFileFieldCount: number;
    maxFileCountPerField: number;
    abortOnFileByteLengthLimit: boolean;          
  };

  export type FileFieldConfig = Pick<Config, "maxFileByteLength" | "maxFileCountPerField" | "abortOnFileByteLengthLimit">;
};