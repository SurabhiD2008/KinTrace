import { parseOffline, parseResultSchema } from '../../../src/parser';
import { PARSER_CASES, differences } from '../../fixtures/parserMatch';

describe('offline parser: fixture cases', () => {
  it('has at least 40 cases', () => {
    expect(PARSER_CASES.length).toBeGreaterThanOrEqual(40);
  });

  it.each(PARSER_CASES.map((c) => [c.id, c] as const))('%s', (_id, testCase) => {
    const result = parseOffline(testCase.text);
    expect(parseResultSchema.safeParse(result).success).toBe(true);
    expect(differences(result, testCase.expect)).toEqual([]);
    for (const entry of result.entries) {
      expect(entry.sourceSpan.end).toBeLessThanOrEqual(testCase.text.length);
    }
  });
});
