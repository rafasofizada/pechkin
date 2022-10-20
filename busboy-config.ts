import { BusboyConfig, Limits as BusboyLimits } from 'busboy';
import { IncomingHttpHeaders } from 'http';

// number of fields ('fields') and max number of files ('files')
// should always be set by the developer for security
export type RequiredBusboyLimits = Required<Pick<BusboyLimits, 'fields' | 'files'>>;

export type CustomBusboyLimits = 
  // fileSize config is handled by parseFormData's fileConfig parameter
  & Omit<BusboyLimits, 'fileSize' | 'fields' | 'files'>
  & RequiredBusboyLimits;

export type CustomBusboyConfig =
  & Omit<BusboyConfig, 'headers' | 'limits'>
  & { limits: CustomBusboyLimits };

export function busboyConfig(
  headers: IncomingHttpHeaders,
  busboySpecificConfig?: CustomBusboyConfig
): BusboyConfig {
    const {
      limits,
      ...restBusboySpecificConfig
    } = busboySpecificConfig ?? {};
  
    const {
      fields: maxFieldCount,
      files: maxFileCount,
      ...restLimits
    } = limits ?? {};
  
    const definedLimits: CustomBusboyLimits = {
      ...restLimits,
      fields: maxFieldCount ?? defaultLimits.fields,
      files: maxFileCount ?? defaultLimits.files,
    };
  
    return {
      headers,
      limits: definedLimits,
      ...restBusboySpecificConfig,
    };
  }

export const defaultLimits: RequiredBusboyLimits = {
  fields: 2000,
  files: 50,
};