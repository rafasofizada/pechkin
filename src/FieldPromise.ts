import busboy from "busboy";

import { Internal } from "./types";
import { FieldLimitError, TotalLimitError } from "./error";

export function FieldsPromise(parser: busboy.Busboy, cleanupFn: () => void): Promise<Internal.Fields> {
  return new Promise<Internal.Fields>((resolve, reject) => {
    const fields: Internal.Fields = {};

    parser
      // TODO: Add a limit on maxFieldKeyByteLength
      // TODO: Test maxFieldKeyByteLength
      // TODO: Test maxFieldValueByteLength
      // TODO: Test 'error' and 'finish' events
      .on('field', (name: string, value: string, info: busboy.FieldInfo) => {
        // Bug in Busboy (https://github.com/mscdex/busboy/issues/6)
        if (info.nameTruncated) return reject(new FieldLimitError("maxFieldKeyByteLength", name));
        if (info.valueTruncated) return reject(new FieldLimitError("maxFieldValueByteLength", name));

        fields[name] = value;
      })
      .once('file', () => resolve(fields))
      .once('finish', () => resolve(fields))
      .once('partsLimit', () => reject(new TotalLimitError('maxTotalPartCount')))
      .once('fieldsLimit', () => reject(new TotalLimitError("maxTotalFieldCount")))
      .once('error', (error: Error) => reject(error));
  }).catch((error) => {
    cleanupFn();
    throw error;
  });
}