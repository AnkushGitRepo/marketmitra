import { describe, expect, it } from 'vitest';
import { parseSchemeCode } from './types';

describe('parseSchemeCode', () => {
  it('accepts positive int32 codes', () => {
    expect(parseSchemeCode('122639')).toBe(122639);
    expect(parseSchemeCode('2147483647')).toBe(2147483647);
  });

  it.each(['0', '-1', '1.5', 'abc', '', '2147483648', '99999999999', '12 3', '١٢٣'])('rejects %j', (raw) => {
    expect(parseSchemeCode(raw)).toBeNull();
  });
});
