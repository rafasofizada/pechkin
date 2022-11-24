# Pechkin

Pechkin is a Node.js library for handling `multipart/form-data` requests (most commonly, file uploads). It provides a simple API to parse a request and extract its fields and files.

## Comparison with Multer

Both Pechkin and Multer are written on top of [Busboy](https://github.com/mscdex/busboy). Pechkin was designed as an asynchronous, better configurable, more modern alternative to Multer.

Some specific differences and improvements:
- Asynchronous file handling.

  With Multer, you have to wait until all fields and files are parsed and processed to get access to the resulting `request` object (with fields attached to the `body` field and files to the `files` field). With Pechkin, `parseFormData(request)` returns a `fields` promise and a `files` async generator/iterator, which allows you to fields and files *as soon as they're encountered in / parsed from* the request.

  This allows you, for example, to **perform request body validation before having to process any files.**

- Separation of concerns.

  You don't have to provide any file handling implementation details to Pechkin, unlike with Multer, where you need to provide a [`StorageEngine` class](https://github.com/expressjs/multer/blob/master/StorageEngine.md). Pechkin provides you easy access to fields and files, their handling is totally up to you.

- Flexible configuration.
  Apart from all the configuration options Multer provides, you get:
  - Per-field file length (`config.fileOverride`**`.maxFileByteLength`**) & count (`config.fileOverride`**`.maxFileCountPerField`**) configuration options;
  - Per-field choice between aborting the entire request (due to error or filter/constraint failures) and simply skipping / ignoring the file





TODO:
- Filters ?
- Function to abort request