import { Duplex } from "stream";

export type StreamFn<T> = { stream: Duplex, result: Promise<T> };