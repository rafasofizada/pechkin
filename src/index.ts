import busboy from 'busboy';
import { IncomingMessage } from 'http';

import { Internal } from './types';
import { FileIterator } from './FileIterator';
import { FieldsPromise } from './FieldPromise';
import { defaultConfig, FieldConfig, pechkinConfigToBusboyLimits } from './config';

export * from './error';

export namespace Pechkin {
  export type Config = Partial<Internal.Config>;
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
  const normalizedConfig = {
    ...defaultConfig,
    ...config,
  };

  const fileFieldConfig = FieldConfig(normalizedConfig, fileFieldConfigOverride);

  const parser = busboy({
    headers: request.headers,
    ...busboyConfig,
    limits: pechkinConfigToBusboyLimits(normalizedConfig),
  });

  const cleanupFn = () => {
    request.unpipe(parser);
    parser.removeAllListeners();
  };

  const fields = FieldsPromise(parser);
  const files = FileIterator(parser, normalizedConfig, fileFieldConfig, cleanupFn);
  
  // TODO: Test if throws if request is not multipart/form-data
  request.pipe(parser);

  return {
    fields: await fields.catch((error) => {
      cleanupFn();
      throw error;
    }),
    files
  };
}