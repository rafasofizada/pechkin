import FormData from 'form-data';

import { parseFormData } from '../src';
import { IncomingMessage } from 'http';
import { Readable } from 'stream';
import { PechkinFile } from '../src/types';
import assert from 'assert';

describe('Files', () => {
  it('single file', async () => {
    const form = new FormData();

    form.append('file', Readable.from('file content'));

    const request = {
      headers: form.getHeaders(),
      __proto__: form,
    } as unknown as IncomingMessage;

    const { files } = await parseFormData(request);
    
    const results = [] as PechkinFile[];

    for await (const file of files) {
      results.push(file);
    }

    expect(results).toEqual([
      expect.objectContaining({
        field: 'file',
        mimeType: 'application/octet-stream',
        skipped: false,
      })
    ]);

    const file = results[0];
    assert(file.skipped === false);

    file.skipFile();

    expect(await results[0].byteLength).toBe(12);
  });


});
