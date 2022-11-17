import assert from 'assert';
import { createParseFormData } from './util';

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

  describe('byte length limits / truncation', () => {
    describe('onFileByteLengthLimit = truncate', () => {
      it('multiple files', async () => {
        const { results } = await createParseFormData({
          truncateAll__file: ['truncated 0 0', 'truncated 0 1'],
          truncateSome__file: ['no trunc', 'truncated'],
          truncateSingle__file: ['truncated 2 0'],
          noTruncation__file: ['no trunc', 'no trunc'],
        }, {
          base: {
            onFileByteLengthLimit: 'truncate',
            maxFileByteLength: 9,
          },
        });

        // TODO: Automate test?
        expect(results).toEqual([
          expect.objectContaining({
            field: 'truncateAll',
            content: 'truncated',
          }),
          expect.objectContaining({
            field: 'truncateAll',
            content: 'truncated',
          }),
          expect.objectContaining({
            field: 'truncateSome',
            content: 'no trunc',
          }),
          expect.objectContaining({
            field: 'truncateSome',
            content: 'truncated',
          }),
          expect.objectContaining({
            field: 'truncateSingle',
            content: 'truncated',
          }),
          expect.objectContaining({
            field: 'noTruncation',
            content: 'no trunc',
          }),
          expect.objectContaining({
            field: 'noTruncation',
            content: 'no trunc',
          }),
        ]);
      });

      it('multiple files, field override', async () => {
        const { results } = await createParseFormData({
          dontTruncate__file: ['should not be truncated'],
          truncate__file: ['should be truncated'],
          truncateLonger__file: ['should be truncated'],
        }, {
          base: {
            onFileByteLengthLimit: 'truncate',
            maxFileByteLength: 9,
          },
          fileOverride: {
            dontTruncate__file: {
              maxFileByteLength: Infinity,
            },
            truncateLonger__file: {
              maxFileByteLength: 15,
            }
          }
        });
  
        // TODO: Automate test?
        expect(results).toEqual([
          expect.objectContaining({
            field: 'dontTruncate',
            content: 'should not be truncated',
          }),
          expect.objectContaining({
            field: 'truncate',
            content: 'should be',
          }),
          expect.objectContaining({
            field: 'truncateLonger',
            content: 'should be trunc',
          }),
        ]);
      });

      it('truncated (event / promise)', async () => {
        const truncatedCallback = jest.fn();

        const truncateSettings = {
          maxFileByteLength: 1,
        };
  
        const { results } = await createParseFormData(
          {
            dontTruncate__file: ['should not be truncated'],
            truncate__file: ['should be truncated'],
          },
          {
            base: {
              onFileByteLengthLimit: 'truncate',
            },
            fileOverride: {
              truncate__file: truncateSettings
            }
          },
        );
  
        const [notTruncated, truncated] = results;
        assert(notTruncated.skipped === false); // for TS
        assert(truncated.skipped === false); // for TS
  
        await truncated.truncated.then((...args) => truncatedCallback(...args));
  
        expect(truncatedCallback).toHaveBeenCalledTimes(1);
        expect(truncatedCallback).toHaveBeenCalledWith(expect.objectContaining({ maxByteLength: truncateSettings.maxFileByteLength }));
  
        expect(truncated.truncated).resolves.toEqual(expect.objectContaining({ maxByteLength: truncateSettings.maxFileByteLength }));
      });
    });
  });
});

async function filesTest(payload: Record<`${string}__file`, string[]>) {
  const { results } = await createParseFormData(payload);

  const fieldFileCounter = {};

  for (const [resultIndex, file] of results.entries()) {
    const fieldname = file.field;
    const originalField = `${fieldname}__file`;

    fieldFileCounter[fieldname] ??= 0;
    const fileIndex = fieldFileCounter[fieldname]++;

    expect(file).toEqual(
      expect.objectContaining({
        field: fieldname,
        filename: `${fieldname}-${fileIndex}.dat`,
        mimeType: 'application/octet-stream',
        skipped: false,
        content: payload[originalField][fileIndex]
      })
    );
  }
}