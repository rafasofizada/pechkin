import { Restrictions } from './restrictions';

export class PechkinRestrictionError extends Error {
  public readonly restrictionType: GeneralRestrictionTypes;
  public readonly busboyLimitType: RestrictedBusboyLimitTypes;
  public readonly message: string;
  public readonly stack: string;

  constructor(restrictionType: GeneralRestrictionTypes) {
    const formattedRestrictionType = restrictionType.split(/([A-Z][a-z]+)/) // split each Uppercase word
      .slice(1) // remove "max"
      .filter(Boolean) // remove empty '' between Words
      .map(s => s.toLocaleLowerCase())
      .join(" ");

    const busboyLimitType = restrictionToLimit[restrictionType];
    const message = `
    Exceeded ${formattedRestrictionType} limit.
    Corresponding Busboy configured value: Busboy.Limits[${busboyLimitType}].
    `.replace(/\s+/g, " ");

    super(message); // sets "this.stack"
  
    this.restrictionType = restrictionType;
    this.busboyLimitType = busboyLimitType;
    this.message = message;
  }
}

type GeneralRestrictionTypes = Exclude<keyof Restrictions["general"], "maxFileCountPerField" | "maxTotalHeaderPairs" | "maxFileByteLength">;
type RestrictedBusboyLimitTypes = "parts" | "files" | "fields" | "fieldNameSize" | "fieldSize";

const restrictionToLimit: Record<
  GeneralRestrictionTypes,
  RestrictedBusboyLimitTypes
> = {
  maxTotalPartCount: "parts",
  maxTotalFileCount: "files",
  maxTotalFieldCount: "fields",
  maxFieldKeyByteLength: "fieldNameSize",
  maxFieldValueByteLength: "fieldSize",
};