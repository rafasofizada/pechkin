import { Duplex } from "stream";
import { EventConfig, TypeSafeEventEmitter } from "./TypeSafeEventEmitter";

export type StreamFn<EC extends EventConfig> = {
  stream: Duplex,
  once: TypeSafeEventEmitter<EC>['once']
};