import { expect, describe, it } from 'vitest';

import { createParseFormData, payloadFormat, TestFormDataPayload } from "./util";

describe('Fields', () => {
  it('single field', () => simpleFieldTest({ field__field: ['value'] }));

  it('multiple fields', () => simpleFieldTest({
    field__field: ['value'],
    field1__field: ['value1'],
    field2__field: ['value2'],
    field3__field: [''],
  }));
});

async function simpleFieldTest<
  F extends `${string}__field`
>(payload: TestFormDataPayload<F>) {
  const { fields } = await createParseFormData(payload);

  expect(fields).toEqual(payloadFormat(payload));
}