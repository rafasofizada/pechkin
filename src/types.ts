import * as busboy from "busboy";
import { ByteLengthTruncateStream } from "./ByteLengthTruncateStream";

export namespace Internal {
  export type Fields = Record<string, string>;

  export type File = busboy.FileInfo & {
    field: string;
    stream: ByteLengthTruncateStream;
  };

  export type Files = Required<AsyncIterableIterator<File>>;

  export type FileIterator = Required<AsyncIterator<File>>;

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

  export const BaseConfig = Symbol('BaseConfig');

  export type BaseConfig = typeof BaseConfig;

  export type FileFieldConfig = Record<string, Config>;

  export type CombinedConfig = Record<string | BaseConfig, Internal.Config>;

  export type FileFieldSpecificConfig = Pick<Config, "maxFileByteLength" | "maxFileCountPerField" | "abortOnFileByteLengthLimit">;

  export type FileFieldConfigOverride = Record<string, Partial<FileFieldSpecificConfig>>;

  export type CleanupFn = (error?: Error) => unknown;
};