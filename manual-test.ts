import { createWriteStream } from "fs";
import { createServer } from "http";
import { parseFormData } from ".";

createServer(
  async (req, res) => {
    const { fields, files } = await parseFormData(
      req,
      {
        base: {
          maxTotalHeaderPairs: 2000,
          // TODO (IMPORTANT): maxTotalPartCount seems to be non-inclusive, all other limits inclusive
          maxTotalPartCount: 6,
          maxTotalFieldCount: 3,
          maxTotalFileCount: 3,
          // TODO (IMPORTANT): maxFieldKeyByteLength not implemented in Busboy!
          maxFieldKeyByteLength: 10,
          maxFieldValueByteLength: 10,
          maxFileByteLength: 100 * 1024,
          maxFileCountPerField: 2,
          onExceededFileCountPerField: false,
        }
      }
    );

    console.log(fields);

    const count = {};

    for await (const { byteLength, stream, ...restFile } of files) {
      count[restFile.field] ??= 0;
      count[restFile.field] += 1;

      const dest = createWriteStream(`${restFile.field}-${count[restFile.field]}.${restFile.mimeType.split('/')[1]}`);
      stream?.pipe(dest);

      console.log({
        ...restFile,
        byteLength: await byteLength.catch((err) => (console.log(err), NaN)),
      });
    }

    res.end('Success');
  }
)
.listen(3000);

console.log("Started");