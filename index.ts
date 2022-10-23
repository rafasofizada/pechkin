import { on } from 'events';
import * as busboy from 'busboy';
import { IncomingMessage } from 'http';

import { FieldRestrictionError, TotalRestrictionError } from './error';
import { Restrictions, restrictionsToBusboyLimits } from './restrictions';
import { BusboyFile, Fields, ParserDependency, PechkinFile } from './types';
import { PassThrough } from 'stream';
import { trackStreamByteLength } from './ByteLengthStreamFn';

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
    const abortFiles = new AbortController();
    this.iterator = on(parser, 'file', { signal: abortFiles.signal });

    parser
      .once('partsLimit', () => {
        // TODO: Config key enum
        return abortFiles.abort(new TotalRestrictionError("maxTotalPartCount"));
      })
      .once('filesLimit', () => {
        return abortFiles.abort(new TotalRestrictionError("maxTotalFileCount"));
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
      const iterElement = await asyncIterator.next();
      
      try {
        // === true to narrow down types
        // TODO: Research/report issue to TypeScript?
        if (iterElement.done === true) {
          return { done: true, value: undefined };
        }

        const result = this.handle(iterElement.value);

      } catch (error) {
        if (error instanceof FieldRestrictionError && error.restrictionType === "maxFileCountPerField") {
          
        }
      }
    }
    
    return { next, __proto__: asyncIterator } as AsyncIterator<PechkinFile>;
  }

  private handle([field, stream, info]: BusboyFile, throwOnExceededCountPerField: boolean = true): PechkinFile {
    const maxFileByteLength =
        this.restrictions.fileOverride?.[field]?.maxFileByteLength
        ?? this.restrictions.general.maxFileByteLength
        ?? Infinity;

    const maxFileCount =
        this.restrictions.fileOverride?.[field]?.maxFileCount
        ?? this.restrictions.general.maxFileCountPerField
        ?? Infinity;

    this.fileCountPerField[field] ??= 0;
    this.fileCountPerField[field] += 1;

    // - curr: 0, max: 0
    // - curr: 0, max: 1
    // - curr: 1, max: 10
    
    if (this.fileCountPerField[field] > maxFileCount) {
      stream.resume();

      if (throwOnExceededCountPerField) {
        throw new FieldRestrictionError("maxFileCountPerField", field, maxFileCount);
      }

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
      const onEvent = trackStreamByteLength(wrappedStream, maxFileByteLength);

      onEvent('byteLength', (x) => resolve(x));
      onEvent('maxByteLength', (errorPayload) => reject(new FieldRestrictionError(
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
}