import busboy from 'busboy';
import { IncomingMessage } from 'http';

import { Internal } from './types';
import { FileIterator } from './FileIterator';
import { FieldsPromise } from './FieldPromise';
import { CombinedConfig, pechkinConfigToBusboyLimits } from './config';

export * from './error';

export namespace Pechkin {
  export type Config = Partial<Internal.Config>;
  export type BusboyConfig = Internal.BusboyConfig;
  export type FileFieldConfigOverride = Internal.FileFieldConfigOverride;
  export type Fields = Internal.Fields;
  export type File = Internal.File;
  export type Files = Internal.Files;
}

process.on("uncaughtException", (error) => {
  console.log('UNCAUGHT 😱', error);
});

export async function parseFormData(
  request: IncomingMessage,
  config?: Pechkin.Config,
  fileFieldConfigOverride?: Pechkin.FileFieldConfigOverride,
  busboyConfig: Pechkin.BusboyConfig = {},
): Promise<{
  fields: Pechkin.Fields,
  files: Pechkin.Files,
}> {
  const finalConfig = CombinedConfig(config, fileFieldConfigOverride);

  const parser = busboy({
    headers: request.headers,
    ...busboyConfig,
    limits: pechkinConfigToBusboyLimits(finalConfig[Internal.BaseConfig]),
  });

  const cleanupFn = () => {
    request.unpipe(parser);
  };

  const fields = FieldsPromise(parser);
  const files = FileIterator(parser, finalConfig, cleanupFn);
  
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