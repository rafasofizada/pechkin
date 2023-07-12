import { Readable } from 'stream';
import { describe, it, expect } from 'vitest';

import { FieldLimitError } from '../src';
import { ByteLengthTruncateStream } from '../src/ByteLengthTruncateStream';
import { byteLength } from '../src/FileIterator';

describe('ByteLengthTruncateStream', () => {
  describe('_transform', () => {
    it('should pass through chunk if limit is not exceeded', () => new Promise<void>((resolve, reject) => {
      const limit = 100;
      const field = 'content';
      const stream = new ByteLengthTruncateStream(limit, true, field);
    
      const data = 'This is a short chunk of data.';
    
      stream.on('data', (chunk) => {
        expect(chunk.toString()).toBe(data);
        resolve();
      });
    
      stream.write(data);
    }));

    it('should truncate chunk and emit error if limit is exceeded', () => new Promise<void>((resolve, reject) => {
      const limit = 10;
      const field = 'content';
      const stream = new ByteLengthTruncateStream(limit, true, field);
    
      const data = 'This is a long chunk of data.';
      const expectedTruncatedData = 'This is a ';
      const expectedError = new FieldLimitError('maxFileByteLength', field, limit);
    
      const chunks: any[] = [];
    
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });
    
      stream.on('error', (error) => {
        expect(error).toEqual(expectedError);
        expect(Buffer.concat(chunks).toString()).toEqual(expectedTruncatedData);
        resolve();
      });
    
      stream.write(data);
    }));
  });
  
  describe('byteLength event', () => {
    it('should return the correct byte length', () => new Promise<void>((resolve, reject) => {
      const limit = 100;
      const field = 'content';
      const stream = new ByteLengthTruncateStream(limit, true, field);
    
      const data = 'This is some data.';
      const expectedByteLength = Buffer.byteLength(data);
    
      stream
        .on('byteLength', (byteLength) => {
          expect(byteLength).toEqual(expectedByteLength);
          resolve();
        })
        .on('error', (error) => {
          reject(new Error('No error should be emitted: content < limit'));
          console.error(error);
        })
        .on('finish', () => {
          reject(new Error('\'byteLength\' should be emitted before \'finish\''));
        });

      stream.write(data);
      stream.end();
    }));

    it('should not be emitted if limit exceeded', () => new Promise<void>((resolve, reject) => {
      const limit = 10;
      const field = 'content';
      const stream = new ByteLengthTruncateStream(limit, true, field);
    
      const data = 'This is some data.';
    
      stream.write(data);
      stream.end();
    
      stream
        .on('byteLength', (byteLength) => {
          reject(new Error('\'byteLength\' should not be emitted: content > limit, should error instead'))
        })
        .on('error', (error) => {
          expect(error).toEqual(new FieldLimitError('maxFileByteLength', field, limit));
          resolve();
        });
    }));

    it('should not set .on(\'error\') listener and catch errors, process.uncaughtException should fire', () => new Promise<void>((resolve, reject) => {
      const uncaughtExceptionEvents: Error[] = [];
      process.on('uncaughtException', (error: Error) => {
        uncaughtExceptionEvents.push(error);
      });
    
      // Create the ByteLengthTruncateStream instance
      const limit = 10;
      const field = 'content';
      const stream = new ByteLengthTruncateStream(limit, true, field);
    
      // Create a readable stream and pipe it to ByteLengthTruncateStream
      const input = 'This is a long chunk of data.';
      const readableStream = Readable.from(input);
      readableStream.pipe(stream);
    
      // Allow some time for the event loop to process data
      setTimeout(() => {
        try {
          // Assert that the process.uncaughtException event was fired
          expect(uncaughtExceptionEvents.length).toBeGreaterThan(0);
        } catch (error) {
          reject(error);
        }

        process.removeAllListeners('uncaughtException');
        resolve();
      }, 500);
    }));

    // Verifying expectations for stream behaviour

    it('is not available after the stream has been destroyed', () => new Promise<void>((resolve, reject) => {
      const limit = 100;
      const field = 'content';
      const stream = new ByteLengthTruncateStream(limit, true, field);
    
      const data = 'This is some data.';

      stream.write(data);
      stream.destroy();

      stream
        .on('byteLength', () => {
          reject(new Error('\'byteLength\' should not be emitted: stream destroyed'))
        })
        .on('close', () => {
          resolve();
        });
    }));

    it('is not available after the stream has been ended', () => new Promise<void>((resolve, reject) => {
      const limit = 100;
      const field = 'content';
      const stream = new ByteLengthTruncateStream(limit, true, field);
    
      const data = 'This is some data.';
    
      stream.write(data);
      stream.end();

      stream
        .on('byteLength', () => {
          reject(new Error('\'byteLength\' should not be emitted: stream destroyed'))
        })
        .on('finish', () => {
          resolve();
        });
    }));
  });
});
