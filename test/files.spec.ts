import assert from 'assert';
import FormData from 'form-data';
import { Readable } from 'stream';
import { IncomingMessage } from 'http';

import { parseFormData } from '../src';
import { PechkinConfig, PechkinFile } from '../src/types';

describe('Files', () => {
  describe('1 file per field', () => {
    it('single file', () => filesTest({ file: ['file content'] }));

    it('multiple files', () => filesTest({
      file: ['file content'],
      file1: ['file content 1'],
      fileEmpty: [''],
      file2: ['file content 2'],
    }));
  });
  
  describe('multiple files per field', () => {
    it('single file', () => filesTest({ file: ['file content'] }));

    it('multiple files', () => filesTest({
      file: ['file content 0 0', 'file content 0 1', 'file content 0 2'],
      file1: ['file content 1 0'],
    }));
  });

  describe('byte length limit', () => {
    describe('onFileByteLengthLimit = truncate', () => {
      it('multiple files', async () => {
        const results = await createParseFormData({
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

        const resultsWithContent = await Promise.all(results.map(async (result) => {
          assert(result.skipped === false); // for TS
          const content = await streamToBuffer(result.stream);
          // TODO: What's the default string encoding?
          const contentString = content.toString();
          return { ...result, content: contentString };
        }));

        // TODO: Automate test?
        expect(resultsWithContent).toEqual([
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
    });
  });
});

async function filesTest(payload: Record<string, string[]>) {
  const results = await createParseFormData(payload);

  const fieldFileCounter = {};

  for (const [resultIndex, file] of results.entries()) {
    const field = file.field;

    fieldFileCounter[field] ??= 0;
    const fileIndex = fieldFileCounter[field]++;

    const originalContentBuffer = Buffer.from(payload[field][fileIndex]);

    expect(file).toEqual(
      expect.objectContaining({
        field,
        filename: `${field}-${fileIndex}.dat`,
        mimeType: 'application/octet-stream',
        skipped: false,
      })
    );

    assert(file.skipped === false); // for TS
    const resultContentBuffer = await streamToBuffer(file.stream);

    expect(resultContentBuffer.compare(originalContentBuffer)).toBe(0);
    expect(await file.byteLength).toBe(resultContentBuffer.length);
  }
}

async function createParseFormData(
  payload: Record<string, string[]>,
  config: PechkinConfig = { base: { maxTotalFileFieldCount: Infinity, maxFileCountPerField: Infinity } }
): Promise<PechkinFile[]> {
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
  
  const results = [] as PechkinFile[];

  for await (const file of files) {
    results.push(file);
  }

  return results;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks = [] as Buffer[];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}