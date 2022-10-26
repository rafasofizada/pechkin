import * as busboy from 'busboy';

export type FileRestrictions = Partial<{
  maxFileByteLength: number;
  maxFileCountPerField?: number;
  throwOnExceededCountPerField?:  boolean;
}>;
  
export type Restrictions = {
  base: Partial<{                                         // PECHKIN DEFAULT      BUSBOY ANALOG       BUSBOY DEFAULT
    maxTotalHeaderPairs?:             number;             //            2000      "headerPairs"                 2000
    maxFieldKeyByteLength?:           number;             //       100 bytes      "fieldNameSize"          100 bytes
    maxFieldValueByteLength?:         number;             //            1 MB      "fieldSize"                   1 MB
    maxFileByteLength:                number;             //           50 MB      "fileSize"                Infinity
    throwOnExceededCountPerField?:    boolean;            //            true                          
    maxTotalFieldCount?:              number;             //             100      "fields"                  Infinity
    maxTotalFileCount?:               number;             //              10      "files"                   Infinity
    maxTotalPartCount?:               number;             //  100 + 10 = 110      "parts"                   Infinity 
    maxTotalFileFieldCount?:          number;             //               1
    maxFileCountPerField?:            number;             //               1
  }>;
  fileOverride?: Record<string, FileRestrictions>;
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