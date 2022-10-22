import { Duplex } from "stream";
import { EventConfig } from "./SafeEventEmitter";

export type StreamFn<EC extends EventConfig> = {
  stream: Duplex,
  events: { [E in keyof EC]: Promise<EC[E]> }
};