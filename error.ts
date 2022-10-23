import { Restrictions } from './restrictions';

class InternalError extends Error {
  public readonly restrictionType: RestrictionType;
  public readonly busboyLimitType?: BusboyLimitWithRestrictionAnalogue;
  public readonly stack: string;
  private _message: string;

  get message(): string {
    return this._message;
  }

  constructor(
    restrictionType: RestrictionType,
    public readonly configuredValue?: number
  ) {
    const formattedRestrictionType = restrictionType.split(/([A-Z][a-z]+)/) // split each Uppercase word
      .slice(1) // remove "max"
      .filter(Boolean) // remove empty '' between Words
      .map(s => s.toLocaleLowerCase())
      .join(" ");

    let message = `Exceeded ${formattedRestrictionType} limit.`;
    const busboyLimitType = restrictionToLimit[restrictionType];

    super(message); // sets "this.stack"

    if (busboyLimitType) {
      this.busboyLimitType = busboyLimitType;
      message += `\nCorresponding Busboy configuration option: Busboy.Limits[${this.busboyLimitType}].`
    }

    if (this.configuredValue) {
      message += `\nConfigured value: ${this.configuredValue}`;
    }

    this.restrictionType = restrictionType;
    this._message = message;
  }

  protected appendMessage(s: string) {
    this._message += "\n" + s;
  }
}

export class TotalRestrictionError extends InternalError {
  constructor(totalRestrictionType: TotalRestrictionType, configuredValue?: number) {
    super(totalRestrictionType, configuredValue);
  }
}

export class FieldRestrictionError extends InternalError {
  constructor(
    fieldRestrictionType: FieldRestrictionType,
    public readonly field: string,
    configuredValue?: number
  ) {
    super(fieldRestrictionType, configuredValue);

    this.appendMessage(`Field: ${field}`);
  }
}

type RestrictionType = Exclude<keyof Restrictions["general"], "maxTotalHeaderPairs">;
type TotalRestrictionType = "maxTotalPartCount" | "maxTotalFileCount" | "maxTotalFieldCount";
type FieldRestrictionType = Exclude<RestrictionType, TotalRestrictionType>;
type RestrictionTypeWithBusboyAnalogue = Exclude<RestrictionType, "maxFileByteLength" | "maxFileCountPerField">;
type BusboyLimitWithRestrictionAnalogue = "parts" | "files" | "fields" | "fieldNameSize" | "fieldSize";

const restrictionToLimit: Record<
  RestrictionTypeWithBusboyAnalogue,
  BusboyLimitWithRestrictionAnalogue
> = {
  maxTotalPartCount: "parts",
  maxTotalFileCount: "files",
  maxTotalFieldCount: "fields",
  maxFieldKeyByteLength: "fieldNameSize",
  maxFieldValueByteLength: "fieldSize",
};