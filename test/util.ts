import { Readable } from 'stream';
import { IncomingMessage } from 'http';
import { FormData, File } from 'formdata-node';
import { FormDataEncoder } from 'form-data-encoder';
import { expect } from 'vitest';

import { parseFormData, Pechkin } from '../src';
import { Internal } from '../src/types';
import { FileByteLengthInfo } from '../src/ByteLengthTruncateStream';

export type TestFile = Omit<Internal.File, 'byteLength' | 'stream'> & { content: string | null; byteLength: FileByteLengthInfo; };
export type TestFormDataFields<S extends string = string> = `${S}__file` | `${S}__field`;
export type TestFormDataPayload<F extends TestFormDataFields = TestFormDataFields> = Record<F, string[]>;
export type TestFormDataParseResult = { fields: Internal.Fields, files: TestFile[] };

// TODO: Return processed files even after abort
export async function createParseFormData<F extends TestFormDataFields>(
  payload: TestFormDataPayload<F>,
  config?: Pechkin.Config,
  fileFieldConfigOverride: Internal.FileFieldConfigOverride = {},
): Promise<TestFormDataParseResult> {
  const testDefaultConfig = {
    maxTotalFileFieldCount: Infinity,
    maxFileCountPerField: Infinity,
    ...config,
  };

  const form = new FormData();

  for (const [field, values] of Object.entries(payload) as [string, string[]][]) {
    const [fieldname, type] = field.split('__') as ['file' | 'field', string];

    if (!['field', 'file'].includes(type)) {
      throw new Error(`Invalid field type: ${type}`);
    }

    for (const [i, value] of values.entries()) {
      if (type === 'file') {
        form.append(fieldname, new File([value],  `${fieldname}-${i}.dat`));
      } else {
        form.append(fieldname, value);
      }
    }
  }

  const encoder = new FormDataEncoder(form);
  const stream = Readable.from(encoder.encode());
  const request: IncomingMessage = Object.create(stream, { headers: { value: encoder.headers } });

  const { fields, files } = await parseFormData(request, testDefaultConfig, payloadFormat(fileFieldConfigOverride));
  
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
  config: Pechkin.Config,
  expectation: 'resolve',
): Promise<void>;
export async function limitTest(
  payload: TestFormDataPayload,
  config: Pechkin.Config,
  expectation: 'reject',
  error: Error,
): Promise<void>;
export async function limitTest(
  payload: TestFormDataPayload,
  config: Pechkin.Config,
  expectation: 'resolve' | 'reject',
  error?: any,
): Promise<void> {
  if (expectation === 'resolve') {
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

    const { fields, files } = await createParseFormData(payload, config);

    expect(Object.keys(fields)).toEqual(payloadFields.map(({ fieldname }) => fieldname));

    expect(files).toEqual(
      payloadFiles
        .map(({ fieldname, count }) => Array(count).fill(expect.objectContaining({ field: fieldname })))
        .flat()
    );
  } else {
    await expect(createParseFormData(payload, config)).rejects.toMatchObject(error);
  }
}

export async function filesTest(payload: Record<`${string}__file`, string[]>, config?: Pechkin.Config) {
  const { files } = await createParseFormData(payload, config);

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
        content: payload[originalField][fileIndex]
      })
    );
  }
}