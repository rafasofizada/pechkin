import * as busboy from 'busboy';
import { IncomingMessage } from 'http';
import { EventEmitter, Readable } from 'stream';
import { on } from 'events';

export type Fields = Record<string, string>;
export type FileArgs = [name: string, stream: Readable, info: busboy.FileInfo];
export type Files = AsyncIterableIterator<FileArgs>;

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
  files: Files,
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

function createFilesIterator(ee: EventEmitter): Files {
  const abortFiles = new AbortController();
  const fileIterator: Files = on(ee, 'file', { signal: abortFiles.signal });

  ee
    .once('error', (error) => {
      return abortFiles.abort(error);
    })
    .once('finish', () => { 
      return fileIterator.return!();
    });

  return fileIterator;
}