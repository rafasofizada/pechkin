import { Restrictions } from './restrictions';

export type PechkinError = {
  restrictionType: GeneralRestrictionTypes;
  busboyLimitType: RestrictedBusboyLimitTypes;
  message: string;
  stack: string;
};

export function PechkinError(restrictionType: GeneralRestrictionTypes): PechkinError {
  const formattedRestrictionType = restrictionType.split(/([A-Z][a-z]+)/) // split each Uppercase word
      .slice(1) // remove "max"
      .filter(Boolean) // remove empty '' between Words
      .map(s => s.toLocaleLowerCase())
      .join(" ");

  const error = {
    restrictionType,
    busboyLimitType: restrictionToLimit[restrictionType],
    message:
      `
      Exceeded ${formattedRestrictionType} limit.
      Corresponding Busboy configured value: Busboy.Limits[${this.busboyLimitType}].
      `.replace(/\s+/g, " ")
  };

  Error.captureStackTrace(error, PechkinError); // error.stack property setter

  return error as PechkinError;
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