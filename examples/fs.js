const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

// If 'pechkin' is installed as an NPM package,
// you can simply `const pechkin = require('pechkin')`
// or `import * as pechkin from 'pechkin';`

// Use the dist/esm distribution if you're using ESM modules (import)
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

      for await (const { filename: originalFilename, stream, ...file } of files) {
        const newFilename = `${Math.round(Math.random() * 1000)}-${originalFilename}`;
        const dest = path.join(os.tmpdir(), newFilename);

        // Pipe the stream to a file
        // The stream will start to be consumed after the current block of code
        // finishes executing...
        stream.pipe(fs.createWriteStream(dest));
        
        // ...which allows us to set up event handlers for the stream and wrap
        // the whole thing in a Promise, so that we can get the stream's length.
        const length = await new Promise((resolve, reject) => {
          stream
            // `stream` is an instance of Transform, which is a Duplex stream,
            // which means you can listen to both 'end' (Readable side)
            // and 'finish' (Writable side) events.
            .on('end', () => resolve(stream.bytesWritten))
            .on('finish', () => resolve(stream.bytesWritten))
            // You can either reject the Promise and handle the Promise rejection
            // using .catch() or await + try-catch block, or you can directly
            // somehow handle the error in the 'error' event handler.
            .on('error', reject);
        })

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