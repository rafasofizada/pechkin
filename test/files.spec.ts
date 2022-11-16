import assert from 'assert';
import FormData from 'form-data';
import { Readable } from 'stream';
import { IncomingMessage } from 'http';

import { parseFormData } from '../src';
import { PechkinConfig, PechkinFile } from '../src/types';

describe('Files', () => {
  describe('1 file per field', () => {
    it('single field', () => filesTest({ file: ['file content'] }));

    it('multiple fields', () => filesTest({
      file: ['file content'],
      file1: ['file content 1'],
      fileEmpty: [''],
      file2: ['file content 2'],
    }));
  });
  
  describe('multiple files per field', () => {
    it('single field', () => filesTest({ file: ['file content'] }));

    it('multiple fields', () => filesTest({
      file: ['file content 0 0', 'file content 0 1', 'file content 0 2'],
      file1: ['file content 1 0'],
    }));
  });

  describe('byte length limits / truncation', () => {
    describe('onFileByteLengthLimit = truncate', () => {
      it('multiple files', async () => {
        const results = await createParseFileFormData({
          truncateAll: ['truncated 0 0', 'truncated 0 1'],
          truncateSome: ['no trunc', 'truncated'],
          truncateSingle: ['truncated 2 0'],
          noTruncation: ['no trunc', 'no trunc'],
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
        const results = await createParseFileFormData({
          dontTruncate: ['should not be truncated'],
          truncate: ['should be truncated'],
          truncateLonger: ['should be truncated'],
        }, {
          base: {
            onFileByteLengthLimit: 'truncate',
            maxFileByteLength: 9,
          },
          fileOverride: {
            dontTruncate: {
              maxFileByteLength: Infinity,
            },
            truncateLonger: {
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
  
        const results = await createParseFileFormData(
          {
            dontTruncate: ['should not be truncated'],
            truncate: ['should be truncated'],
          },
          {
            base: {
              onFileByteLengthLimit: 'truncate',
            },
            fileOverride: {
              truncate: truncateSettings
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

type TestFile = PechkinFile & { content: string | null };

async function filesTest(payload: Record<string, string[]>) {
  const results = await createParseFileFormData(payload);

  const fieldFileCounter = {};

  for (const [resultIndex, file] of results.entries()) {
    const field = file.field;

    fieldFileCounter[field] ??= 0;
    const fileIndex = fieldFileCounter[field]++;

    expect(file).toEqual(
      expect.objectContaining({
        field,
        filename: `${field}-${fileIndex}.dat`,
        mimeType: 'application/octet-stream',
        skipped: false,
        content: payload[field][fileIndex]
      })
    );
  }
}

// TODO: Combine with fields.spec.ts, generic createParseFormData()
async function createParseFileFormData(
  payload: Record<string, string[]>,
  config: PechkinConfig = { base: { maxTotalFileFieldCount: Infinity, maxFileCountPerField: Infinity } }
): Promise<TestFile[]> {
  // Defaults
  config.base = {
    maxFileCountPerField: Infinity,
    maxTotalFileFieldCount: Infinity,
    ...config.base,
  };

  const form = new FormData();

  for (const [fieldname, files] of Object.entries(payload)) {
    for (const [i, file] of files.entries()) {
      form.append(fieldname, Readable.from(file), { filename: `${fieldname}-${i}.dat` });
    }
  }

  const request = {
    headers: form.getHeaders(),
    __proto__: form,
  } as unknown as IncomingMessage;

  const { files } = await parseFormData(request, config);
  
  const results = [] as TestFile[];

  for await (const file of files) {
    const result = {
      ...file,
      content: file.stream ? await streamToString(file.stream) : null,
    };

    results.push(result);
  }

  return results;
}

// TODO: What's the default string encoding?
async function streamToString(stream: Readable): Promise<string> {
  const buffer = await streamToBuffer(stream);
  return buffer.toString();
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks = [] as Buffer[];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}