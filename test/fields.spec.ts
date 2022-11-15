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
      it('count < limit', () => limitTest(
        { field: 'value', field1: 'value' },
        { maxTotalFieldCount: 3 },
        'resolve'
      ));
      
      it('count < limit', () => limitTest(
        { field: 'value', field1: 'value' },
        { maxTotalFieldCount: 2 },
        'resolve'
      ));

      it('count < limit', () => limitTest(
        { field: 'value', field1: 'value' },
        { maxTotalFieldCount: 1 },
        'reject',
        TotalLimitError
      ));
    });

    describe('maxFieldValueByteLength', () => {
      describe('single field', () => {
        it('valueByteLength < limit', () => limitTest(
          { field: 'value' },
          // 'value' is 5 bytes, limit is 6 bytes
          { maxFieldValueByteLength: 5 + 1 },
          'resolve'
        ));
        
        it('valueByteLength < limit', () => limitTest(
          { field: 'value' },
          { maxFieldValueByteLength: 5 },
          'reject',
          FieldLimitError
        ));
  
        it('valueByteLength < limit', () => limitTest(
          { field: 'value' },
          { maxFieldValueByteLength: 4 },
          'reject',
          FieldLimitError
        ));
      });

      describe('multiple fields', () => {
        it('valueByteLength < limit', () => limitTest(
          { field: 'a', field1: 'value' },
          // 'value' is 5 bytes, limit is 6 bytes
          { maxFieldValueByteLength: 5 + 1 },
          'resolve'
        ));
        
        it('valueByteLength < limit', () => limitTest(
          { field: 'a', field1: 'value' },
          // 'value' is 5 bytes, limit is 5 bytes
          { maxFieldValueByteLength: 5 },
          'reject',
          FieldLimitError
        ));
  
        it('valueByteLength < limit', () => limitTest(
          { field: 'a', field1: 'value' },
          { maxFieldValueByteLength: 4 },
          'reject',
          FieldLimitError
        ));
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