/*
1. Errors in next() reject next()'s promise.
  - busboyAsyncIterator.next() threw because we called throw() previously (synonymous with [7])
    - busboyAsyncIterator.throw() is idempotent
  - busboyAsyncIterator.next() encountered an error and threw "naturally"
  - processBusboyFileEventPayload() threw
  - cleanupFn() is called in all cases
2. Promise rejections in next() throw from the for-await-of loop.
3. Promise rejections in next() DON'T cause return() or throw() to be called.
4. Errors inside for-await-of loop trigger return().
5. throw() doesn't reject/throw an error by itself
6. (HOW TO TEST?) throw() causes an already-called-and-awaited next() result to reject/throw an error.
7. throw() causes the future next() result to reject/throw an error (synonymous with [1][0])
*/

import busboy from "busboy";
import { EventEmitter, Readable } from "stream";
import { describe, expect, it, vitest } from "vitest";
import { FileIterator } from "../src/FileIterator";
import { CombinedConfig } from "../src/config";
import { Internal } from "../src/types";
import { TotalLimitError } from "../src/error";

describe('FileIterator & Async Iteration Protocol', () => {
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of#description
  // "When a for await...of loop iterates over an iterable,
  // it first gets the iterable's [@@asyncIterator]() method and calls it,
  // which returns an async iterator."
  it('FileIterator.next() === FileIterator[Symbol.asyncIterator].next()', () => {
    const fileIterator = FileIterator(
      new EventEmitter() as busboy.Busboy,
      {} as Internal.CombinedConfig,
      () => {}
    );

    expect(fileIterator.next).toBe(fileIterator[Symbol.asyncIterator]().next);
  });

  describe("Errors in next() reject next()'s promise", () => {
    it('busboyAsyncIterator.next() threw because we called throw() previously', async () => {
      const cleanupFn = vitest.fn();
      const fileIterator = FileIterator(
        new EventEmitter() as busboy.Busboy,
        {} as Internal.CombinedConfig,
        cleanupFn,
      );

      fileIterator.throw(new Error("test"));
      await expect(fileIterator.next()).rejects.toThrow("test");
      expect(cleanupFn).toBeCalledTimes(1);
    });

    it('busboyAsyncIterator.throw() is idempotent', async () => {
      const cleanupFn = vitest.fn();
      const fileIterator = FileIterator(
        new EventEmitter() as busboy.Busboy,
        {} as Internal.CombinedConfig,
        cleanupFn,
      );

      fileIterator.throw(new Error("thrown"));
      fileIterator.throw(new Error("ignored"));

      await expect(fileIterator.next()).rejects.toThrow("thrown");
      expect(cleanupFn).toBeCalledTimes(1);
    });

    it('busboyAsyncIterator.next() encountered an error and threw "naturally"', async () => {
      const cleanupFn = vitest.fn();
      const busboy = new EventEmitter() as busboy.Busboy;
      const fileIterator = FileIterator(
        busboy,
        {} as Internal.CombinedConfig,
        cleanupFn,
      );

      // events.on() automatically assigns an error handler to 'error' event
      busboy.emit("error", new Error("thrown"));

      await expect(fileIterator.next()).rejects.toThrow("thrown");
      expect(cleanupFn).toBeCalledTimes(1);
    });

    it('processBusboyFileEventPayload() threw', async () => {
      const cleanupFn = vitest.fn();
      const busboy = new EventEmitter() as busboy.Busboy;
      const fileFieldName = "test";
      const fileIterator = FileIterator(
        busboy,
        // Induce an error in processBusboyFileEventPayload() through FileCounter and a limit
        CombinedConfig({ maxTotalFileFieldCount: 0 }),
        cleanupFn,
      );

      busboy.emit("file", fileFieldName, {} as Readable, {} as busboy.Info);

      await expect(fileIterator.next()).rejects.toThrow(new TotalLimitError("maxTotalFileFieldCount"));
      expect(cleanupFn).toBeCalledTimes(1);
    });
  });

  describe("for-await-of", () => {
    it("Promise rejections in next() throw from the for-await-of loop, DON'T trigger return() or throw()", async () => {
      const cleanupFn = vitest.fn();
      const busboy = new EventEmitter() as busboy.Busboy;
      const fileIterator = FileIterator(
        busboy,
        {} as Internal.CombinedConfig,
        cleanupFn,
      );

      const nextError = new Error("next() rejected");
      const insideLoopError = new Error("thrown from inside");

      const nextSpy = vitest.spyOn(fileIterator, 'next').mockImplementationOnce(() => Promise.reject(nextError));
      const returnSpy = vitest.spyOn(fileIterator, 'return');
      const throwSpy = vitest.spyOn(fileIterator, 'throw');
      
      await expect(async () => {
        for await (const _ of ({ [Symbol.asyncIterator]: () => fileIterator })) {
          throw insideLoopError;
        }
      }).rejects.toThrow(nextError);

      expect(nextSpy).toBeCalledTimes(1);
      expect(returnSpy).toBeCalledTimes(0);
      expect(throwSpy).toBeCalledTimes(0);
    });

    it("Errors inside for-await-of loop trigger return() but don't trigger throw()", async () => {
      const cleanupFn = vitest.fn();
      const busboy = new EventEmitter() as busboy.Busboy;
      const fileIterator = FileIterator(
        busboy,
        {} as Internal.CombinedConfig,
        cleanupFn,
      );

      const nextError = new Error("next() rejected");
      const insideLoopError = new Error("thrown from inside");

      const nextSpy = vitest.spyOn(fileIterator, 'next').mockImplementationOnce(() => Promise.resolve({ done: false, value: {} as any }));
      const returnSpy = vitest.spyOn(fileIterator, 'return');
      const throwSpy = vitest.spyOn(fileIterator, 'throw');
      
      await expect(async () => {
        for await (const _ of ({ [Symbol.asyncIterator]: () => fileIterator })) {
          throw insideLoopError;
        }
      }).rejects.toThrow(insideLoopError);

      expect(nextSpy).toBeCalledTimes(1);
      expect(returnSpy).toBeCalledTimes(1);
      expect(throwSpy).toBeCalledTimes(0);
    });
  });
});