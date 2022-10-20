import * as busboy from 'busboy';
import { IncomingMessage } from 'http';
import { on } from 'events';

import { FileFieldController } from './utils';
import { busboyConfig, CustomBusboyConfig } from './busboy-config';
import { BusboyFile, DefaultField, Fields, FileFieldNameFilter, ParserDependency, PechkinFile, PerFieldFileConfig } from './types';

export async function parseFormData(
  request: IncomingMessage,
  perFieldFileConfig: PerFieldFileConfig = defaultPerFieldFileConfig,
  fileFieldNameFilter: FileFieldNameFilter = () => true,
  busboySpecificConfig?: CustomBusboyConfig,
): Promise<{
  fields: Fields,
  files: FileIterator,
}> {
  const parser = busboy(
    busboyConfig(request.headers, busboySpecificConfig)
  );

  const fields = FieldsPromise(parser);
  const files = new FileIterator(parser, perFieldFileConfig, fileFieldNameFilter);
  
  request.pipe(parser);

  return { fields: await fields, files };
}

function FieldsPromise(parser: ParserDependency): Promise<Fields> {
  return new Promise<Fields>((resolve, reject) => {
    const fields: Fields = {};

    parser
      .on('field', (name: string, value: string, info: busboy.FieldInfo) => {
        fields[name] = value;
      })
      .once('file', () => {
        return resolve(fields);
      })
      .once('fieldsLimit', () => {
        // TODO: Error
        return reject("Exceeded field count limit.");
      })
      .once('partsLimit', () => {
        // TODO: Error
        return reject("Exceeded part count limit.");
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

  constructor(
    parser: ParserDependency,
    private readonly perFieldFileConfig: PerFieldFileConfig,
    private readonly fileFieldNameFilter: FileFieldNameFilter,
  ) {
    const abortFiles = new AbortController();
    // TODO: on() source code, determine role and necessity of AbortController
    this.iterator = on(parser, 'file', { signal: abortFiles.signal });

    parser
      .once('filesLimit', () => {
        // TODO: Error
        return abortFiles.abort("Exceeded files count limit.");
      })
      .once('partsLimit', () => {
        // TODO: Error
        return abortFiles.abort("Exceeded part count limit.");
      })
      .once('error', (error) => {
        return abortFiles.abort(error.message);
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
      
      // === true necessary to narrow IteratorResult to IteratorYieldResult
      // TODO: Report issue to TypeScript?
      if (result.done === true) {
        // if result.done === true, result.value === undefined
        return { value: undefined, done: true };
      }

      return {
        done: result.done,
        value: this.processBusboyFile(result.value)
      };
    }
    
    return Object.setPrototypeOf(
      { next },
      asyncIterator,
    )
  }

  private processBusboyFile(busboyFile: BusboyFile) {
    const fileFieldConfig = this.perFieldFileConfig[busboyFile[0]] ?? this.perFieldFileConfig[DefaultField];
    const fileFieldController = new FileFieldController(fileFieldConfig)

    return fileFieldController.fromBusboyFile(busboyFile);
  }
}

const defaultPerFieldFileConfig: PerFieldFileConfig = {
  [DefaultField]: {
    maxFileByteLength: 50 * 1024 * 1024, // 50 Mb
    maxFileCount: 5,
  }
};