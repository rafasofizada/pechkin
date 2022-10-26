import { on } from 'events';
import * as busboy from 'busboy';
import { IncomingMessage } from 'http';

import { FieldRestrictionError, TotalRestrictionError } from './error';
import { defaultRestrictions, FileRestrictions, Restrictions, restrictionsToBusboyLimits } from './restrictions';
import { BusboyFile, Fields, ParserDependency, PechkinFile } from './types';
import { ByteLengthTruncateStream } from './length';
import { Readable } from 'stream';

// TODO!!!: Return an IteratorResult instead of throwing an error

export async function parseFormData(
  request: IncomingMessage,
  restrictions?: Restrictions,
  busboyConfig?: Omit<busboy.BusboyConfig, 'headers' | 'limits'> & { headers?: busboy.BusboyConfig['headers'] }
): Promise<{
  fields: Fields,
  files: FileIterator,
}> {
  restrictions ??= defaultRestrictions;
  // Fill in the defaults
  restrictions.base = {
    ...restrictions.base,
    ...defaultRestrictions.base,
  };

  // Overwrite headers, but don't overwrite limits
  const parser = busboy({
    headers: request.headers,
    ...(busboyConfig ?? {}),
    limits: restrictionsToBusboyLimits(restrictions),
  });

  const fields = FieldsPromise(parser);
  const files = new FileIterator(parser, restrictions);
  
  request.pipe(parser);

  return { fields: await fields, files };
}

function FieldsPromise(parser: ParserDependency): Promise<Fields> {
  return new Promise<Fields>((resolve, reject) => {
    const fields: Fields = {};

    parser
      .on('field', (name: string, value: string, info: busboy.FieldInfo) => {
        if (info.nameTruncated) reject(new FieldRestrictionError("maxFieldKeyByteLength", name));
        if (info.valueTruncated) reject(new FieldRestrictionError("maxFieldValueByteLength", name));

        /* TODO: From Multer:
          // Work around bug in Busboy (https://github.com/mscdex/busboy/issues/6)
          if (limits && Object.prototype.hasOwnProperty.call(limits, 'fieldNameSize')) {
            if (fieldname.length > limits.fieldNameSize) return abortWithCode('LIMIT_FIELD_KEY')
          }
        */

        fields[name] = value;
      })
      .once('file', () => {
        return resolve(fields);
      })
      .once('partsLimit', () => {
        return reject(new TotalRestrictionError("maxTotalPartCount"));
      })
      .once('fieldsLimit', () => {
        return reject(new TotalRestrictionError("maxTotalFieldCount"));
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
  private readonly fileCountPerField = new FileCounter();

  constructor(
    parser: ParserDependency,
    private readonly restrictions: Restrictions,
  ) {
    // TODO: Why use AbortController?
    // const abortFiles = new AbortController();
    this.iterator = on(parser, 'file');

    parser
      .once('partsLimit', () => {
        // TODO: Config key enum
        return this.iterator.throw(new TotalRestrictionError("maxTotalPartCount"));
      })
      .once('filesLimit', () => {
        return this.iterator.throw(new TotalRestrictionError("maxTotalFileCount"))
      })
      .once('error', (error) => {
        return this.iterator.throw(error);
      })
      .once('close', () => { 
        return this.iterator.return!();
      });
  }

  // TODO: Typing - PechkinFile | { stream: null }
  [Symbol.asyncIterator](): AsyncIterator<PechkinFile> {
    const asyncIterator = this.iterator[Symbol.asyncIterator]();

    const next: AsyncIterator<PechkinFile>['next'] = async () => {
      // asyncIterator.next() returned by Events.on() accepts no args
      // https://github.com/nodejs/node/blob/main/lib/events.js#L1017
      const iterElement = await asyncIterator.next();
    
      // === true to narrow down types
      // TODO: Research/report issue to TypeScript?
      if (iterElement.done === true) {
        return { done: true, value: undefined };
      }

      const [field, stream, info] = iterElement.value;

      const maxFileCountForField = this.getFileConfigValue("maxFileCountPerField", field);
      const onExceededFileCountPerField = this.getFileConfigValue("onExceededFileCountPerField", field);

      if (this.fileCountPerField.increment(field) > maxFileCountForField) {
        stream.resume();
    
        if (onExceededFileCountPerField === "throw") {
          throw new FieldRestrictionError("maxFileCountPerField", field, maxFileCountForField);
        }
    
        return {
          stream: null,
          byteLength: Promise.resolve(NaN),
          skipped: true,
        };
      }

      if (this.fileCountPerField.fields.length > this.restrictions.base.maxTotalFileFieldCount) {
        throw new TotalRestrictionError("maxTotalFileFieldCount");
      }

      const maxFileByteLength = this.getFileConfigValue("maxFileByteLength", field);


      return { done: false, value: handleBusboyFileEvent(iterElement.value) };
    }
    
    return { next, __proto__: asyncIterator } as AsyncIterator<PechkinFile>;
  }

  private getFileConfigValue<K extends keyof FileRestrictions, V extends FileRestrictions[K]>(key: K, field: string): V {
    // TODO: Move default values to general config
    return (this.restrictions.fileOverride?.[field]?.[key] ?? this.restrictions.base[key]) as V;
  }
}

class FileCounter {
  private counter: Record<string, number> = {}

  get fields(): string[] {
    return Object.keys(this.counter);
  }

  increment(field: string): number {
    this.counter[field] ??= 0;
    this.counter[field] += 1;

    return this.counter[field];
  }
}

function processFileStream(stream: Readable, maxFileByteLength: number) {
  const truncateTransform = new ByteLengthTruncateStream(maxFileByteLength);
  const truncatedStream = stream.pipe(truncateTransform);

  // Add a listener for BusboyLimits.fileSize event ('limit')
  stream.addListener('limit', busboyLimitListener);
  // Remove the stream 'limit' listener
  const transformResult = truncateTransform.result.then((eventInfo) => {
    if (eventInfo.event === 'limit') {
      stream.removeListener('limit', busboyLimitListener);
    }

    return eventInfo;
  });

  return {
    stream: truncatedStream,
    transformResult,
  };
}

function skipFileStream(stream: Readable) {
  stream.resume();
}

function busboyLimitListener(...busboyArgs: unknown[]) {
  throw new Error(
    `Busboy 'limit' event. Busboy 'fileSize' limit set by restrictionsToBusboyLimits(), for some reason, was reached before Pechkin 'maxFileByteLength' was reached. This should not happen, please report this issue. Busboy args: ${JSON.stringify(busboyArgs)}`
  );
};