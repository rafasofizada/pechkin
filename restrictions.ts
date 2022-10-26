import * as busboy from 'busboy';

export type FileRestrictions = Pick<Restrictions['base'], "maxFileByteLength" | "maxFileCountPerField" | "onExceededFileCountPerField">;
  
export type Restrictions = {
  base: Partial<{                                           // PECHKIN DEFAULT      BUSBOY ANALOG       BUSBOY DEFAULT
    maxTotalHeaderPairs?:             number;               //            2000      "headerPairs"                 2000
    maxFieldKeyByteLength?:           number;               //       100 bytes      "fieldNameSize"          100 bytes
    maxFieldValueByteLength?:         number;               //            1 MB      "fieldSize"                   1 MB
    maxFileByteLength:                number;               //           50 MB      "fileSize"                Infinity
    maxTotalFieldCount?:              number;               //             100      "fields"                  Infinity
    maxTotalFileCount?:               number;               //              10      "files"                   Infinity
    maxTotalPartCount?:               number;               //  100 + 10 = 110      "parts"                   Infinity 
    maxTotalFileFieldCount?:          number;               //               1
    maxFileCountPerField?:            number;               //               1
    onExceededFileCountPerField?:     "throw" | "skip";     //            true                          
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
    fileSize:       1024 + Math.max(
                      maxFileByteLength,
                      ...Object.values(fileOverride ?? {}).map(f => f.maxFileByteLength).filter(x => !Number.isNaN(x))
                    ),
    fields:         maxTotalFieldCount,
    fieldNameSize:  maxFieldKeyByteLength,
    fieldSize:      maxFieldValueByteLength,
  };
}

export const defaultRestrictions: Restrictions = {
  base: {
    maxTotalHeaderPairs: 2000,
    maxTotalPartCount: 110,
    maxFieldKeyByteLength: 100,
    maxFieldValueByteLength: 1024 * 1024,
    maxTotalFieldCount: 100,
    maxTotalFileFieldCount: 1,
    maxTotalFileCount: 10,
    maxFileByteLength: 50 * 1024 * 1024,
    maxFileCountPerField: 1,
    onExceededFileCountPerField: "throw",
  }
};