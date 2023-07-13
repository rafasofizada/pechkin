import { describe, it, expect } from 'vitest';

import { FieldLimitError } from '../src';
import { ByteLengthTruncateStream } from '../src/ByteLengthTruncateStream';

describe('ByteLengthTruncateStream', () => {
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
