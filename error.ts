import { Restrictions } from './restrictions';

type GeneralRestrictionTypes = Exclude<keyof Restrictions["general"], "maxFileCountPerField" | "maxTotalHeaderPairs" | "maxFileByteLength">;
type RestrictedBusboyLimitTypes = "parts" | "files" | "fields" | "fieldNameSize" | "fieldSize";

export type PechkinErrorCtor = (restrictionType: GeneralRestrictionTypes) => PechkinError;

export type PechkinError = {
  type: "GENERAL_RESTRICTION";
  restrictionType: GeneralRestrictionTypes;
  busboyLimitType: RestrictedBusboyLimitTypes;
  configuredValue: number;
  message: string;
  stack: string;
};

export function RestrictionErrorFactory(restrictions: Restrictions) {
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

  return function RestrictionErrorCtor(restrictionType: GeneralRestrictionTypes): PechkinError {
    const formattedRestrictionType = restrictionType.split(/([A-Z][a-z]+)/) // split each Uppercase word
      .slice(1) // remove "max"
      .filter(Boolean) // remove empty '' between Words
      .map(s => s.toLocaleLowerCase())
      .join(" ");

    const configuredValue = restrictions.general[restrictionType];
    const busboyLimitType = restrictionToLimit[restrictionType];
    const message = `
      Exceeded ${formattedRestrictionType} limit.
      Pechkin configured value: Restrictions[general][${restrictionType}] = ${configuredValue}.
      Corresponding Busboy configured value: Busboy.Limits[${busboyLimitType}].
    `.replace(/\s+/g, " ");

    const errorProps = {
      type: "GENERAL_RESTRICTION",
      restrictionType,
      busboyLimitType,
      configuredValue,
      message,
    };

    Error.captureStackTrace(errorProps, RestrictionErrorCtor);

    return errorProps as PechkinError;
  };
}