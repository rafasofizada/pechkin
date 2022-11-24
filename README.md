# Pechkin

Pechkin is a Node.js library for handling `multipart/form-data` requests (most commonly, file uploads). It provides a simple API to extract fields and files from a request.

## Comparison with Multer

Both Pechkin and Multer are written on top of [Busboy](https://github.com/mscdex/busboy). Pechkin was designed as an asynchronous, more configurable, modern alternative to Multer.

Some specific differences and improvements:

- **Asynchronous file handling.**

  With Multer, you have to wait until all fields and files are parsed and processed to get access to the resulting `request` object (with fields attached to the `body` field and files to the `files` field). With Pechkin, `parseFormData(request)` returns a `fields` promise and a `files` async generator/iterator, which allows you to access fields and files *as soon as they're encountered in / parsed from* the request.

  This allows you, for example, to **perform request body validation before having to process any files.**

- **Separation of concerns.**

  You don't have to provide any file handling implementation details to Pechkin, unlike with Multer, where you need to provide a [`StorageEngine` class](https://github.com/expressjs/multer/blob/master/StorageEngine.md). Pechkin provides you easy access to fields and files, their handling is totally up to you.

- **Flexible configuration.**

  Apart from all the configuration options Multer provides, you get:

  - Per-field file length (`config.fileOverride`**`.maxFileByteLength`**) & count (`config.fileOverride`**`.maxFileCountPerField`**) configuration options;
  - Per-field choice between aborting the entire request (due to error or filter/constraint failures) and simply skipping / ignoring the file

## Requirements

- Node.js vX or newer

## Installation

```npm install pechkin```

## Examples / Usage

**Importing**

- CommonJS
- ES6 modules
- etc.

**Basic (standard HTTP module) – save to random temp location**

```js
const { randomUUID } = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const pechkin = require('pechkin');

http
  .createServer(async (req, res) => {
    if (req.method === 'POST') {
      const { fields, files } = pechkin.parseFormData(req);

      console.log('Received fields!', await fields); // request body

      for await (const { stream, field, filename, byteLength, mimeType } of files) {
        // "Hack" that only works for image/png,jpeg,jpg, etc. 
        // Use https://www.npmjs.com/package/mime-types to convert mimetypes to extensions.
        const extension = mimeType.split('/')[1]; 
        stream.pipe(fs.createWriteStream(path.join(os.tmpdir(), `${filename}-${randomUUID()}.${mimeType.split('/')[1]}`)));

        // `byteSize` is a promise that resolves only after the entire `file.stream` has been consumed
        // (in this case – stream finishes piping, emits an 'end' event and the file gets saved to the file system).
        // You should `await byteSize` only after the code that consumes the stream (e.g. uploading to AWS S3,
        // loading into memory, etc.)
        console.log('Received file!', { field, fieldname, mimeType, length: await byteSize });
      }

      return;
    }

    res.writeHead(404);
    res.end();
  })
  .listen(8000, () => {
    console.log('Send a multipart/form-data request to see Pechkin in action...');
  });
```

## API

TODO:
- Filters ?
- Function to abort request
- Express middleware
- Determine Node.js version requirement
- Packaging as library, module systems