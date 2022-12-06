const http = require("http");

const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require('@aws-sdk/lib-storage');

// If 'Pechkin' is installed, you can simply "require('pechkin')"
// or import * as pechkin from 'pechkin';
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

        batch.push(
          uploadFileToS3(key, stream)
            .then(({ Location }) => ({ field, originalFilename, location: Location }))
        );

        if (batch.length === 3) {
          results.push(await Promise.all(batch));
          batch = []; // restart batch
        }
        
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
