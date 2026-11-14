import type { ParseResult, ProposedEntry } from '../../src/parser';
import casesJson from './parser-cases.json';

/** What a case expects. Only the fields written down are compared. */
export interface ExpectedEntry {
  relation: string;
  side?: string | null;
  sex?: string;
  deceased?: boolean;
  ageAtDeath?: number;
  ambiguity?: { kind: string; options: string[] };
  conditions: Record<string, unknown>[];
}

export interface ParserCase {
  id: string;
  text: string;
  expect: { entries: ExpectedEntry[]; unparsed?: string[] };
}

export const PARSER_CASES = casesJson as ParserCase[];

/** Every difference between a parse and a case's expectation, as readable lines. Empty means it passed. */
export function differences(result: ParseResult, expected: ParserCase['expect']): string[] {
  const problems: string[] = [];
  if (result.entries.length !== expected.entries.length) {
    problems.push(`expected ${expected.entries.length} entries, got ${result.entries.length}`);
  }
  expected.entries.forEach((want, index) => {
    const got: ProposedEntry | undefined = result.entries[index];
    if (!got) return;
    const field = (name: string, a: unknown, b: unknown) => {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        problems.push(`entry ${index + 1} ${name}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
      }
    };
    field('relation', got.relation, want.relation);
    if (want.side !== undefined) field('side', got.side ?? null, want.side);
    if (want.sex !== undefined) field('sex', got.sex, want.sex);
    if (want.deceased !== undefined) field('deceased', got.deceased ?? false, want.deceased);
    if (want.ageAtDeath !== undefined) field('ageAtDeath', got.ageAtDeath, want.ageAtDeath);
    if (want.ambiguity !== undefined) field('ambiguity', got.ambiguity, want.ambiguity);
    field('condition count', got.conditions.length, want.conditions.length);
    want.conditions.forEach((condition, c) => {
      const actual = got.conditions[c] as Record<string, unknown> | undefined;
      for (const [key, value] of Object.entries(condition)) {
        field(`condition ${c + 1} ${key}`, actual?.[key] ?? (key === 'ageUnknown' ? false : undefined), value);
      }
      if (condition.ageUnknown === undefined) field(`condition ${c + 1} ageUnknown`, actual?.ageUnknown, false);
    });
    // Every span points inside the text the user typed.
    if (got.sourceSpan.end < got.sourceSpan.start) problems.push(`entry ${index + 1} has a backwards span`);
  });
  if (expected.unparsed !== undefined) {
    const reasons = result.unparsed.map((u) => u.reason);
    if (JSON.stringify(reasons) !== JSON.stringify(expected.unparsed)) {
      problems.push(`unparsed: expected ${JSON.stringify(expected.unparsed)}, got ${JSON.stringify(reasons)}`);
    }
  }
  return problems;
}
