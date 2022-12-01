import { Internal } from './types';

class InternalError extends Error {
  public readonly limitType: LimitType;
  public readonly busboyLimitType?: BusboyLimitWithLimitAnalogue;
  public message: string;

  constructor(
    limitType: LimitType,
    public readonly configurationInfo?: unknown
  ) {
    const formattedLimitType = limitType.split(/([A-Z][a-z]+)/) // split each Uppercase word
      .slice(1) // remove "max"
      .filter(Boolean) // remove empty '' between Words
      .map(s => s.toLocaleLowerCase())
      .join(" ");

    let message = `Exceeded ${formattedLimitType} limit ("${limitType}").`;

    super(message); // sets "this.stack"

    if (limitType in pechkinLimitToBusboyLimit) {
      this.busboyLimitType = pechkinLimitToBusboyLimit[limitType as keyof typeof pechkinLimitToBusboyLimit];
      message += `\nCorresponding Busboy configuration option: Busboy.Limits["${this.busboyLimitType}"].`
    }

    if (this.configurationInfo) {
      message += `\nConfiguration info: ${this.configurationInfo}`;
    }

    this.limitType = limitType;

    this.message = message;
  }
}

export class TotalLimitError extends InternalError {
  constructor(totalLimitType: TotalLimitType, configurationInfo?: unknown) {
    super(totalLimitType, configurationInfo);
  }
}

export class FieldLimitError extends InternalError {
  constructor(
    fieldLimitType: FieldLimitType,
    public readonly field: string,
    configurationInfo?: unknown
  ) {
    super(fieldLimitType, configurationInfo);

    this.message += `\nField: "${field}"`;
  }
}

type LimitType = Exclude<keyof Internal.Config, "maxTotalHeaderPairs">;
type TotalLimitType = "maxTotalPartCount" | "maxTotalFileCount" | "maxTotalFieldCount" | "maxTotalFileFieldCount";
type FieldLimitType = Exclude<LimitType, TotalLimitType>;
type BusboyLimitWithLimitAnalogue = "parts" | "files" | "fields" | "fieldNameSize" | "fieldSize";

const pechkinLimitToBusboyLimit = {
  maxTotalPartCount: "parts",
  maxTotalFileCount: "files",
  maxTotalFieldCount: "fields",
  maxFieldKeyByteLength: "fieldNameSize",
  maxFieldValueByteLength: "fieldSize",
} as const;