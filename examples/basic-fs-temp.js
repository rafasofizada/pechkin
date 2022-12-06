const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

// If 'Pechkin' is installed, you can simply "require('pechkin')"
// or import * as pechkin from 'pechkin';
const pechkin = require('../dist/cjs');

http
  .createServer(async (req, res) => {
    if (req.method === 'POST') {
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

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ fields, files: results }, null, 2));
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`
      <h1>Pechkin File Upload</h1>
      <h2>Upload multiple files using Node.js "http" module</h2>

      <form enctype="multipart/form-data" method="post">
        <div>Text field "title": <input type="text" name="title" /></div>

        <div>Files 1 (multiple): <input type="file" name="file1" multiple="multiple" /></div>
        <div>Files 2 (multiple): <input type="file" name="file2" multiple="multiple" /></div>
        <div>File 3 (single): <input type="file" name="file3" /></div>

        <input type="submit" value="Upload" />
      </form>
    `);
  })
  .listen(8000, () => {
    console.log('Send a multipart/form-data request to localhost:8000 to see Pechkin in action...');
  });