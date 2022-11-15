import * as busboy from "busboy";
import { EventEmitter, Readable } from "stream";

export type ParserDependency = EventEmitter;

export type Fields = Record<string, string>;

export type BusboyFile = [field: string, stream: Readable, info: busboy.FileInfo];

export type PechkinFile = busboy.FileInfo & {
  field: string;
  byteLength: Promise<number>; // NaN if skipped === true
} & ({
  stream: Readable;
  truncated: Promise<TruncationInfo>;
  skipFile: () => void;
  skipped: false;
} | {
  stream: null;
  truncated?: undefined;
  skipFile?: undefined;
  skipped: true;
});

export type PechkinConfig = {
  base: Partial<Limits>;
  fileOverride?: Record<string, Partial<FileFieldLimits>>;
};

export type RequiredPechkinConfig = {
  base: Limits;
  fileOverride?: Record<string, FileFieldLimits>;
};

export type Limits = {                                    // PECHKIN DEFAULT      BUSBOY ANALOG       BUSBOY DEFAULT
  maxTotalHeaderPairs:             number;                //            2000      "headerPairs"                 2000
  maxFieldKeyByteLength:           number;                //       100 bytes      "fieldNameSize"          100 bytes
  maxFieldValueByteLength:         number;                //            1 MB      "fieldSize"                   1 MB
  maxFileByteLength:               number;                //           50 MB      "fileSize"                Infinity
  maxTotalFieldCount:              number;                //             100      "fields"                  Infinity
  maxTotalFileCount:               number;                //              10      "files"                   Infinity
  maxTotalPartCount:               number;                //  100 + 10 = 110      "parts"                   Infinity 
  maxTotalFileFieldCount:          number;                //               1
  maxFileCountPerField:            number;                //               1
  onFileCountPerFieldLimit:        "throw" | "skip";      //           throw      
  onFileByteLengthLimit:           "throw" | "truncate";  //           throw      stream.truncated,
                                                          //                      "limit"                  
};

export type FileFieldLimits = Pick<Limits, "maxFileByteLength" | "maxFileCountPerField" | "onFileCountPerFieldLimit" | "onFileByteLengthLimit">;

export type TruncationInfo = {
  maxByteLength: number;
  readBytes: number;
  lastChunkByteLength: number;
};