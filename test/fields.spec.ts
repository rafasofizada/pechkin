import { expect, describe, it } from 'vitest';

import { FieldLimitError, TotalLimitError } from "../src/error";
import { Limits } from "../src/types";
import { createParseFormData, payloadFormat, TestFormDataPayload } from "./util";

describe('Fields', () => {
  it('single field', () => simpleFieldTest({ field__field: ['value'] }));

  it('multiple fields', () => simpleFieldTest({
    field__field: ['value'],
    field1__field: ['value1'],
    field2__field: ['value2'],
    field3__field: [''],
  }));

  describe('limits', () => {
    // TODO: maxFieldKeyByteLength

    describe('maxTotalFieldCount', () => {
      it('count < limit', () => limitTest(
        { field__field: ['value'], field1__field: ['value'] },
        { maxTotalFieldCount: 3 },
        'resolve'
      ));
      
      it('count = limit', () => limitTest(
        { field__field: ['value'], field1__field: ['value'] },
        { maxTotalFieldCount: 2 },
        'resolve'
      ));

      it('count > limit', () => limitTest(
        { field__field: ['value'], field1__field: ['value'] },
        { maxTotalFieldCount: 1 },
        'reject',
        TotalLimitError
      ));
    });

    describe('maxFieldValueByteLength', () => {
      describe('single field', () => {
        it('valueByteLength < limit', () => limitTest(
          { field__field: ['value'] },
          // 'value' is 5 bytes, limit is 6 bytes
          { maxFieldValueByteLength: 5 + 1 },
          'resolve'
        ));
        
        it('valueByteLength < limit', () => limitTest(
          { field__field: ['value'] },
          { maxFieldValueByteLength: 5 },
          'reject',
          FieldLimitError
        ));
  
        it('valueByteLength < limit', () => limitTest(
          { field__field: ['value'] },
          { maxFieldValueByteLength: 4 },
          'reject',
          FieldLimitError
        ));
      });

      describe('multiple fields', () => {
        it('valueByteLength < limit', () => limitTest(
          { field__field: ['a'], field1__field: ['value'] },
          // 'value' is 5 bytes, limit is 6 bytes
          { maxFieldValueByteLength: 5 + 1 },
          'resolve'
        ));
        
        it('valueByteLength < limit', () => limitTest(
          { field__field: ['a'], field1__field: ['value'] },
          // 'value' is 5 bytes, limit is 5 bytes
          { maxFieldValueByteLength: 5 },
          'reject',
          FieldLimitError
        ));
  
        it('valueByteLength < limit', () => limitTest(
          { field__field: ['a'], field1__field: ['value'] },
          { maxFieldValueByteLength: 4 },
          'reject',
          FieldLimitError
        ));
      });
    });
  });
});

async function limitTest<F extends `${string}__field`>(
  payload: TestFormDataPayload<F>,
  limit: Partial<Limits>,
  expectation: 'resolve',
): Promise<void>;
async function limitTest<F extends `${string}__field`>(
  payload: TestFormDataPayload<F>,
  limit: Partial<Limits>,
  expectation: 'reject',
  errorClass: any,
): Promise<void>;
async function limitTest<F extends `${string}__field`>(
  payload: TestFormDataPayload<F>,
  limit: Partial<Limits>,
  expectation: 'resolve' | 'reject',
  errorClass?: any,
): Promise<void> {
  if (expectation === 'resolve') {
    const { fields } = await createParseFormData(payload, { base: limit });
    expect(fields).toEqual(payloadFormat(payload));
  } else {
    await expect(createParseFormData(payload, { base: limit })).rejects.toThrow(errorClass);
  }
}

async function simpleFieldTest<
  F extends `${string}__field`
>(payload: TestFormDataPayload<F>) {
  const { fields } = await createParseFormData(payload);

  expect(fields).toEqual(payloadFormat(payload));
}