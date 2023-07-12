import { Server, createServer, request as createRequest } from 'http';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import { Readable } from 'stream';
import { tmpdir } from 'os';

import { beforeAll, describe, expect, it } from 'vitest';
import { FormData, File } from 'formdata-node';
import { FormDataEncoder } from 'form-data-encoder';

import { FieldLimitError, parseFormData } from '../src';

describe('E2E - byte length limit', () => {
  let server: Server;
  const filename = 'file.txt';
  const port = 8000;

  beforeAll(() => {
    server = createServer(async (req, res) => {
      if (req.method === 'POST') {
        const { files } = await parseFormData(req, {
          maxFileByteLength: 10,
        });
    
        for await (const { filename, stream } of files) {
          // write to a temp file
          try {
            await pipeline(stream, createWriteStream(join(tmpdir(), filename)));
          } catch (error) {
            // Should send "maxFileByteLength" to client
            res.end((error as FieldLimitError).limitType);
          }
        }
    
        res.end("File uploaded");
      } else {
        res.statusCode = 404;
        res.end('Not Found');
      }
    });

    server.listen(port);
  })

  it('should catch error if file byte length exceeds limit', () => new Promise<void>((resolve, reject) => {
    const fileContent = 'This is a long file content.';
    

    const form = new FormData();
    form.append(
      'file',
      new File([fileContent], filename),
      filename
    );

    const encoder = new FormDataEncoder(form);
    const stream = Readable.from(encoder.encode());

    const request = createRequest(
      {
        method: 'POST',
        host: 'localhost',
        port,
        path: '/',
        headers: encoder.headers,
      },
      (res) => {
        console.log(`Response status code: ${res.statusCode}`);
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          console.log(`Response body: ${chunk}`);
        });
      }
    );
    
    stream.pipe(request);

    request.on('response', (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        expect(chunk).toBe('maxFileByteLength');
        resolve();
      });
    });
  }));
});