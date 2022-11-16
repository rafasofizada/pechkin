import { EventEmitter, once } from "events";

export type EventConfig = Record<string, any>;

export class SafeEventEmitter<EC extends EventConfig> {
  private readonly ee = new EventEmitter();

  emit<E extends keyof EC>(event: E, payload: EC[E]): void {
    const hasListener = this.ee.emit(event as string, payload);
    
    if (!hasListener) {
      throw new Error(`No listener attached for "${String(event)}". Payload was possibly "lost".`);
    }
  }

  on<E extends keyof EC>(event: E, listener: (payload: EC[E]) => void): void {
    this.ee.on(event as string, listener);
  }

  once<E extends keyof EC>(event: E): Promise<EC[E] extends Array<any> ? EC[E] : [EC[E]] > {
    return once(this.ee, event as string) as Promise<EC[E]>;
  }
}