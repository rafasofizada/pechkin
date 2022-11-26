import * as busboy from 'busboy';
import { RequiredPechkinConfig } from './types';

export const defaultPechkinConfig: RequiredPechkinConfig = {
  base: {                                        // PECHKIN DEFAULT      BUSBOY ANALOG       BUSBOY DEFAULT
    maxTotalHeaderPairs: 2000,                   //            2000      "headerPairs"                 2000
    maxTotalPartCount: 110,                      //       100 bytes      "fieldNameSize"          100 bytes
    maxFieldKeyByteLength: 100,                  //            1 MB      "fieldSize"                   1 MB
    maxFieldValueByteLength: 1024 * 1024,        //           50 MB      "fileSize"                Infinity
    maxTotalFieldCount: 100,                     //             100      "fields"                  Infinity
    maxTotalFileFieldCount: 1,                   //              10      "files"                   Infinity
    maxTotalFileCount: 10,                       //  100 + 10 = 110      "parts"                   Infinity 
    maxFileByteLength: 50 * 1024 * 1024,         //               1
    maxFileCountPerField: 1,                     //               1
    abortOnFileCountPerFieldLimit: true,         //            true      
    abortOnFileByteLengthLimit: true,            //            true      stream.truncated,
                                                 //                      "limit"                  
  }
};

export function pechkinConfigToBusboyLimits(
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
    fileOverride = {},
  }: RequiredPechkinConfig
): busboy.Limits {
  return {
    headerPairs:    maxTotalHeaderPairs,
    /**
     * Busboy `parts` limit is EXCLUSIVE (for some reason), so add 1 to make it INCLUSIVE
     * To test: remove "+ 1" and run test/limits.spec.ts
     */
    parts:          maxTotalPartCount + 1,
    files:          maxTotalFileCount,
    fields:         maxTotalFieldCount,
    fieldNameSize:  maxFieldKeyByteLength,
    fieldSize:      maxFieldValueByteLength,
    /**
     * We add 1kb to the Busboy limit to account for possible errors,
     * like boundary bytes being counted into the limit.
     * This only affects the Busboy limit, so as to not interfere with the
     * Pechkin limit.
     */
    fileSize:       1024 + Math.max(
                      maxFileByteLength,
                      ...Object.values(fileOverride).map(f => f.maxFileByteLength).filter(x => !Number.isNaN(x))
                    ),
  };
}