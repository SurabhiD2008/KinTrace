import { createSamplePedigree, deserialize, pedigreeSchema, serialize, validatePedigree } from '../../src/domain';
import { evaluateAll } from '../../src/guidelines';
import { RELATION_KEYS } from '../../src/parser';
import { CONDITION_CODES } from '../../src/domain/types';
import blind from '../fixtures/parser-blind.json';
import cases from '../fixtures/parser-cases.json';
import holdout from '../fixtures/parser-holdout.json';

// The results check: every bundled sample and fixture satisfies its schema and invariants.

describe('the bundled sample family', () => {
  const sample = createSamplePedigree();

  it('satisfies the schema, has no validation error, and loads back unchanged', () => {
    expect(pedigreeSchema.safeParse(sample).success).toBe(true);
    expect(validatePedigree(sample, { referenceYear: 2026 }).filter((issue) => issue.severity === 'error')).toEqual([]);
    const loaded = deserialize(serialize(sample));
    expect(loaded.ok && loaded.pedigree).toEqual(sample);
  });

  it('gives the documented findings, each with its evidence people in the tree', () => {
    const results = evaluateAll(sample, { referenceYear: 2026 });
    expect(Object.fromEntries(results.map((r) => [r.guidelineId, r.status]))).toEqual({
      'nice-cg164': 'meets',
      'amsterdam-ii': 'none',
      'nice-cg71': 'discuss',
      'dlcn-family-history': 'none',
      'nice-ng238': 'discuss',
    });
    for (const result of results) for (const id of result.evidence) expect(sample.persons[id]).toBeDefined();
  });
});

describe('parser fixtures', () => {
  it.each([
    ['tuning', cases],
    ['held out', holdout],
    ['blind', blind],
  ])('%s cases are well formed: unique ids, text within the limit, known relations and codes', (_name, set) => {
    const ids = set.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of set) {
      expect(item.text.length).toBeGreaterThan(0);
      expect(item.text.length).toBeLessThanOrEqual(2000);
      for (const entry of item.expect.entries ?? []) {
        expect(RELATION_KEYS).toContain(entry.relation);
        for (const condition of entry.conditions ?? []) expect(CONDITION_CODES).toContain(condition.code);
      }
    }
  });
});
