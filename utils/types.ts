import { Duplex } from "stream";
import { EventConfig, TypeSafeEventEmitter } from "./TypeSafeEventEmitter";

export type StreamFn<EC extends EventConfig> = {
  stream: Duplex,
  on: TypeSafeEventEmitter<EC>['on']
};