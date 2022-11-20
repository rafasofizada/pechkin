import { expect, describe, it } from 'vitest';

import { TotalLimitError } from "../src/error";
import { createParseFormData } from "./util";

describe('Mixed', () => {
  describe('maxTotalPartCount', () => {
    it('fields, limit = 0', async () => {
      await expect(
        createParseFormData(
          {
            field1__field: ['value1'],
          },
          {
            base: {
              maxTotalPartCount: 0,
            },
          }
        )
      ).rejects.toMatchObject(new TotalLimitError('maxTotalPartCount'));
    });

    it('fields, limit = 3', async () => {
      await expect(
        createParseFormData(
          {
            field1__field: ['value1'],
            field2__field: ['value2', 'value3'],
          },
          {
            base: {
              maxTotalPartCount: 2,
            },
          }
        )
      ).rejects.toMatchObject(new TotalLimitError('maxTotalPartCount'));
    });

    it('files, limit = 0', async () => {
      await expect(
        createParseFormData(
          {
            field1__file: ['value1'],
          },
          {
            base: {
              maxTotalPartCount: 0,
            },
          }
        )
      ).rejects.toMatchObject(new TotalLimitError('maxTotalPartCount'));
    });
  });
});