import { on } from 'events';
import * as busboy from 'busboy';
import { IncomingMessage } from 'http';

import { FileHandler } from './FileHandler';
import { PechkinError } from './error';
import { Restrictions, restrictionsToBusboyLimits } from './restrictions';
import { BusboyFile, Fields, ParserDependency, PechkinFile } from './types';

// TODO: Runtime checks, runtime config check
// TODO: "throw (Promise.all) or ignore (Promise.allSettled)" configuration
export async function parseFormData(
  request: IncomingMessage,
  restrictions: Restrictions,
  busboyConfig: Omit<busboy.BusboyConfig, 'headers' | 'limits'> = {}
): Promise<{
  fields: Fields,
  files: FileIterator,
}> {
  const parser = busboy({
    ...busboyConfig,
    headers: request.headers,
    limits: restrictionsToBusboyLimits(restrictions)
  });

  const fields = FieldsPromise(parser);
  const files = new FileIterator(parser, restrictions);
  
  request.pipe(parser);

  // Don't throw on rejections, just return typed Error class
  return { fields: await fields, files };
}

function FieldsPromise(parser: ParserDependency): Promise<Fields> {
  return new Promise<Fields>((resolve, reject) => {
    const fields: Fields = {};

    parser
      // TODO: control "truncated" props
      .on('field', (name: string, value: string, info: busboy.FieldInfo) => {
        fields[name] = value;
      })
      .once('file', () => {
        return resolve(fields);
      })
      .once('partsLimit', () => {
        // TODO: Error
        return reject(PechkinError("maxTotalPartCount"));
      })
      .once('fieldsLimit', () => {
        // TODO: Error
        return reject(PechkinError("maxTotalFieldCount"));
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
  private readonly iterator: AsyncIterableIterator<BusboyFile>;
  private readonly fileHandlers: Record<string, FileHandler> = {};

  constructor(
    parser: ParserDependency,
    private readonly restrictions: Restrictions,
  ) {
    const abortFiles = new AbortController();
    // TODO: on() source code, determine role and necessity of AbortController
    this.iterator = on(parser, 'file', { signal: abortFiles.signal });

    parser
      .once('partsLimit', () => {
        // TODO: Error
        return abortFiles.abort(PechkinError("maxTotalPartCount"));
      })
      .once('filesLimit', () => {
        // TODO: Error
        return abortFiles.abort(PechkinError("maxTotalFileCount"));
      })
      .once('error', (error) => {
        return abortFiles.abort(error);
      })
      .once('finish', () => { 
        return this.iterator.return!();
      });
  }

  [Symbol.asyncIterator](): AsyncIterator<PechkinFile> {
    const asyncIterator = this.iterator[Symbol.asyncIterator]();

    const next: AsyncIterator<PechkinFile>['next'] = async () => {
      // asyncIterator.next() returned by Events.on() accepts no args
      // https://github.com/nodejs/node/blob/main/lib/events.js#L1017
      const result = await asyncIterator.next();
      
      return {
        done: result.done,
        // === true necessary to narrow IteratorResult to IteratorYieldResult
        // TODO: Research/report issue to TypeScript?
        value: result.done === true ? undefined : this.handle(result.value)
      };
    }
    
    return Object.setPrototypeOf(
      { next },
      asyncIterator,
    )
  }

  private handle([field, stream, info]: BusboyFile) {
    this.fileHandlers[field] ??= new FileHandler(field, this.restrictions);
    const fileHandler = this.fileHandlers[field];

    fileHandler.fileCountControl();

    return {
      field,
      ...fileHandler.byteLength(stream),
      ...info,
    };
  }
}