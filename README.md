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
function parseFormData<TSave, TRemove>(
  request:                    IncomingMessage,
  config?:                    | Pechkin.Config
                              | Pechkin.ConfigWStorageEngine<TSave, TRemov>,
  fileFieldConfigOverride?:   Pechkin.FileFieldConfigOverride,
  busboyConfig?:              Pechkin.BusboyConfig,
): Promise<{
  fields: Pechkin.Fields,
  files:
    | Pechkin.Files
    | Pechkin.ProcessedFiles<S>,
}>
```

Given a `request` (of type `http.IncomingMessage`, e.g. the request object in [`http.createServer((`<u>**`req`**</u>`, ...) => { ... })`](https://nodejs.org/api/http.html#httpcreateserveroptions-requestlistener)),
return a Promise, containing:
- All parsed `fields`,
- An [`AsyncIterableIterator`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#the_async_iterator_and_async_iterable_protocols) of `files`, which you can use both as an iterator (calling `await files.next()`), or as an iterable (`for await (const file of files) { ... }`).


> **🚧 Warning:**
>
> `fields` are parsed **only until the first `file`** – when constructing a `FormData` request, you should always put all `fields` before any `files`.



### `config`

Type: `Pechkin.Config` (without `storageEngine` value provided) or `Pechkin.ConfigWStorageEngine<TSave, TRemove>` (with `storageEngine` provided)
All fields are optional. Numerical limits are **INCLUSIVE**.

<!-- https://www.tablesgenerator.com/markdown_tables -->

| Key | Type | Default | Description |
|---|---|---|---|
| storageEngine | `StorageEngine` | `NoStorageEngine` | The storage implementation to use. See `Files::Usage with StorageEngine` and `StorageEngine`. |
| maxTotalHeaderPairs | number | 2000 | From Busboy: the max number of header key-value pairs to parse.<br>Default is same as node's http module. |
| maxTotalPartCount | number | 110 (100 fields + 10 files) | The max number of parts (fields + files). |
| maxFieldKeyByteLength | number | 100 bytes | The max byte length (each char is 1 byte) of a field name. |
| maxFieldValueByteLength | number | 1024 * 1024 bytes, 1 MB | The max byte length of a field value. |
| maxTotalFieldCount | number | 100 | The max total number of all non-file fields. |
| maxTotalFileFieldCount | number | 1 | The max total number of all file fields.<br>Each file field may contain more than 1 file, see `config.maxFileCountPerField`.<br><br>To use if you have more than 1 `<input type="file">`. |
| maxTotalFileCount | number | 10 | The max total number of all files (summed across all fields). |
| maxFileByteLength | number | 50 * 1024 * 1024 (50 MB) | The max byte length of a file |
| maxFileCountPerField | number | 1 | The max number of files allowed for each file field.<br><br>To use with `<input type="file" multiple>`. |
| abortOnFileByteLengthLimit | boolean | true | If a file goes over the `maxFileByteLength` limit, whether to:<br><br>- Throw an error (and do cleanup, i.e. abort the entire operation), or<br>- To truncate the file. |



### `fileFieldConfigOverride`

For each field, you can the values of:
- **`maxFileCountPerField`**
- **`maxFileByteLength`**
- **`abortOnFileByteLengthLimit`**
which will override the values in the general `config` (including the defaults). The values for numerical limits can be both smaller and larger than the ones in the general `config`.

**Example:**

Let's say you configured `parseFormData()` the following way:

```ts
await parseFormData(
  request,
  {
    maxFileByteLength: 15, // 10 bytes
  },
  {
    exampleOverrideFile: {
      maxFileByteLength: 10, // 5 bytes
      abortOnFileByteLengthLimit: false,
    }
  },
  ...
)
```

Now, if you send a `FormData` request with following properties _(represented as JSON, this is NOT a valid FormData request)_:

```json5
{
  "field1": {
    "type": "field",
    "value": "based",
  },
  "normalFile": {
    "type": "file",
    /*
    byte length (15) === config.maxFileByteLength,
    no error thrown,
    no truncation
    */
    "content": "15 bytes, innit?"
  },
  "examplePriorityFile": {
    "type": "file",
    /*
    byte length (10) > fileFieldConfigOverride["exampleOverrideFile"],
    fileFieldConfigOverride["exampleOverrideFile"].abortOnFileByteLengthLimit === false,
    FILE TRUNCATED TO 10 BYTES: "will be tr"
    */
    "content": "will be truncated" 
  }
  "file2": {
    "type": "file",
    /*
    byte lenght (26) > config.maxFileByteLength,
    config.abortOnFileByteLengthLimit === true (by default, as no custom value and no override was provided),
    ERROR THROWN:

    Exceeded file byte length limit ("maxFileByteLength").
    Corresponding Busboy configuration option: Busboy.Limits["files"].
    Field: "file2".
    Configuration info: 26
    */
    "content": "26 bytes, so will throw :("
  }
}
```


TODO:
- Restrict allowed file fields
- ? Optional storage engine
- Examples for:
  - Express / Koa middleware examples
  - Concurrent / one-to-one / batch processing of files
- Test Node.js version compatibility
- Test NPM library build

https://v4.chriskrycho.com/2018/how-to-bundle-typescript-type-definitions.html