import * as busboy from 'busboy';
  
export type FieldRestrictions = {
  maxFieldKeyByteLength?: number;
  maxFieldValueByteLength?: number;
};

export type FileRestrictions = {
  maxFileByteLength: number;
  maxFileCount?: number;
};

export const DefaultField: unique symbol = Symbol('DefaultField');
  
export type Restrictions = {
  general: 
    & {
      maxTotalHeaderPairs?:       number;             // OPTIONAL, DEFAULT BusboyLimits.headerPairs = 2000
      maxFieldKeyByteLength?:     number;             // OPTIONAL, DEFAULT BusboyLimits.fieldNameSize = 100 bytes
      maxFieldValueByteLength?:   number;             // OPTIONAL, DEFAULT BusboyLimits.fieldSize = 1 MB
      maxFileByteLength:          number;             // REQUIRED, DEFAULT BusboyLimits.fileSize = Infinity (!)
      maxFileCountPerField?:      number;             // OPTIONAL, TODO DEFAULT = 1
    }
    & (
      {
        maxTotalPartCount:        number;             // REQUIRED, DEFAULT BusboyLimits.parts = Infinity (!)
        maxTotalFileCount?:       number;             // OPTIONAL
        maxTotalFieldCount?:      number;             // OPTIONAL
      }
      |                                                // OR
      {
        maxTotalPartCount?:       number;             // OPTIONAL
        maxTotalFileCount:        number;             // REQUIRED, DEFAULT BusboyLimits.files = Infinity (!)
        maxTotalFieldCount:       number;             // REQUIRED, DEFAULT BusboyLimits.fields = Infinity (!)
      }
    );
  fileOverride?: Record<string, FileRestrictions>;    // OVERRIDES baseMaxField{ Key, Value }ByteLength
};

export function restrictionsToBusboyLimits(
  {
    general: {
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
    fileSize:       Math.max(
                      maxFileByteLength,
                      ...Object.values(fileOverride ?? {}).map(f => f.maxFileByteLength).filter(x => !Number.isNaN(x))
                    ),
    fields:         maxTotalFieldCount,
    fieldNameSize:  maxFieldKeyByteLength,
    fieldSize:      maxFieldValueByteLength,
  };
}