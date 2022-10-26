import * as busboy from "busboy";
import { EventEmitter, Readable } from "stream";

export type ParserDependency = EventEmitter;

export type Fields = Record<string, string>;

export type BusboyFile = [field: string, stream: Readable, info: busboy.FileInfo];

export type PechkinFile = busboy.FileInfo & {
  field: string;
  stream: Readable;
  byteLength: Promise<number>;
  skipped: boolean;
};

export type PechkinSkippedFile = Omit<PechkinFile, "stream" | "byteLength"> & {
  stream: null;
  byteLength: Promise<number>;
};