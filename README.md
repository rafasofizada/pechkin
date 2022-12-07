<p align="middle"><img src="https://user-images.githubusercontent.com/19387589/205964030-6f8511d0-dc1a-4939-bda7-2e078e1438de.jpeg" width="200" /></p>

# Pechkin

Pechkin is a modern, asynchronous, flexible and configurable Node.js library for handling file uploads (i.e. `multipart/form-data` requests), written in TypeScript. It's optimized for complex usecases with fields and multiple files mixed together.

# Features
- **Fast**, based on [`busboy`](https://www.npmjs.com/package/busboy).
- **No temporary files are created, files are not loaded in memory.**
- **Asynchronous**, `Promise`- and `AsyncIterator`-based. Fields and each file are available as `Promise`s as soon as they're parsed.
- **Flexible**: you don't need to provide any storage engines, file handlers, etc. Pechkin only provides the parsed data in form of streams and promises, and you can do whatever you want with it.
- **Highly configurable**, with possibility to [override some configuration](#parameter-filefieldconfigoverride) options per-field (e.g. `maxFileByteLength: 1MB` for all files, but `5MB` for file fieldname `my_custom_video_file`).
- **Expressive** TypeScript typings.
- **Robust error handling**: you can be sure that all errors have been caught, handled, and underlying resources (streams) were properly handled/closed.
- **Only 1 dependency** (busboy).

# Requirements

- Node.js v13.6.0+ ([`events.on()` dependency](https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V13.md#13.6.0))

# Installation

```npm install pechkin```

# Examples / Usage

## TL;DR

- All fields in the `FormData` request should come before any files. Any fields submitted after the first file are lost.
- `parseFormData()` returns a `Promise` that resolves when all fields are parsed, and the first file is encountered (or the request ended).
- The promise contains a populated `fields` object, and a `files` `AsyncIterator`/`AsyncIterable`.
- Asynchronously iterate over the `files` using the `for-await-of` loop or using the `next()` method.
- File streams should always be consumed (e.g. by the code inside `for-await-of` loop, or before the subsequent `next()` call). Otherwise the request parsing will stall.

## FOR FULL WORKING EXAMPLES, SEE THE `examples/` FOLDER 


**Importing**

The package provides both CommonJS and ESM modules.

```js
// ESM: index.mjs

import * as pechkin from 'pechkin';
// or
import { parseFormData } from 'pechkin';

// CommonJS: index.cjs

const pechkin = require('pechkin');
// or
const { parseFormData } = require('pechkin');
```

## [Essential: save to random temp location](./examples/basic-fs-temp.js)
**Files are processed sequentially.**

```js

// Full working example: `examples/basic-fs-temp.js`

http.createServer(async (req, res) => {
  const { fields, files } = await pechkin.parseFormData(req, {
    maxTotalFileFieldCount: Infinity,
    maxFileCountPerField: Infinity,
    maxTotalFileCount: Infinity
  });

  const results = [];

  for await (const { filename: originalFilename, byteLength, stream, ...file } of files) {
    const newFilename = `${Math.round(Math.random() * 1000)}-${originalFilename}`;
    const dest = path.join(os.tmpdir(), newFilename);

    stream.pipe(fs.createWriteStream(dest));
    /*
    `byteSize` resolves only after the entire `file.stream` has been consumed
    You should `await byteSize` only AFTER the code that consumes the stream
    (e.g. uploading to AWS S3, loading into memory, etc.)
    */
    const length = await byteLength;

    results.push({ ...file, dest, originalFilename, newFilename, length});
  }

  console.log(results);

  /*
  OUTPUT:

  {
    "fields": { [fieldname: string]: string },
    "files": [
      {
        "field": string,
        "filename": string,
        "mimeType": string,
        "dest": string,
        "originalFilename": string,
        "newFilename": string,
        "length": number
      },
      ...
    ],
  }
  */
});
```

## [Essential: processing files sequentially (get SHA-256 hash)](./examples/sequential.js)

In this example, we iterate over all files sequentially, and process them one by one – the next file is accessed and processed only after the previous file is done.
Processing here will be calculating a SHA-256 hash from the stream.

```js
// Full working example: `examples/sequential.mjs`

import { createHash } from 'crypto';

/*
...
Boilerplate code
...
*/
const fileHashes = [];

for await (const { stream, field, filename, byteLength, mimeType } of files) {
  // `Hash` class: https://nodejs.org/api/crypto.html#class-hash
  const hash = createHash('sha256');

  // You can also use pipe(), or listen to 'data' events, or any other method,
  // Regardless, you always have to consume the stream.
  for await (const chunk of stream) {
    hash.update(chunk);
  }

  fileHashes.push({
    field,
    filename,
    mimeType,
    // Remember to always `await` the `byteLength` promise AFTER the stream has been consumed!
    length: await byteLength,
    hash: hash.digest('hex'),
  });
}
```

## [Advanced: processing files in batches (upload to AWS S3)](./examples/batch-upload-s3.js)

In this example, we process files in batches of three – the next batch of files is accessed and processed only after the previous batch is done.
Processing here will be uploading the files to AWS S3.

```js
// FULL WORKING EXAMPLE: `examples/batch-upload-s3.js`

import { createHash } from 'crypto';

// ... Boilerplate code ...

const { fields, files } = await pechkin.parseFormData(req, {
  maxTotalFileFieldCount: Infinity,
  maxFileCountPerField: Infinity,
  maxTotalFileCount: Infinity
});

const results = [];
let batch = [];
let i = 0;

for await (const { filename: originalFilename, stream, field } of files) {
  const key = `${i}-${originalFilename}`;

  batch.push(
    uploadFileToS3(key, stream) // Check implementation in 
      .then(({ Location }) => ({ field, originalFilename, location: Location }))
  );

  if (batch.length === 3) {
    results.push(await Promise.all(batch));
    batch = []; // restart batch
  }
  
  i++;
}

// Process the last batch
results.push(await Promise.all(batch));

console.log(results);
/*
OUTPUT:

{
  "fields": { [fieldname: string]: string },
  "files": [
    // batches of 3 files
    [
      {
        [fieldname: string]: {
          "field": string,
          "originalFilename": string,
          "location": string          // (AWS S3 URL)
        },
      },
      ...
    ],
    ...
  ],
}
*/
```

## [Express](./examples/express.js)

Pechkin doesn't provide an Express middleware out-of-the-box, but it's very easy to create one yourself.

```js

// FULL WORKING EXAMPLE: `examples/express.js`

// ... Boilerplate code ...

function pechkinFileUpload (config, fileFieldConfigOverride, busboyConfig) {
  return async (req, res, next) => {
    try {
      const { fields, files } = await parseFormData(req, config, fileFieldConfigOverride, busboyConfig);

      req.body = fields;
      req.files = files;

      return next();
    } catch (err) {
      return next(err);
    }
  }
}

app.post(
  '/',
  pechkinFileUpload(),
  async (req, res) => {
    const files = [];

    for await (const { stream, field, filename, byteLength } of req.files) {
      // Process files however you see fit...
      // Here, streams are simply skipped
      stream.resume();

      files.push({ field, filename, length: await byteLength });
    }

    return res.json({ fields: req.body, files });
  }
);

// ... Boilerplate code ...

```

# API

Pechkin exposes only 1 function:

## `parseFormData()`

**Type:**
```ts
function parseFormData(
  request:                  IncomingMessage,
  config?:                  Pechkin.Config
  fileFieldConfigOverride?: Pechkin.FileFieldConfigOverride,
  busboyConfig?:            Pechkin.BusboyConfig,
): Promise<{
  fields: Pechkin.Fields,
  files:  Pechkin.Files,
}>
```

Given a `request` (of type `http.IncomingMessage`, e.g. the request object in [`http.createServer((`<u>**`req`**</u>`, ...) => { ... })`](https://nodejs.org/api/http.html#httpcreateserveroptions-requestlistener)),
return a Promise, containing:
- All parsed `fields`,
- An [`AsyncIterableIterator`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#the_async_iterator_and_async_iterable_protocols) of `files`, which you can use both as an iterator (calling `await files.next()`), or as an iterable (`for await (const file of files) { ... }`).


> **🚧 Warning:**
>
> `fields` are parsed **only until the first `file`** – when constructing a `FormData` request, you should always put all `fields` before any `files`.



## Parameter: `config`

All fields are optional. Numerical limits are **INCLUSIVE**.

<!-- https://www.tablesgenerator.com/markdown_tables -->

| Key | Type | Default | Description |
|---|---|---|---|
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



## Parameter: `fileFieldConfigOverride`

For each field, you can set the values of:
- **`maxFileCountPerField`**
- **`maxFileByteLength`**
- **`abortOnFileByteLengthLimit`**

which will _override the values in the general `config`_ (including the defaults). The values for numerical limits can be both smaller and larger than the ones in the general `config`.

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

Now, if you send a `FormData` request with following structure _(represented as JSON, this is NOT a valid FormData request)_:

```json5
{
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
  },
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

## Parameter: `busboyConfig`

**Type:** `Pechkin.BusboyConfig`, which equals to `Busboy.Config` (from [`busboy` package](https://github.com/mscdex/busboy#exports)) **without the `limits` property**.
Limits passed to `busboy` are ignored, and instead the limits are set by `pechkin`'s `config` & `fileFieldConfigOverride` parameters are used.

## Return value: `Files` AsyncIterator / AsyncIterable

**Type:**
```ts
type Files = {
  next: () => Promise<{
    done: boolean
    value: Pechkin.File
  }>,
  return: () => Promise<void>,
  throw: (error: Error) => Promise<void>,
  [Symbol.asyncIterator]: () => this
}
```

`Files` is both an `AsyncIterator` and an `AsyncIterable`, so you can use it both as an iterator (calling `await files.next()`) and as an iterable (`for await (const file of files) { ... }`). It is recommended to use it only as an iterable in a `for-await-of` loop, as it's much easier and less error-prone to use.

> ❗️ **Very important note on iteration:**
>
> The `file.stream` should always be consumed, otherwise the request parsing will hang, and you might never get access to the next file. If you don't care about a particular file, you can simply do `file.stream.resume()`, but the stream should **always** be consumed.

### (Internal) error handling

This section is for those who want to know how errors are handled internally. This is not necessary to use `pechkin`.

- If an error occurs inside `next()` (for example, a file exceeded its `maxFileByteLength` limit), a cleanup function is called, which unpipes the request from the parser (busboy), the iterator is stopped, and the error is thrown.
- If an error occurs inside the body of the `for-await-of` loop, `return()` is called, a cleanup function is called, and the iterator is stopped.
- If an error occurs anywhere else inside Pechkin, `throw()` method is called, which either:
  - Rejects the currently-awaited `next()` call,
  - Or, if there is no `next()` call currently awaited, sets the next `next()` call to reject with the error.

  Apart from that, the usual cleanup function is called, and the iterator is stopped.

## Type: `File`

```ts
{
  filename: string;
  encoding: string;
  mimeType: string;
  field: string;
  byteLength: Promise<FileByteLengthInfo>;
  stream: stream.Readable;
}
```

- `filename`: The client-provided filename of the file.
- `encoding`: The encoding of the file. [List of encodings](https://nodejs.org/api/buffer.html#buffers-and-character-encodings) supported by Node.js.
- `mimeType`: The MIME type of the file. If the MIME type is crucial for your application, you should not trust the client-provided `mimeType` value – the client can easily lie about it (e.g. send an `.exe` file with `mimeType: "image/png"`). Instead, you should use a library like [`file-type`](https://github.com/sindresorhus/file-type).
- `field`: The name of the field the file was sent in.
- `byteLength`:
  - If `maxFileByteLength` **is exceeded**:
    - If `abortOnFileByteLengthLimit === true`:  A `Promise` that **rejects** with a `FieldLimitError` error of type `maxFileByteLength`.
    - If `abortOnFileByteLengthLimit === false`: A `Promise` that **resolves** with an object of type `FileByteLengthInfo`:
      ```ts
      {
        truncated: true;
        readBytes: number; // always equal to `maxFileByteLength` for the field
      }
      ```
      The file stream will be truncated to `readBytes` bytes, so `readBytes` in this situation always equals the `maxFileByteLength` limit for the field.
  - If `maxFileByteLength` is **not** exceeded:
    ```ts
    {
      truncated: false;
      readBytes: number;
    }
    ```
    Where readBytes equals to the actual number of bytes read from the stream.

  > 📝 Note: `byteLength` is encoding-agnostic.
- `stream`: The file `Readable` stream. The stream should **always** be consumed, otherwise the request parsing will hang, and you might never get access to the next file. If you don't care about a particular file, you can simply do `file.stream.resume()`, but the stream should **always** be consumed.
  > ❗️ **Very important note on `stream`:**
  >
  > The `file.stream` should always be consumed, otherwise the request parsing will hang, and you might never get access to the next file. If you don't care about a particular file, you can simply do `file.stream.resume()`, but the stream should **always** be consumed.

