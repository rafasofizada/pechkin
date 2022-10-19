import * as busboy from 'busboy';
import { IncomingMessage } from 'http';
import { EventEmitter, Readable } from 'stream';
import { on } from 'events';

import { SizeStreamFn } from './utils';

export type Fields = Record<string, string>;
export type File = [field: string, stream: Readable, info: busboy.FileInfo];
type MapCb<T> = (file: File, index: number) => T;
export type AsyncIteratorFn = <T>(callback: MapCb<T>) => Promise<T[]>;

/**
 * Or ?:
 *    - const fields
 *    - const files
 * 
 *    + process.nextTick(() => request.pipe(parser));
 *    + return {
 *    +   fields: await fields(),
 *    +   files: files(),
 *    + };
 */
export async function parseFormData(
  request: IncomingMessage,
  baseFileSizeLimit: number = Infinity,
  fieldFileSizeLimits: Record<string, number> = {},
  underlyingParserConfig: busboy.BusboyConfig = {},
): Promise<{
  fields: Fields,
  files: FileIterator,
}> {
  const headers = underlyingParserConfig.headers ?? request.headers;
  const parser = busboy({
    ...underlyingParserConfig,
    headers
  });

  const fields = createFieldsPromise(parser);
  const files = new FileIterator(parser, baseFileSizeLimit, fieldFileSizeLimits);
  
  request.pipe(parser);

  return { fields: await fields, files };
}

function createFieldsPromise(ee: EventEmitter): Promise<Fields> {
  return new Promise<Fields>((resolve, reject) => {
    const fields: Fields = {};

    ee
      .on('field', (name: string, value: string, info: busboy.FieldInfo) => {
        fields[name] = value;
      })
      .once('file', () => {
        return resolve(fields);
      })
      .once('error', (error) => {
        return reject(error);
      })
      .once('finish', () => { 
        return resolve(fields);
      });
  });
}

class FileIterator {
  private readonly iterator: AsyncIterableIterator<File>;

  constructor(
    parser: EventEmitter,
    private readonly baseFileSizeLimit: number,
    private readonly fieldFileSizeLimits: Record<string, number>,
  ) {
    const abortFiles = new AbortController();
    this.iterator = on(parser, 'file', { signal: abortFiles.signal });

    parser
      .once('error', (error) => {
        return abortFiles.abort(error);
      })
      .once('finish', () => { 
        return this.iterator.return!();
      });
  }

  [Symbol.asyncIterator](): AsyncIterator<{ field: string, stream: Readable, size: Promise<number> } & busboy.FileInfo> {
    const asyncIterator = this.iterator[Symbol.asyncIterator]();

    const next = async () => {
      // asyncIterator.next() returned by Events.on() accepts no args
      // https://github.com/nodejs/node/blob/main/lib/events.js#L1017
      const result = await asyncIterator.next();
      
      // === true necessary to narrow IteratorResult to IteratorYieldResult
      // TODO: Report issue to TypeScript?
      if (result.done === true) {
        return result;
      }

      const { value: [field, stream, info] } = result;

      const sizeStreamFn = SizeStreamFn(this.fieldFileSizeLimits[field] ?? this.baseFileSizeLimit);
      const finalStream = stream.pipe(sizeStreamFn.stream);

      return {
        done: result.done,
        value: {
          field,
          stream: finalStream,
          size: new Promise((resolve, reject) => {
            sizeStreamFn.on('byteLength', resolve);
            sizeStreamFn.on('limit', reject)
          }),
          ...info,
        }
      };
    }
    
    return Object.setPrototypeOf(
      { next },
      asyncIterator,
    )
  }
}