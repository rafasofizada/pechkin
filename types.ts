import * as busboy from "busboy";
import { EventEmitter, Readable } from "stream";

export type ParserDependency = EventEmitter;

export type Fields = Record<string, string>;

export type BusboyFile = [field: string, stream: Readable, info: busboy.FileInfo];

export type PechkinFile = busboy.FileInfo & {
  field: string;
  stream: Readable;
  byteLength: Promise<number>;
};

export const DefaultField: unique symbol = Symbol('DefaultField');

export type FieldFileConfig = Partial<{
  maxFileByteLength: number;
  maxFileCount: number;
}>;

export type PerFieldFileConfig = Record<FieldSpecifier, FieldFileConfig>;

export type FieldSpecifier = string | typeof DefaultField;

export type FileFieldNameFilter = string[] | RegExp | ((field: string) => boolean);