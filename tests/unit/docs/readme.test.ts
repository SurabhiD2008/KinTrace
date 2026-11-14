import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listGuidelines } from '../../../src/guidelines';

// The README's guideline table is generated from the guideline registry: this test builds
// the table from the profiles and fails, printing the expected table, when the README
// block differs. Changing a source link or a review date therefore changes the README.

const START = '<!-- guidelines:start -->';
const END = '<!-- guidelines:end -->';

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** The markdown table for every guideline in the registry, in registry order. */
function guidelineTable(): string {
  const rows = listGuidelines().map((guideline) =>
    `| ${cell(guideline.name)} | ${cell(guideline.publisher)} | ${cell(guideline.countryOrScope)} | [${cell(guideline.sourceTitle)}](${guideline.sourceUrl}) | ${guideline.lastReviewed} |`,
  );
  return ['| Guideline | Publisher | Scope | Source | Rules last checked against the source |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');
}

describe('README guideline table', () => {
  it('matches the registry exactly', () => {
    const readme = readFileSync('README.md', 'utf8');
    const start = readme.indexOf(START);
    const end = readme.indexOf(END);
    expect(start, 'README has the guidelines:start marker').toBeGreaterThan(-1);
    expect(end, 'README has the guidelines:end marker').toBeGreaterThan(start);
    const block = readme.slice(start + START.length, end).trim();
    expect(block, `Replace the README block with:\n${guidelineTable()}`).toBe(guidelineTable());
  });

  it('lists every guideline once, each with an https source and an ISO review date', () => {
    const table = guidelineTable().split('\n').slice(2);
    expect(table).toHaveLength(listGuidelines().length);
    for (const guideline of listGuidelines()) {
      expect(guideline.sourceUrl).toMatch(/^https:\/\//);
      expect(guideline.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
