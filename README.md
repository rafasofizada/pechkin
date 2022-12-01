# Pechkin

Pechkin is a Node.js library for handling `multipart/form-data` requests (most commonly, file uploads). It provides a simple API to extract fields and files from a request.

## Comparison with Multer

Both Pechkin and Multer are written on top of [Busboy](https://github.com/mscdex/busboy). Pechkin was designed as a modern, asynchronous, configurable alternative to Multer. By level of abstraction, Pechkin fits a good spot between Busboy and Multer – it simplifies and provides configuration for Busboy's "state machine", yet is more flexible and less abstracted than Multer.

Some specific differences and improvements:

- **Asynchronous file handling.**

  With Multer, you have to wait until all fields and files are parsed and processed to get access to the resulting `request` object (with fields attached to the `body` field and files to the `files` field). With Pechkin, `await parseFormData(request)` returns a `fields` object and a `files` async generator/iterator, which allows you to access:

  - Fields, before any file is processed;
  - Each file *as soon as it's encountered* in the request, one after another.

  This allows you, for example, to **perform request body validation before having to process any files.**

- **Separation of concerns.**

  You don't have to provide any file handling implementation to Pechkin, unlike with Multer and its [`StorageEngine` class](https://github.com/expressjs/multer/blob/master/StorageEngine.md). Pechkin provides you easy access to fields and files, their handling is totally up to you.

- **Flexible configuration.**

  Apart from all the configuration options Multer provides, you get:

  - Per-field file length (`config.fileOverride.maxFileByteLength`) & count (`config.fileOverride.maxFileCountPerField`) configuration options;
  - Per-field choice between aborting the entire request (due to error or filter/constraint failures) and simply skipping / ignoring the file.

## Requirements

- Node.js v13.6.0+ ([`events.on()` dependency](https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V13.md#13.6.0))

## Installation

```npm install pechkin```

## Examples / Usage

**Importing**

The package provides both CommonJS and ESM modules.

```js
// ESM: index.mjs

import * as pechkin from 'pechkin';
// or
import { parseFormData } from 'pechkin';

// CommonJS: index.js

const pechkin = require('pechkin');
// or
const { parseFormData } = require('pechkin');
```

### Basic (standard HTTP module) – save to random temp location

```js
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const pechkin = require('pechkin');

http
  .createServer(async (req, res) => {
    if (req.method === 'POST') {
      const { fields, files } = await pechkin.parseFormData(req);

      console.log('Received fields:', fields); // request body

      for await (const { stream, field, filename, byteLength, mimeType } of files) {
        // In real projects use https://www.npmjs.com/package/mime-types to convert mimetypes to extensions.
        const extension = mimeType.split('/')[1]; 
        stream.pipe(fs.createWriteStream(path.join(os.tmpdir(), `${filename}.${mimeType.split('/')[1]}`)));

        // `byteSize` is a promise that resolves only after the entire `file.stream` has been consumed
        // (in this case – stream finishes piping, emits an 'end' event and the file gets saved to the file system).
        // You should `await byteSize` only after the code that consumes the stream (e.g. uploading to AWS S3,
        // loading into memory, etc.)
        console.log('Received file:', { field, filename, mimeType, length: await byteLength });
      }

      res.writeHead(200);
      return res.end();
    }

    res.writeHead(404);
    return res.end();
  })
  .listen(8000, () => {
    console.log('Send a multipart/form-data request to localhost:8000 to see Pechkin in action...');
  });
```

### Express – save to random temp location

Pechkin **doesn't provide an Express middleware** out-of-the-box, but it's extremely easy to create one yourself.

## API

TODO:
- Filters ?
- Function to abort request
- Express middleware
- Test Node.js version compatibility
- Test NPM library build
- https://v4.chriskrycho.com/2018/how-to-bundle-typescript-type-definitions.html