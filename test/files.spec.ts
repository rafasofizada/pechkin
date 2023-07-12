import { describe, expect, it } from 'vitest';
import { createParseFormData, filesTest } from './util';
import { FieldLimitError } from '../src';

// TODO: maxFileCountPerField
// TODO: maxTotalFileFieldCount

describe('Files', () => {
  describe('1 file per field', () => {
    it('single field', () => filesTest({ file__file: ['file content'] }));

    it('multiple fields', () => filesTest({
      file__file: ['file content'],
      file1__file: ['file content 1'],
      fileEmpty__file: [''],
      file2__file: ['file content 2'],
    }));
  });
  
  describe('multiple files per field', () => {
    it('single field', () => filesTest({ file__file: ['file content'] }));

    it('multiple fields', () => filesTest({
      file__file: ['file content 0 0', 'file content 0 1', 'file content 0 2'],
      file1__file: ['file content 1 0'],
    }));
  });

  describe('config', () => {
    describe('byte length config / truncation', () => {
      describe('abortOnFileByteLengthLimit = false', () => {
        it('multiple files', async () => {
          const { files } = await createParseFormData({
            truncateAll__file: ['truncated 0 0', 'truncated 0 1'],
            truncateSome__file: ['not trunc', 'truncated 1 0'],
            truncateSingle__file: ['truncated 2 0'],
            noTruncation__file: ['not trunc', 'no trunca'],
          }, {
            abortOnFileByteLengthLimit: false,
            maxFileByteLength: 9,
          });
  
          expect(files).toEqual([
            expect.objectContaining({
              field: 'truncateAll',
              content: 'truncated',
              byteLength: { truncated: true, readBytes: 9 },
            }),
            expect.objectContaining({
              field: 'truncateAll',
              content: 'truncated',
              byteLength: { truncated: true, readBytes: 9 },
            }),
            expect.objectContaining({
              field: 'truncateSome',
              content: 'not trunc',
              byteLength: { truncated: false, readBytes: 9 },
            }),
            expect.objectContaining({
              field: 'truncateSome',
              content: 'truncated',
              byteLength: { truncated: true, readBytes: 9 },
            }),
            expect.objectContaining({
              field: 'truncateSingle',
              content: 'truncated',
              byteLength: { truncated: true, readBytes: 9 },
            }),
            expect.objectContaining({
              field: 'noTruncation',
              content: 'not trunc',
              byteLength: { truncated: false, readBytes: 9 },
            }),
            expect.objectContaining({
              field: 'noTruncation',
              content: 'no trunca',
              byteLength: { truncated: false, readBytes: 9 },
            }),
          ]);
        });
  
        it('multiple files, w/ field override', async () => {
          const { files } = await createParseFormData({
            dontTruncate__file: ['should not be truncated'],
            truncate__file: ['should be truncated'],
            truncateLonger__file: ['should be truncated'],
          }, {
            abortOnFileByteLengthLimit: false,
            maxFileByteLength: 9,
          }, {
            dontTruncate__file: {
              maxFileByteLength: Infinity,
            },
            truncateLonger__file: {
              maxFileByteLength: 15,
            }
          });
    
          expect(files).toEqual([
            expect.objectContaining({
              field: 'dontTruncate',
              content: 'should not be truncated',
              byteLength: { truncated: false, readBytes: 23 },
            }),
            expect.objectContaining({
              field: 'truncate',
              content: 'should be',
              byteLength: { truncated: true, readBytes: 9 },
            }),
            expect.objectContaining({
              field: 'truncateLonger',
              content: 'should be trunc',
              byteLength: { truncated: true, readBytes: 15 },
            }),
          ]);
        });
      });
  
      describe('abortOnFileByteLengthLimit = true', () => {
        it('single file', () => {
          const maxFileByteLength = 1;

          return expect(
            createParseFormData(
              { throw__file: ['should throw'] },
              {
                abortOnFileByteLengthLimit: true,
                maxFileByteLength,
              }
            )
          ).rejects.toThrow(new FieldLimitError('maxFileByteLength', 'throw', maxFileByteLength));
        });

        it('multiple files, single file field', () => {
          const maxFileByteLength = 16;

          return expect(
            createParseFormData(
              { throw__file: ['should not throw', 'this now should throw definitely'] },
              {
                abortOnFileByteLengthLimit: true,
                maxFileByteLength,
              }
            )
          ).rejects.toThrow(new FieldLimitError('maxFileByteLength', 'throw', maxFileByteLength));
        });

        it('multiple files, multiple file fields', () => {
          const maxFileByteLength = 16;

          return expect(
            createParseFormData(
              {
                dontThrow__file: ['should not throw'],
                throw__file: ['should not throw', 'this now should throw definitely'],
              },
              {
                abortOnFileByteLengthLimit: true,
                maxFileByteLength,
              }
            )
          ).rejects.toThrow(new FieldLimitError('maxFileByteLength', 'throw', maxFileByteLength));
        });

        it('multiple files, w/ field override', () => {
          const maxFileByteLength = 16;

          return expect(
            createParseFormData(
              {
                dontThrow__file: ['should not throw'],
                dontThrowYet__file: ['should not throw', 'this too should not throw'],
                throw__file: ['should not throw', 'this now should throw definitely'],
              },
              {
                abortOnFileByteLengthLimit: true,
                maxFileByteLength,
              },
              {
                dontThrowYet__file: {
                  maxFileByteLength: 25,
                },
              }
            )
          ).rejects.toThrow(new FieldLimitError('maxFileByteLength', 'throw', maxFileByteLength));
        });
    });
  });
  });
});