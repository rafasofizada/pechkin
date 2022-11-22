import { describe, it } from 'vitest';

import { limitTest } from "./util";
import { TotalLimitError } from "../src/error";

describe('Limits', () => {
  describe('total limits', () => {
    describe('maxTotalPartCount', () => {
      describe('limit is inclusive', () => {
        describe('fields only', () => {
          describe('resolve', () => {
            it('count (1) < limit (2)', () => limitTest(
              { field__field: ['value'] },
              { maxTotalPartCount: 2 },
              'resolve'
            ));
    
            it('count = limit (2)', () => limitTest(
              {
                field1__field: ['value1'],
                field2__field: ['value2'],
              },
              { maxTotalPartCount: 2 },
              'resolve'
            ));
    
            it('count [repeated fields] = limit (2)', () => limitTest(
              // Note: don't use repeated fields with different values with limitTest()
              // FormData treats the _first_ value received for a field as the final value,
              // meanwhile limitTest takes the _last_ value as the final.
              { field1__field: ['value', 'value'] },
              { maxTotalPartCount: 2 },
              'resolve'
            ));
          });
    
          describe('reject', () => {
            it('count (1) > limit (0)', () => limitTest(
              { field__field: ['value'] },
              { maxTotalPartCount: 0 },
              'reject',
              new TotalLimitError('maxTotalPartCount')
            ));
    
            it('count (3) = limit (2)', () => limitTest(
              {
                field1__field: ['value1'],
                field2__field: ['value2'],
                field3__field: ['value3'],
              },
              { maxTotalPartCount: 2 },
              'reject',
              new TotalLimitError('maxTotalPartCount')
            ));
    
            it('count (3) (repeated fields) = limit (2)', () => limitTest(
              { field1__field: ['value1', 'value2', 'value3'] },
              { maxTotalPartCount: 2 },
              'reject',
              new TotalLimitError('maxTotalPartCount')
            ));
          });
        });
  
        describe('files only', () => {
          describe('resolve', () => {
            it('count (1) < limit (2)', () => limitTest(
              { file__file: ['value'] },
              { maxTotalPartCount: 2 },
              'resolve'
            ));
    
            it('count = limit (2)', () => limitTest(
              {
                file1__file: ['value1'],
                file2__file: ['value2'],
              },
              { maxTotalPartCount: 2 },
              'resolve'
            ));
    
            it('count [repeated files] = limit (2)', () => limitTest(
              // Note: don't use repeated files with different values with limitTest()
              // FormData treats the _first_ value received for a file as the final value,
              // meanwhile limitTest takes the _last_ value as the final.
              { file1__file: ['value', 'value'] },
              { maxTotalPartCount: 2 },
              'resolve'
            ));
          });
    
          describe('reject', () => {
            it('count (1) > limit (0)', () => limitTest(
              { file__file: ['value'] },
              { maxTotalPartCount: 0 },
              'reject',
              new TotalLimitError('maxTotalPartCount')
            ));
    
            it('count (3) = limit (2)', () => limitTest(
              {
                file1__file: ['value1'],
                file2__file: ['value2'],
                file3__file: ['value3'],
              },
              { maxTotalPartCount: 2 },
              'reject',
              new TotalLimitError('maxTotalPartCount')
            ));
    
            it('count (3) (repeated files) = limit (2)', () => limitTest(
              { file1__file: ['value1', 'value2', 'value3'] },
              { maxTotalPartCount: 2 },
              'reject',
              new TotalLimitError('maxTotalPartCount')
            ));
          });
        });
  
        describe('fields & files mixed', () => {
          describe('resolve', () => {
            it('count (1, 1) < limit (3)', () => limitTest(
              {
                field__field: ['value'],
                file__file: ['value'],
              },
              { maxTotalPartCount: 3 },
              'resolve'
            ));
    
            it('count (1, 2) = limit (3)', () => limitTest(
              {
                field__field: ['value'],
                file__file: ['value'],
                file2__file: ['value2'],
              },
              { maxTotalPartCount: 3 },
              'resolve'
            ));
    
            it('count [repeated fields (2), files (2)] = limit (4)', () => limitTest(
              // Note: don't use repeated files with different values with limitTest()
              // FormData treats the _first_ value received for a file as the final value,
              // meanwhile limitTest takes the _last_ value as the final.
              { 
                field__field: ['value', 'value'],
                file__file: ['value', 'value']
              },
              { maxTotalPartCount: 4 },
              'resolve'
            ));
          });
    
          describe('reject', () => {
            it('count (1, 1) > limit (0)', () => limitTest(
              {
                field__field: ['value'],
                file__file: ['value'],
              },
              { maxTotalPartCount: 0 },
              'reject',
              new TotalLimitError('maxTotalPartCount')
            ));
    
            it('count (2, 2) > limit (3)', () => limitTest(
              {
                field__field: ['value'],
                field2__field: ['value'],
                file__file: ['value'],
                file2__file: ['value2'],
              },
              { maxTotalPartCount: 3 },
              'reject',
              new TotalLimitError('maxTotalPartCount')
            ));
    
            it('count (4) (repeated fields, files) > limit (3)', () => limitTest(
              { 
                field__field: ['value', 'value'],
                file__file: ['value', 'value']
              },
              { maxTotalPartCount: 3 },
              'reject',
              new TotalLimitError('maxTotalPartCount')
            ));
          });
        });
      });
    });
  
    describe('maxTotalFieldCount', () => {
      describe('limit is inclusive', () => {
        describe('resolve', () => {
          it('count (1) < limit (2)', () => limitTest(
            { field__field: ['value'] },
            { maxTotalFieldCount: 2 },
            'resolve'
          ));
  
          it('count = limit (2)', () => limitTest(
            {
              field1__field: ['value1'],
              field2__field: ['value2'],
            },
            { maxTotalFieldCount: 2 },
            'resolve'
          ));
  
          it('count [repeated fields] = limit (2)', () => limitTest(
            // Note: don't use repeated fields with different values with limitTest()
            // FormData treats the _first_ value received for a field as the final value,
            // meanwhile limitTest takes the _last_ value as the final.
            { field1__field: ['value', 'value'] },
            { maxTotalFieldCount: 2 },
            'resolve'
          ));
        });
  
        describe('reject', () => {
          it('count (1) > limit (0)', () => limitTest(
            { field__field: ['value'] },
            { maxTotalFieldCount: 0 },
            'reject',
            new TotalLimitError('maxTotalFieldCount')
          ));
  
          it('count (3) = limit (2)', () => limitTest(
            {
              field1__field: ['value1'],
              field2__field: ['value2'],
              field3__field: ['value3'],
            },
            { maxTotalFieldCount: 2 },
            'reject',
            new TotalLimitError('maxTotalFieldCount')
          ));
  
          it('count (3) (repeated fields) = limit (2)', () => limitTest(
            { field1__field: ['value1', 'value2', 'value3'] },
            { maxTotalFieldCount: 2 },
            'reject',
            new TotalLimitError('maxTotalFieldCount')
          ));
        });
      });
    });
  
    // TODO: maxFieldKeyByteLength
  
    // describe('maxFieldValueByteLength', () => {
    //   describe('single field', () => {
    //     it('valueByteLength < limit', () => limitTest(
    //       { field__field: ['value'] },
    //       // 'value' is 5 bytes, limit is 6 bytes
    //       { maxFieldValueByteLength: 5 + 1 },
    //       'resolve'
    //     ));
        
    //     it('valueByteLength < limit', () => limitTest(
    //       { field__field: ['value'] },
    //       { maxFieldValueByteLength: 5 },
    //       'reject',
    //       FieldLimitError
    //     ));
  
    //     it('valueByteLength < limit', () => limitTest(
    //       { field__field: ['value'] },
    //       { maxFieldValueByteLength: 4 },
    //       'reject',
    //       FieldLimitError
    //     ));
    //   });
  
    //   describe('multiple fields', () => {
    //     it('valueByteLength < limit', () => limitTest(
    //       { field__field: ['a'], field1__field: ['value'] },
    //       // 'value' is 5 bytes, limit is 6 bytes
    //       { maxFieldValueByteLength: 5 + 1 },
    //       'resolve'
    //     ));
        
    //     it('valueByteLength < limit', () => limitTest(
    //       { field__field: ['a'], field1__field: ['value'] },
    //       // 'value' is 5 bytes, limit is 5 bytes
    //       { maxFieldValueByteLength: 5 },
    //       'reject',
    //       FieldLimitError
    //     ));
  
    //     it('valueByteLength < limit', () => limitTest(
    //       { field__field: ['a'], field1__field: ['value'] },
    //       { maxFieldValueByteLength: 4 },
    //       'reject',
    //       FieldLimitError
    //     ));
    //   });
    // });
  
    describe('precedence', () => {
      describe('maxTotalPartCount vs maxTotalFieldCount', () => {
        it('maxTotalPartCount (0) preceeds maxTotalFieldCount (1) when smaller', () => limitTest(
          { field__field: ['value'] },
          { maxTotalPartCount: 0, maxTotalFieldCount: 1 },
          'reject',
          new TotalLimitError('maxTotalPartCount')
        ));
  
        it('maxTotalFieldCount preceeds maxTotalPartCount when equal (1)', () => limitTest(
          {
            field__field: ['value'],
            field1__field: ['value']
          },
          { maxTotalPartCount: 1, maxTotalFieldCount: 1 },
          'reject',
          new TotalLimitError('maxTotalFieldCount')
        ));
    
        it('maxTotalFieldCount preceeds maxTotalPartCount when equal (1) [repeated fields]', () => limitTest(
          { field__field: ['value', 'value'] },
          { maxTotalPartCount: 1, maxTotalFieldCount: 1 },
          'reject',
          new TotalLimitError('maxTotalFieldCount')
        ));
      });
  
      describe('maxTotalPartCount vs maxTotalFileCount', () => {
        it('maxTotalPartCount (0) preceeds maxTotalFileCount (1) when smaller', () => limitTest(
          { file__file: ['value'] },
          { maxTotalPartCount: 0, maxTotalFileCount: 1 },
          'reject',
          new TotalLimitError('maxTotalPartCount')
        ));
  
        it('maxTotalFileCount preceeds maxTotalPartCount when equal (1)', () => limitTest(
          {
            file__file: ['value'],
            file1__file: ['value']
          },
          { maxTotalPartCount: 1, maxTotalFileCount: 1 },
          'reject',
          new TotalLimitError('maxTotalFileCount')
        ));
  
        it('maxTotalFileCount preceeds maxTotalPartCount when equal (1) [repeated files]', () => limitTest(
          { file__file: ['value', 'value'] },
          { maxTotalPartCount: 1, maxTotalFileCount: 1 },
          'reject',
          new TotalLimitError('maxTotalFileCount')
        ));
      });
    });
  });
});