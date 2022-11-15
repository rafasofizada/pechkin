import { IncomingMessage } from "http";
import FormData from "form-data";

import { parseFormData } from "../src";
import { FieldLimitError, TotalLimitError } from "../src/error";
import { Limits } from "../src/types";

/**
 * Tests:
 * 
 * - Fields
 * - - Basic functionality
 * - - - Single field
 * - - - Multiple fields
 * - - Limits
 * - - - maxTotalFieldCount: >, ==, <
 * - - - maxFieldValueByteLength: >, ==, <
 * - - - TODO: maxFieldKeyByteLength: >, ==, <
 */

describe('Fields', () => {
  it('single field', () => simpleFieldTest({ field: 'value' }));

  it('multiple fields', () => simpleFieldTest({
    field: 'value',
    field1: 'value1',
    field2: 'value2',
    field3: '',
  }));

  describe('field limits', () => {
    // TODO: maxFieldKeyByteLength

    describe('maxTotalFieldCount', () => {
      it('count < limit', async () => {
        const payload = {
          field: 'value',
          field1: 'value',
        };
        const maxTotalFieldCount = Object.keys(payload).length + 1;
        await limitTest(payload, { maxTotalFieldCount }, 'resolve');
      });
      
      it('count == limit', async () => {
        const payload = {
          field: 'value',
          field1: 'value',
        };
        const maxTotalFieldCount = Object.keys(payload).length;
        await limitTest(payload, { maxTotalFieldCount }, 'resolve');
      });

      it('count > limit', async () => {
        const payload = {
          field: 'value',
          field1: 'value',
        };
        const maxTotalFieldCount = Object.keys(payload).length - 1;
        await limitTest(payload, { maxTotalFieldCount }, 'reject', TotalLimitError);
      });
    });

    describe('maxFieldValueByteLength', () => {
      describe('single field', () => {
        it('valueByteLength < limit', async () => {
          const value = 'value';
          const maxFieldValueByteLength = Buffer.from(value).byteLength + 1;

          const payload = {
            field: value,
          };
    
          await limitTest(payload, { maxFieldValueByteLength }, 'resolve');
        });
        
        it('valueByteLength == limit', async () => {
          const value = 'value';
          const maxFieldValueByteLength = Buffer.from(value).byteLength;

          const payload = {
            field: value,
          };
    
          await limitTest(payload, { maxFieldValueByteLength }, 'reject', FieldLimitError);
        });
  
        it('valueByteLength > limit', async () => {
          const value = 'value';
          const maxFieldValueByteLength = Buffer.from(value).byteLength - 1;

          const payload = {
            field: value,
          };

          await limitTest(payload, { maxFieldValueByteLength }, 'reject', FieldLimitError);
        });
      });

      describe('multiple fields', () => {
        it('valueByteLength < limit', async () => {
          const value = 'value';
          const maxFieldValueByteLength = Buffer.from(value).byteLength + 1;

          const payload = {
            field: value,
            field1: value,
          };

          await limitTest(payload, { maxFieldValueByteLength }, 'resolve');
        });
        
        it('valueByteLength == limit', async () => {
          const valueUnderLimit = 'a';
          const valueOverLimit = 'value';

          const maxFieldValueByteLength = Buffer.from(valueOverLimit).byteLength;

          const payload = {
            field: valueUnderLimit,
            field1: valueOverLimit,
          };

          await limitTest(payload, { maxFieldValueByteLength }, 'reject', FieldLimitError);
        });
  
        it('valueByteLength > limit', async () => {
          const valueUnderLimit = 'a';
          const valueOverLimit = 'value';

          const maxFieldValueByteLength = Buffer.from(valueOverLimit).byteLength - 1;

          const payload = {
            field: valueUnderLimit,
            field1: valueOverLimit,
          };

          await limitTest(payload, { maxFieldValueByteLength }, 'reject', FieldLimitError);
        });
      });
    });
  });
});

async function limitTest(
  payload: Record<string, string>,
  limit: Partial<Limits>,
  expectation: 'resolve',
): Promise<void>;
async function limitTest(
  payload: Record<string, string>,
  limit: Partial<Limits>,
  expectation: 'reject',
  errorClass: any,
): Promise<void>;
async function limitTest(
  payload: Record<string, string>,
  limit: Partial<Limits>,
  expectation: 'resolve' | 'reject',
  errorClass?: any,
): Promise<void> {
  const request = formRequest(payload);

  if (expectation === 'resolve') {
    const { fields } = await parseFormData(request, { base: limit });
    expect(fields).toEqual(payload);
  } else {
    expect(parseFormData(request, { base: limit })).rejects.toThrow(errorClass);
  }
}

async function simpleFieldTest(payload: Record<string, any>) {
  const request = formRequest(payload);
  const { fields } = await parseFormData(request);

  expect(fields).toEqual(payload);
}

function formRequest(payload: Record<string, string>) {
  const form = new FormData();

  for (const [key, value] of Object.entries(payload)) {
    form.append(key, value);
  }

  const request = {
    headers: form.getHeaders(),
    __proto__: form,
  } as unknown as IncomingMessage;

  return request;
}