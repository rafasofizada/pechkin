import { Duplex } from "stream";
import { EventConfig, TypeSafeEventEmitter } from "./TypeSafeEventEmitter";

export type StreamFn<EC extends EventConfig> = {
  stream: Duplex,
  events: { [E in keyof EC]: Promise<EC[E]> }
};