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
  
  let cleanedUp = false;

  // TODO: Test effect of cleanup
  function cleanupFn() {
    // Approach taken by multer
    // https://github.com/expressjs/multer/blob/25794553989a674f4998b32a061dfc9287b23188/lib/make-middleware.js#L49
    if (cleanedUp) return;
    
    request.unpipe(parser);
    parser.removeAllListeners();
    request.resume();
    cleanedUp = true;
  }

  const fields = FieldsPromise(parser, cleanupFn);
  const files = FileIterator(parser, finalConfig, cleanupFn);
  
  // TODO: Test if throws if request is not multipart/form-data
  request.pipe(parser);

  return {
    fields: await fields,
    files
  };
}