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
    parts:          maxTotalPartCount,
    files:          maxTotalFileCount,
    fileSize:       1024 + Math.max(
                      maxFileByteLength,
                      ...Object.values(fileOverride).map(f => f.maxFileByteLength).filter(x => !Number.isNaN(x))
                    ),
    fields:         maxTotalFieldCount,
    fieldNameSize:  maxFieldKeyByteLength,
    fieldSize:      maxFieldValueByteLength,
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