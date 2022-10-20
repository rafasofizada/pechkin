import { createServer } from "http";
import { parseFormData } from ".";
import { DefaultField } from "./types";

createServer(
  async (req, res) => {
    try {
      const { fields, files } = await parseFormData(
        req,
        {
          "file1": {
            maxFileByteLength: 0.05 * 1024 * 1024,
            maxFileCount: 3
          },
          "file2": {
            maxFileByteLength: 2 * 1024 * 1024,
            maxFileCount: 0
          },
          [DefaultField]: {
            maxFileByteLength: 0.01 * 1024 * 1024,
            maxFileCount: 1
          }
        },
        undefined,
        { limits: { fields: 2, files: 4 } }
      );

      console.log(fields);

      for await (const { byteLength, stream, ...restFile } of files) {
        stream.resume();

        console.log({
          ...restFile,
          byteLength: await byteLength
        });
      }
    } catch (error) {
      console.error(error);
    }

    res.end('');
  }
)
.listen(3000);

console.log("Started");