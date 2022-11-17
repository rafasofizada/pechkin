import FormData from 'form-data';
import { Readable } from 'stream';
import { IncomingMessage } from 'http';

import { parseFormData } from '../src';
import { Fields, FileFieldLimits, Limits, PechkinConfig, PechkinFile } from '../src/types';

export type TestFile = PechkinFile & { content: string | null };
export type TestFormDataFields<S extends string = string> = `${S}__file` | `${S}__field`;
export type TestFormDataPayload<F extends TestFormDataFields> = Record<F, string[]>;
export type TestFormDataParseResult = { fields: Fields, results: TestFile[] };

export async function createParseFormData<F extends TestFormDataFields>(
  payload: TestFormDataPayload<F>,
  {
    base,
    fileOverride = {},
  }: {
    base: Partial<Limits>;
    fileOverride?: Partial<Record<F, Partial<FileFieldLimits>>>;
  } = {
    base: {
      maxTotalFileFieldCount: Infinity,
      maxFileCountPerField: Infinity
    },
    fileOverride: {},
  }
): Promise<TestFormDataParseResult> {
  // Defaults
  const config = {
    base: {
      maxFileCountPerField: Infinity,
      maxTotalFileFieldCount: Infinity,
      ...base,
    },
    fileOverride: payloadFormat(fileOverride),
  } as PechkinConfig;

  const form = new FormData();

  for (const [field, files] of Object.entries(payload) as [string, string[]][]) {
    const [fieldname, type] = field.split('__') as ['file' | 'field', string];

    for (const [i, file] of files.entries()) {
      if (type === 'file') {
        form.append(fieldname, Readable.from(file), { filename: `${fieldname}-${i}.dat` });
      } else if (type === 'field') {
        form.append(fieldname, file);
      } else {
        throw new Error(`Incorrect field type in payload: ${field}`);
      }
    }
  }

  const request = {
    headers: form.getHeaders(),
    __proto__: form,
  } as unknown as IncomingMessage;

  const { fields, files } = await parseFormData(request, config);
  
  const results = [] as TestFile[];

  for await (const file of files) {
    const result = {
      ...file,
      content: file.stream ? await streamToString(file.stream) : null,
    };

    results.push(result);
  }

  return { fields, results };
}

export function payloadFormat<O extends Record<string, any>>(object: O): { [K in keyof O extends TestFormDataFields<infer F> ? F : never]: O[K] } {
  return Object.fromEntries(
    Object.entries(object).map(([field, value]) => {
      const [fieldname, type] = field.split('__') as ['file' | 'field', string];

      if (type === 'field') {
        return [fieldname, value[0]];
      } else if (type === 'file') {
        return [fieldname, value];
      } else {
        throw new Error(`Incorrect field type in payload: ${field}`);
      }
    })
  ) as any;
}

// TODO: What's the default string encoding?
async function streamToString(stream: Readable): Promise<string> {
  const buffer = await streamToBuffer(stream);
  return buffer.toString();
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks = [] as Buffer[];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}