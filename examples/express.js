const express = require('express');
// If 'Pechkin' is installed, you can simply "require('pechkin')"
// or import * as pechkin from 'pechkin';
const { parseFormData } = require('../dist/cjs');

const app = express();

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

    for await (const { stream, field, filename } of req.files) {
      // Process files however you see fit...
      // Here, streams are simply skipped
      stream.resume();

      files.push({ field, filename });
    }

    return res.json({ fields: req.body, files });
  }
);

app.get(
  '/',
  (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`
      <h1>Pechkin File Upload</h1>
      <h2>Express</h2>

      <form enctype="multipart/form-data" method="post">
        <div>File 1 (single): <input type="file" name="file1"/></div>
        <input type="submit" value="Upload" />
      </form>
    `);
  }
)

app.listen(8000, () => console.log('Send a multipart/form-data request to localhost:8000 to see Pechkin in action...'));