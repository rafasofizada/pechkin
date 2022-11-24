import * as busboy from 'busboy';
import { RequiredPechkinConfig } from './types';

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

export const defaultPechkinConfig: RequiredPechkinConfig = {
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
    abortOnFileCountPerFieldLimit: true,
    abortOnFileByteLengthLimit: true,
  }
};