import { createWriteStream } from "fs";
import { createServer } from "http";
import { parseFormData } from ".";

createServer(
  async (req, res) => {
    try {
      const { fields, files } = await parseFormData(
        req,
        {
          base: {
            maxTotalHeaderPairs: 2000,
            // TODO (IMPORTANT): maxTotalPartCount seems to be non-inclusive, all other limits inclusive
            maxTotalPartCount: 5,
            maxTotalFieldCount: 2,
            maxTotalFileCount: 3,
            // TODO (IMPORTANT): maxFieldKeyByteLength not implemented in Busboy!
            maxFieldKeyByteLength: 10,
            maxFieldValueByteLength: 10,
            maxFileByteLength: 100 * 1024,
            maxFileCountPerField: 2,
          }
        }
      );

      console.log(fields);

      const count = {};

      for await (const { byteLength, stream, ...restFile } of files) {
        count[restFile.field] ??= 0;
        count[restFile.field] += 1;

        const dest = createWriteStream(`${restFile.field}-${count[restFile.field]}.${restFile.mimeType.split('/')[1]}`);
        stream.pipe(dest);

        try {
          console.log({
            ...restFile,
            byteLength: await byteLength
          });
        } catch (error) {
          console.error(error);
        }
      }
    } catch (error) {
      console.error(error);
    }

    res.end('');
  }
)
.listen(3000);

console.log("Started");