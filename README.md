# Plan
- Rewrite the intro / comparison with Multer with the consideration that:
  - Pechkin is mostly an abstraction / simplification over Busboy, rather than a drop-in replacement for Multer
  - Pechkin doesn't provide Multer::StorageEngine yet, but it's in TODO
  - Compare with Formidable
  - Focus on multiple files, mixed with fields
- Examples:
  


# Pechkin

Pechkin is a modern, asynchronous, flexible and configurable Node.js library for handling file uploads (i.e. `multipart/form-data` requests), written in TypeScript. It's optimized for complex usecases with fields and multiple files mixed together.

# Highlights
- **Fast** (based on [`busboy`](https://www.npmjs.com/package/busboy))
- **Asynchronous**, `Promise`- and `AsyncIterator`-based. Fields and each file are available as `Promise`s as soon as they're parsed.
- **Flexible**: you can provide your own storage implementation, use the `MemoryStorageEngine` and `DiskStorageEngine` included in the library, or provide _no implementation_ and handle the `files` `AsyncIterableIterator` yourself.
- **Highly configurable**, with possibility to override (some) configuration options per-field.
- **Expressive** TypeScript typings.
- **Robust error handling**: you can be sure that all errors have been caught, handled, and underlying resources (streams) were properly handled/closed.

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

Pechkin **doesn't provide an Express middleware** out-of-the-box, but it's very easy to create one yourself.

## API

Pechkin exposes only 1 function:

### `Pechkin.parseFormData()`

```ts
function parseFormData<S, R>(
  request:                    IncomingMessage,
  config?:                    | Pechkin.Config
                              | Pechkin.ConfigWStorageEngine<S, R>,
  fileFieldConfigOverride?:   Pechkin.FileFieldConfigOverride,
  busboyConfig?:              Pechkin.BusboyConfig,
): Promise<{
  fields: Pechkin.Fields,
  files:
    | Pechkin.Files
    | Pechkin.ProcessedFiles<S>,
}>
```

Given a `request` (of type `http.IncomingMessage`, e.g. the request object in [`http.createServer((`**`req, `**`...) => { ... })`](https://nodejs.org/api/http.html#httpcreateserveroptions-requestlistener)),
return a Promise, containing:
- All parsed `fields`,
- An [`AsyncIterableIterator`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#the_async_iterator_and_async_iterable_protocols) of `files`, which you can use both as an iterator (calling `await files.next()`), or as an iterable (`for await (const file of files) { ... }`).

> 🚧 `fields` are parsed **only until the first `file`** – when constructing a `FormData` request, you should always put all `fields` before any `files`.

### Configuration



TODO:
- Restrict allowed file fields
- ? Optional storage engine
- Examples for:
  - Express / Koa middleware examples
  - Concurrent / one-to-one / batch processing of files
- Test Node.js version compatibility
- Test NPM library build

https://v4.chriskrycho.com/2018/how-to-bundle-typescript-type-definitions.html