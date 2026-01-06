import { describe, it, expect } from 'vitest';
import { formatDataForExport } from '@/utils/exportUtils';

describe('exportUtils', () => {
  describe('formatDataForExport', () => {
    it('should flatten nested objects', () => {
      const data = [
        {
          id: 1,
          name: 'Test',
          nested: {
            value: 'nested-value',
          },
        },
      ];

      const result = formatDataForExport(data);
      
      expect(result[0]).toHaveProperty('id', 1);
      expect(result[0]).toHaveProperty('name', 'Test');
      expect(result[0]).toHaveProperty('nested_value', 'nested-value');
    });

    it('should convert arrays to comma-separated strings', () => {
      const data = [
        {
          id: 1,
          tags: ['tag1', 'tag2', 'tag3'],
        },
      ];

      const result = formatDataForExport(data);
      
      expect(result[0].tags).toBe('tag1, tag2, tag3');
    });

    it('should handle null and undefined values', () => {
      const data = [
        {
          id: 1,
          value: null,
          other: undefined,
        },
      ];

      const result = formatDataForExport(data);
      
      expect(result[0].value).toBe('');
      expect(result[0].other).toBe('');
    });
  });
});

