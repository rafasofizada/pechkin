import { TotalLimitError, FieldLimitError } from "./error";
import { Internal } from "./types";

const FileFieldCount: unique symbol = Symbol("FileFieldCount");

export type FileCounter = {
  [FileFieldCount]: number;
  [field: string]: number;
};

export function FileCounter(config: Internal.CombinedConfig): FileCounter {
  return new Proxy(
    {
      get [FileFieldCount](): number {
        return Object.keys(this).length;
      },
    } as FileCounter,
    {
      get: (target, field: string) => (target[field] ??= 0),
      set: (target, field: string, value: number, proxy: FileCounter) => {
        if (value - proxy[field] > 1) {
          throw new TypeError("File count cannot be increased by more than 1");
        }

        const { maxTotalFileFieldCount } = config[Internal.BaseConfig];

        if (proxy[FileFieldCount] > maxTotalFileFieldCount) {
          throw new TotalLimitError("maxTotalFileFieldCount", maxTotalFileFieldCount);
        }

        const { maxFileCountPerField } = config[field];

        if (proxy[field] + 1 > maxFileCountPerField) {
          throw new FieldLimitError("maxFileCountPerField", field, maxFileCountPerField);
        }

        target[field] = value;

        return true;
      }
    });
}