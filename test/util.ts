import FormData from 'form-data';
import { Readable } from 'stream';
import { IncomingMessage } from 'http';
import { expect } from 'vitest';

import { parseFormData } from '../src';
import { Fields, FileFieldLimits, Limits, PechkinConfig, PechkinFile } from '../src/types';
import { FileByteLengthInfo } from '../src/length';

export type TestFile = Omit<PechkinFile, 'byteLength' | 'stream'> & { content: string | null; byteLength: FileByteLengthInfo; };
export type TestFormDataFields<S extends string = string> = `${S}__file` | `${S}__field`;
export type TestFormDataPayload<F extends TestFormDataFields = TestFormDataFields> = Record<F, string[]>;
export type TestFormDataParseResult = { fields: Fields, files: TestFile[] };

// TODO: Turn to async generator
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
      maxTotalFileFieldCount: Infinity,
      maxFileCountPerField: Infinity,
      ...base,
    },
    fileOverride: payloadFormat(fileOverride),
  } as PechkinConfig;

  const form = new FormData();

  for (const [field, values] of Object.entries(payload) as [string, string[]][]) {
    const [fieldname, type] = field.split('__') as ['file' | 'field', string];

    if (!['field', 'file'].includes(type)) {
      throw new Error(`Invalid field type: ${type}`);
    }

    for (const [i, value] of values.entries()) {
      if (type === 'file') {
        form.append(fieldname, Readable.from(value), { filename: `${fieldname}-${i}.dat` });
      } else {
        form.append(fieldname, value);
      }
    }
  }

  const request: IncomingMessage = Object.create(form, { headers: { value: form.getHeaders() } });
  const { fields, files } = await parseFormData(request, config);
  
  const results = [] as TestFile[];

  for await (const { stream, byteLength, ...restFile } of files) {
    const result = {
      ...restFile,
      content: stream
        ? await streamToString(stream)
        : null,
      byteLength: await byteLength,
    };

    results.push(result);
  }

  return { fields, files: results };
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

export async function limitTest(
  payload: TestFormDataPayload,
  limits: Partial<Limits>,
  expectation: 'resolve',
): Promise<void>;
export async function limitTest(
  payload: TestFormDataPayload,
  limits: Partial<Limits>,
  expectation: 'reject',
  error: Error,
): Promise<void>;
export async function limitTest(
  payload: TestFormDataPayload,
  limits: Partial<Limits>,
  expectation: 'resolve' | 'reject',
  error?: any,
): Promise<void> {
  if (expectation === 'resolve') {
    // Reduce the payload to two arrays, one for fields and one for files
    // Each array element should be an object, containing:
    // - the field name (without the part after __ (including __))
    // - the count of values for that field

    const [payloadFields, payloadFiles] = Object.entries(payload).reduce((acc, [field, values]) => {
      const [fieldname, type] = field.split('__') as ['file' | 'field', string];

      if (type === 'field') {
        acc[0].push({ fieldname, count: values.length });
      } else if (type === 'file') {
        acc[1].push({ fieldname, count: values.length });
      } else {
        throw new Error(`Incorrect field type in payload: ${field}`);
      }

      return acc;
    }, [[], []] as [Array<{ fieldname: string, count: number }>, Array<{ fieldname: string, count: number }>]);

    const { fields, files } = await createParseFormData(payload, { base: limits });

    expect(Object.keys(fields)).toEqual(payloadFields.map(({ fieldname }) => fieldname));

    expect(files).toEqual(
      payloadFiles
        .map(({ fieldname, count }) => Array(count).fill(expect.objectContaining({ field: fieldname })))
        .flat()
    );
  } else {
    await expect(createParseFormData(payload, { base: limits })).rejects.toMatchObject(error);
  }
}

export async function filesTest(payload: Record<`${string}__file`, string[]>, limit: Partial<Limits> = {}) {
  const { files } = await createParseFormData(payload, { base: limit });

  const fieldFileCounter = {};

  for (const [resultIndex, file] of files.entries()) {
    const fieldname = file.field;
    const originalField = `${fieldname}__file`;

    fieldFileCounter[fieldname] ??= 0;
    const fileIndex = fieldFileCounter[fieldname]++;

    expect(file).toEqual(
      expect.objectContaining({
        field: fieldname,
        filename: `${fieldname}-${fileIndex}.dat`,
        mimeType: 'application/octet-stream',
        skipped: false,
        content: payload[originalField][fileIndex]
      })
    );
  }
}