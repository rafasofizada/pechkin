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
  skipped: false;
} | {
  stream: null;
  skipped: true;
});