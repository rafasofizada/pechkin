import { expect, describe, it } from 'vitest';
import { createParseFormData, filesTest  } from './util';

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
  
          // TODO: Automate test?
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
    
          // TODO: Automate test?
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
  
      // TODO: Actually test if error is thrown
      // describe('abortOnFileByteLengthLimit = true', () => {
      //   it('multiple files', async () => {
      //     const { files } = await createParseFormData({
      //       noTruncation__file: ['no trunc'],
      //       truncateSomeAbort__file: ['no trunc', 'truncated 0 0'],
      //       unreachable__file: ['truncated 1 0'],
      //     }, {
      //       base: {
      //         abortOnFileByteLengthLimit: true,
      //         maxFileByteLength: 9,
      //       },
      //     });
  
      //     // `truncateAbort__file` should be omitted, because an error is thrown
      //     // (there's a try/catch in createParseFormData that silences the error),
      //     // `unreachable_file` is never reached,
      //     // so we expect only the `dontTruncate_file`
      //     expect(files).toEqual([
      //       expect.objectContaining({
      //         field: 'noTruncation',
      //         content: 'no trunc',
      //         byteLength: { readBytes: 8, truncated: false },
      //       }),
      //       expect.objectContaining({
      //         field: 'truncateSomeAbort',
      //         content: 'no trunc',
      //         byteLength: { readBytes: 8, truncated: false },
      //       }),
      //     ]);
      //   });
      // });
    });
  });
});