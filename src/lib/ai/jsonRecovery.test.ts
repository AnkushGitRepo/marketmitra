import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractJsonText, recoverObject } from './jsonRecovery';

const schema = z.object({ symbol: z.string(), action: z.enum(['hold', 'review']) });
const json = '{"symbol":"RELIANCE","action":"hold"}';

describe('extractJsonText', () => {
  it.each([
    ['a ```json fence', '```json\n' + json + '\n```'],
    ['a bare ``` fence', '```\n' + json + '\n```'],
    ['an upper-case ```JSON fence with spaces', '  ```JSON \n' + json + '\n```  '],
    ['prose before and after', 'Here is the result:\n' + json + '\nHope that helps!'],
    ['a fence with prose around it', 'Sure!\n```json\n' + json + '\n```\nDone.'],
    ['plain JSON', json],
  ])('finds the JSON in %s', (_name, text) => {
    expect(JSON.parse(extractJsonText(text) ?? 'null')).toEqual(JSON.parse(json));
  });

  it('handles an array reply', () => {
    expect(extractJsonText('```json\n[1,2]\n```')).toBe('[1,2]');
  });

  it('returns null when there is no JSON at all', () => {
    expect(extractJsonText('I cannot do that.')).toBeNull();
    expect(extractJsonText('')).toBeNull();
  });
});

describe('recoverObject', () => {
  it('returns the parsed, schema-checked object from a fenced reply', () => {
    expect(recoverObject('```json\n' + json + '\n```', schema)).toEqual({ symbol: 'RELIANCE', action: 'hold' });
  });

  it('rejects JSON that does not match the schema', () => {
    expect(recoverObject('```json\n{"symbol":"X","action":"buy"}\n```', schema)).toBeNull();
  });

  it('rejects text that is not valid JSON, and a truncated reply', () => {
    expect(recoverObject('```json\n{"symbol": "RELI\n```', schema)).toBeNull();
    expect(recoverObject('not json', schema)).toBeNull();
    expect(recoverObject(undefined, schema)).toBeNull();
  });

  it('is not fooled by braces inside a string value', () => {
    const s = z.object({ note: z.string() });
    expect(recoverObject('```json\n{"note":"a } b { c"}\n```', s)).toEqual({ note: 'a } b { c' });
  });
});
