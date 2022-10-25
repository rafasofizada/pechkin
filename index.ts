import { on } from 'events';
import * as busboy from 'busboy';
import { IncomingMessage } from 'http';

import { FieldRestrictionError, TotalRestrictionError } from './error';
import { FileRestrictions, Restrictions, restrictionsToBusboyLimits } from './restrictions';
import { BusboyFile, Fields, ParserDependency, PechkinFile } from './types';
import { PassThrough } from 'stream';
import { trackStreamByteLength } from './ByteLengthStreamFn';

// TODO: FILE FILTERING
// TODO: Runtime checks, runtime config check
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
  private readonly fileCountPerField: Record<string, number> = {};

  constructor(
    parser: ParserDependency,
    private readonly restrictions: Restrictions,
  ) {
    this.setDefaults();

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
      .once('finish', () => { 
        return this.iterator.return!();
      });
  }

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

      return { done: false, value: this.handle(iterElement.value) };
    }
    
    return { next, __proto__: asyncIterator } as AsyncIterator<PechkinFile>;
  }

  private handle([field, stream, info]: BusboyFile): PechkinFile {
    const maxFileByteLength = this.getFileConfigValue("maxFileByteLength", field, Infinity);
    const maxFileCount = this.getFileConfigValue("maxFileCountPerField", field, 1);
    const throwOnExceededCountPerField = this.getFileConfigValue("throwOnExceededCountPerField", field, true);

    this.fileCountPerField[field] ??= 0;
    this.fileCountPerField[field] += 1;
    
    if (this.fileCountPerField[field] > maxFileCount) {
      stream.resume();

      // TODO: Move to iterator?
      if (throwOnExceededCountPerField) {
        throw new FieldRestrictionError("maxFileCountPerField", field, maxFileCount);
      }

      // TODO: Move to iterator?
      return {
        field,
        stream: null,
        byteLength: Promise.resolve(NaN),
        skipped: true,
        ...info,
      }
    }

    const wrappedStream: PassThrough = stream.pipe(new PassThrough());
    
    const byteLength = new Promise<number>((resolve, reject) => {
      const onByteLengthEvent = trackStreamByteLength(wrappedStream, maxFileByteLength);

      onByteLengthEvent('byteLength', (x) => resolve(x));
      // TODO: Configure throw or skip
      onByteLengthEvent('maxByteLength', (errorPayload) => reject(new FieldRestrictionError(
        "maxFileByteLength",
        field,
        `{ ${Object.entries(errorPayload).map(entry => entry.join(": ")).join(", ")} }`
      )));
    })

    return {
      field,
      stream: wrappedStream,
      byteLength,
      skipped: false,
      ...info,
    };
  }

  private getFileConfigValue<K extends keyof FileRestrictions, V extends FileRestrictions[K]>(key: K, field: string, defaultValue?: V): V {
    // TODO: Move default values to general config
    return (this.restrictions.fileOverride?.[field]?.[key] ?? this.restrictions.base?.[key] ?? defaultValue) as V;
  }

  private setDefaults(): void {
    this.restrictions.base = {
      maxFileByteLength: Infinity,
      maxFileCountPerField: 1,
      throwOnExceededCountPerField: true,
      ...this.restrictions.base,
    };
  }
}