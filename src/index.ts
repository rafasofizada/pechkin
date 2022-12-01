import busboy from 'busboy';
import { IncomingMessage } from 'http';

import { Internal } from './types';
import { FileIterator } from './FileIterator';

export * from './error';

export namespace Pechkin {
  export type Config = Internal.Config;
  export type BusboyConfig = Internal.BusboyConfig;
  export type FileFieldConfigOverride = Internal.FileFieldConfigOverride;
  export type Fields = Internal.Fields;
  export type File = Internal.File;
  export type Files = Internal.Files;
}

export async function parseFormData(
  request: IncomingMessage,
  config: Partial<Pechkin.Config> = {},
  fileFieldConfigOverride: Pechkin.FileFieldConfigOverride = {},
  busboyConfig: Pechkin.BusboyConfig = {},
): Promise<{
  fields: Pechkin.Fields,
  files: Pechkin.Files,
}> {
  const normalizedConfig: Pechkin.Config = {
    ...defaultConfig,
    ...config,
  };

  const parser = busboy({
    headers: request.headers,
    ...busboyConfig,
    limits: pechkinConfigToBusboyLimits(normalizedConfig),
  });

  const fields = FieldsPromise(parser);
  const files = new FileIterator(parser, normalizedConfig, fileFieldConfigOverride);
  
  // TODO: Test if throws if request is not multipart/form-data
  request.pipe(parser);

  return { fields: await fields, files };
}

function FieldsPromise(parser: busboy.Busboy): Promise<Pechkin.Fields> {
  return new Promise<Pechkin.Fields>((resolve, reject) => {
    const fields: Pechkin.Fields = {};

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
  });
}