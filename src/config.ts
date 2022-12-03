import * as busboy from 'busboy';
import { Pechkin } from '.';

import { Internal } from './types';

export function CombinedConfig(
  partialConfig: Pechkin.Config = {},
  fileFieldConfigOverride: Internal.FileFieldConfigOverride = {},
): Internal.CombinedConfig {
  const config = {
    ...defaultConfig,
    ...partialConfig,
  };

  return new Proxy(
    {} as Internal.CombinedConfig,
    {
      get: (target: Internal.CombinedConfig, fieldOrBaseProp: string | Internal.BaseConfig) =>
        fieldOrBaseProp === Internal.BaseConfig
          ? config
          : (target[fieldOrBaseProp] ??= {
            ...config,
            ...(fileFieldConfigOverride[fieldOrBaseProp] ?? {}),
          })
    }
  );
}

const defaultConfig: Internal.Config = {                                  
                                                 // PECHKIN DEFAULT      BUSBOY ANALOG       BUSBOY DEFAULT
    maxTotalHeaderPairs: 2000,                   //            2000      "headerPairs"                 2000
    maxTotalPartCount: 110,                      //       100 bytes      "parts"                  100 bytes
    maxFieldKeyByteLength: 100,                  //            1 MB      "fieldNameSize"               1 MB
    maxFieldValueByteLength: 1024 * 1024,        //           50 MB      "fieldSize"               Infinity
    maxTotalFieldCount: 100,                     //             100      "fields"                  Infinity
    maxTotalFileFieldCount: 1,                   //              10                                
    maxTotalFileCount: 10,                       //  100 + 10 = 110      "files"                   Infinity 
    maxFileByteLength: 50 * 1024 * 1024,         //               1      "fileSize"                Infinity
    maxFileCountPerField: 1,                     //               1
    abortOnFileByteLengthLimit: true,            //            true      stream.truncated,
                                                 //                      "limit" event                
};

export function pechkinConfigToBusboyLimits({
  maxTotalHeaderPairs,
  maxTotalPartCount,
  maxTotalFileCount,
  maxTotalFieldCount,
  maxFieldKeyByteLength,
  maxFieldValueByteLength,
}: Internal.Config): busboy.Limits {
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
    fileSize:       Infinity,
  };
}