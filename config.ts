import { BusboyConfig } from 'busboy';
  
export type FieldConfig = {
  maxFieldKeyByteLength?: number;
  maxFieldValueByteLength?: number;
};

export type FileFieldConfig = {
  maxFileByteLength: number;
  maxFileCount?: number;
};

export const DefaultField: unique symbol = Symbol('DefaultField');
  
export type Config = 
  & Omit<BusboyConfig, 'headers' | 'limits'>
  & {
    limits: {
      total: 
        & { maxTotalHeaderPairs?: number; }
        & (
          | {
            maxTotalPartCount: number;
            maxTotalFileCount?: number;
            maxTotalFieldCount?: number;
          }
          | {
            maxTotalPartCount?: number;
            maxTotalFileCount: number;
            maxTotalFieldCount: number;
          }
        ),
      fieldSpecific: {
        [DefaultField]: FieldConfig,
        [F: string]: FieldConfig,
      }
      fileFieldSpecific: {
        [DefaultField]: FileFieldConfig,
        [F: string]: FileFieldConfig,
      }
    }
  };