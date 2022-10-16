import * as busboy from 'busboy';
import { IncomingMessage } from 'http';
import { EventEmitter, Readable } from 'stream';
import { on } from 'events';

export type Fields = Record<string, string>;
export type File = [name: string, stream: Readable, info: busboy.FileInfo];
type MapCb<T> = (file: File, index: number) => T;
export type AsyncIteratorFn = <T>(callback: MapCb<T>) => Promise<T[]>;
export type FilesAsyncIterableIterator = AsyncIterableIterator<File> & { iterate: AsyncIteratorFn };

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
export async function parseFormData(request: IncomingMessage): Promise<{
  fields: Fields,
  files: FilesAsyncIterableIterator,
}> {
  const parser = busboy({ headers: request.headers });

  const fields = createFieldsPromise(parser);
  const files = createFilesIterator(parser);
  
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

function createFilesIterator(ee: EventEmitter): FilesAsyncIterableIterator{
  const abortFiles = new AbortController();
  const fileIterator: AsyncIterableIterator<File> = on(ee, 'file', { signal: abortFiles.signal });

  ee
    .once('error', (error) => {
      return abortFiles.abort(error);
    })
    .once('finish', () => { 
      return fileIterator.return!();
    });

  const iterate: AsyncIteratorFn = async <T>(callback: MapCb<T>) => {
    let i = 0;
    const results: T[] = [];

    for await (const file of fileIterator) {
      results.push(callback(file, i));
      i += 1;
    }

    return results;
  }

  return Object.setPrototypeOf({ iterate }, fileIterator) as FilesAsyncIterableIterator;
}