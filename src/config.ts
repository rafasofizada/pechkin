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
    // `parts`, `files`, `fields` trigger `partsLimit`, `filesLimit`, `fieldsLimit` respectively.
    // the events are triggered UPON reaching the provided value (not exceeding it),
    // which makes the limits exclusive. So we add 1 to each limit to make them inclusive.
    parts:          maxTotalPartCount + 1,
    files:          maxTotalFileCount + 1,
    fields:         maxTotalFieldCount + 1,
    fieldNameSize:  maxFieldKeyByteLength,
    fieldSize:      maxFieldValueByteLength,
    // Same mechanism as with parts/files/fields is with fileSize,
    // but we add 1kb to the limit to account for possible errors,
    // like boundary bytes being counted into the limit.
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