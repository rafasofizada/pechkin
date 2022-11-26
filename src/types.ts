import * as busboy from "busboy";
import { EventEmitter, Readable } from "stream";
import { FileByteLengthInfo } from "./ByteLengthTruncateStream";

export type ParserDependency = EventEmitter;

export type Fields = Record<string, string>;

export type BusboyFile = [field: string, stream: Readable, info: busboy.FileInfo];

export type PechkinFile =
  & busboy.FileInfo
  & {
    field: string;
    byteLength: Promise<FileByteLengthInfo>;
  }
  & (
    | {
        skipped: false;
        stream: Readable;
      }
    | {
        skipped: true;
        stream: null;
      }
  );

export type PechkinConfig = {
  base: Partial<Limits>;
  fileOverride?: Record<string, Partial<FileFieldLimits>>;
};

export type RequiredPechkinConfig = {
  base: Limits;
  fileOverride?: Record<string, FileFieldLimits>;
};

export type Limits = {                     
  maxTotalHeaderPairs: number;
  maxFieldKeyByteLength: number;
  maxFieldValueByteLength: number;
  maxFileByteLength: number;
  maxTotalFieldCount: number;
  maxTotalFileCount: number;
  maxTotalPartCount: number;
  maxTotalFileFieldCount: number;
  maxFileCountPerField: number;
  abortOnFileCountPerFieldLimit: boolean;
  abortOnFileByteLengthLimit: boolean;          
};

export type FileFieldLimits = Pick<Limits, "maxFileByteLength" | "maxFileCountPerField" | "abortOnFileCountPerFieldLimit" | "abortOnFileByteLengthLimit">;