const http = require("http");

const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require('@aws-sdk/lib-storage');

// If 'pechkin' is installed as an NPM package,
// you can simply `const pechkin = require('pechkin')`
// or `import * as pechkin from 'pechkin';`

// Use the dist/esm distribution if you're using ESM modules (import)
const pechkin = require("../dist/cjs");

const s3Client = new S3Client({
  credentials: {
    accessKeyId: "PROVIDE_YOUR_OWN",
    secretAccessKey: "PROVIDE_YOUR_OWN",
  },
  region: "us-east-1",
});

function uploadFileToS3(key, stream) {
  const upload = new Upload({
    client: s3Client,
    params: {
      Key: key,
      Bucket: "vrjam-firstbridge",
      Body: stream,
    }
  });

  return upload.done();
}

http
  .createServer(async (req, res) => {
    if (req.method === 'POST') {
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

        results.push(
          await uploadFileToS3(key, stream)
            .then(({ Location }) => ({
              field,
              originalFilename,
              location: Location,
              // Here, we expect the stream to be fully consumed by `uploadFileToS3()`,
              // so there's no need to wait for the 'end'/'finish' events to obtain the correct
              // byte length of the stream – bytesWritten already reached its final value.

              // This is in contrast with the example in `examples/fs.js`, where we
              // need to wait for the 'end'/'finish' events to obtain the correct
              // byte length of the stream.
              length: stream.bytesWritten,
            }))
        );
        
        i++;
      }

      results.push(await Promise.all(batch)); // process the last batch

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ fields, files: results }, null, 2));
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`
      <h1>Pechkin File Upload</h1>
      <h2>Upload files in batches to AWS S3</h2>

      <form enctype="multipart/form-data" method="post">
        <div>Files 1 (multiple): <input type="file" name="file1" multiple="multiple" /></div>
        <input type="submit" value="Upload" />
      </form>
    `);
  })
  .listen(8000, () => {
    console.log('Send a multipart/form-data request to localhost:8000 to see Pechkin in action...');
  });
