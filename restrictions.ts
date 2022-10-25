import * as busboy from 'busboy';

export type FileRestrictions = {
  maxFileByteLength: number;
  maxFileCountPerField?: number;
  throwOnExceededCountPerField?:  boolean;
};
  
export type Restrictions = {
  base: 
    & {
      maxTotalHeaderPairs?:           number;             // OPTIONAL, DEFAULT BusboyLimits.headerPairs = 2000
      maxFieldKeyByteLength?:         number;             // OPTIONAL, DEFAULT BusboyLimits.fieldNameSize = 100 bytes
      maxFieldValueByteLength?:       number;             // OPTIONAL, DEFAULT BusboyLimits.fieldSize = 1 MB
      maxFileByteLength:              number;             // REQUIRED, DEFAULT BusboyLimits.fileSize = Infinity (!)
      maxFileCountPerField?:          number;             // OPTIONAL, TODO DEFAULT = 1
      throwOnExceededCountPerField?:  boolean;            // OPTIONAL, DEFAULT = false
    }
    & (
      {
        maxTotalPartCount:            number;             // REQUIRED, DEFAULT BusboyLimits.parts = Infinity (!)
        maxTotalFileCount?:           number;             // OPTIONAL
        maxTotalFieldCount?:          number;             // OPTIONAL
      }
      |                                                   // OR
      {
        maxTotalPartCount?:           number;             // OPTIONAL
        maxTotalFileCount:            number;             // REQUIRED, DEFAULT BusboyLimits.files = Infinity (!)
        maxTotalFieldCount:           number;             // REQUIRED, DEFAULT BusboyLimits.fields = Infinity (!)
      }
    );
  fileOverride?: Record<string, FileRestrictions>;    // OVERRIDES baseMaxField{ Key, Value }ByteLength
};

export function restrictionsToBusboyLimits(
  {
    base: {
      maxTotalHeaderPairs,
      maxTotalPartCount,
      maxTotalFileCount,
      maxTotalFieldCount,
      maxFieldKeyByteLength,
      maxFieldValueByteLength,
      maxFileByteLength,
    },
    fileOverride
  }: Restrictions
): busboy.Limits {
  return {
    headerPairs:    maxTotalHeaderPairs,
    parts:          maxTotalPartCount,
    files:          maxTotalFileCount,
    // TODO: Busboy fileSize limit:
    // If a configured limits.fileSize limit was reached for a file,
    // stream will both have a boolean property truncated set to true
    // (best checked at the end of the stream) and emit a 'limit' event
    // to notify you when this happens.
    fileSize:       10 * Math.max(
                      maxFileByteLength,
                      ...Object.values(fileOverride ?? {}).map(f => f.maxFileByteLength).filter(x => !Number.isNaN(x))
                    ),
    fields:         maxTotalFieldCount,
    fieldNameSize:  maxFieldKeyByteLength,
    fieldSize:      maxFieldValueByteLength,
  };
}