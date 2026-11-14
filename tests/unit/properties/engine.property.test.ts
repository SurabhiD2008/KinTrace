// 500 generated families per property take longer than the 5-second default.
vi.setConfig({ testTimeout: 120_000 });
import fc from 'fast-check';
import {
  addChild,
  addParent,
  addPartner,
  addPerson,
  addSibling,
  CONDITION_CODES,
  CONFIRMATIONS,
  removeCondition,
  removePerson,
  setCondition,
} from '../../../src/domain';
import type { Pedigree, PersonId, Sex } from '../../../src/domain';
import { compareGuidelines, evaluateAll, listGuidelines } from '../../../src/guidelines';
import type { FindingStatus, GuidelineResult } from '../../../src/guidelines';
import { deepFreeze } from '../../fixtures/pedigrees';
import { BOUNDARY_AGES, fcOptions, pedigreeArb, shuffled } from '../generators';

// Properties of the guideline engine over generated pedigrees.

const REFERENCE = { referenceYear: 2026 };
const STRENGTH: Record<FindingStatus, number> = { none: 0, discuss: 1, meets: 2 };
/** Hard rule 1: never a risk figure, probability, likelihood or diagnosis. */
const FORBIDDEN = /\brisk\b|chance|likel|probab|diagnos|\d\s*%/i;

const statuses = (results: GuidelineResult[]) => results.map((r) => [r.guidelineId, r.status]);
const ruleStatuses = (results: GuidelineResult[]) =>
  results.flatMap((r) => r.findings.map((f) => `${f.ruleId}:${f.status}`));

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (typeof value === 'object' && value !== null) Object.values(value).forEach((item) => strings(item, out));
  return out;
}

function must(result: ReturnType<typeof addPerson>): { ped: Pedigree; id: PersonId } {
  if (!result.ok) throw new Error(result.error.message);
  return { ped: result.pedigree, id: result.createdId ?? '' };
}

describe('evaluateAll', () => {
  it('never throws, is deterministic, leaves its input untouched and never words a risk', () => {
    fc.assert(
      fc.property(pedigreeArb, (ped) => {
        const frozen = deepFreeze(structuredClone(ped));
        const first = evaluateAll(frozen, REFERENCE);
        const second = evaluateAll(frozen, REFERENCE);
        expect(second).toEqual(first);
        expect(frozen).toEqual(ped);
        const exclusions = listGuidelines().flatMap((g) => g.rules.flatMap((rule) => rule.explainExclusions(frozen)));
        // A guideline's published source title is a citation, not a finding, so the
        // profile objects inside comparison rows are left out of the wording check.
        const compared = (['cancer', 'cardio'] as const).map((domain) => {
          const comparison = compareGuidelines(frozen, domain, REFERENCE);
          return { ...comparison, rows: comparison.rows.map((row) => ({ ...row, guideline: null })) };
        });
        for (const text of strings([first, exclusions, compared])) expect(text).not.toMatch(FORBIDDEN);
      }),
      fcOptions,
    );
  });

  it('every evidence person exists, and nobody is both counted and excluded by the same rule', () => {
    fc.assert(
      fc.property(pedigreeArb, (ped) => {
        for (const guideline of listGuidelines()) {
          for (const finding of guideline.evaluate(ped, REFERENCE)) {
            for (const id of finding.evidence) expect(Object.hasOwn(ped.persons, id)).toBe(true);
            if (finding.status === 'none') expect(finding.evidence).toEqual([]);
            const rule = guideline.rules.find((r) => r.id === finding.ruleId);
            const excluded = new Set(rule?.explainExclusions(ped).map((e) => e.personId));
            for (const id of finding.evidence) expect(excluded.has(id)).toBe(false);
          }
        }
      }),
      { ...fcOptions, numRuns: 300 },
    );
  });
});

describe('invariance', () => {
  const keysArb = fc.array(fc.nat(), { minLength: 1, maxLength: 64 });

  it('shuffling the insertion order of persons, links and conditions changes no status', () => {
    fc.assert(
      fc.property(pedigreeArb, keysArb, (ped, keys) => {
        const persons = Object.fromEntries(
          shuffled(Object.entries(ped.persons), keys).map(([id, person]) => [
            id,
            { ...person, conditions: shuffled(person.conditions, keys) },
          ]),
        );
        const reordered: Pedigree = {
          ...ped,
          persons,
          parentLinks: shuffled(ped.parentLinks, keys),
          partnerships: shuffled(ped.partnerships, keys),
        };
        const before = evaluateAll(ped, REFERENCE);
        const after = evaluateAll(reordered, REFERENCE);
        expect(ruleStatuses(after)).toEqual(ruleStatuses(before));
        expect(after.map((r) => [...r.evidence].sort())).toEqual(before.map((r) => [...r.evidence].sort()));
      }),
      fcOptions,
    );
  });

  it('renaming every id consistently changes nothing except the ids', () => {
    fc.assert(
      fc.property(pedigreeArb, keysArb, (ped, keys) => {
        const ids = Object.keys(ped.persons);
        // New ids in a shuffled order, so sorting by id no longer matches the old order.
        const fresh = shuffled(ids.map((_, i) => `r${String(i).padStart(3, '0')}`), keys);
        const map = new Map(ids.map((id, i) => [id, fresh[i] as string]));
        const to = (id: string) => map.get(id) ?? id;
        const renamed: Pedigree = {
          ...ped,
          probandId: to(ped.probandId),
          persons: Object.fromEntries(Object.values(ped.persons).map((p) => [to(p.id), { ...p, id: to(p.id) }])),
          parentLinks: ped.parentLinks.map((l) => ({ ...l, childId: to(l.childId), parentId: to(l.parentId) })),
          partnerships: ped.partnerships.map((u) => ({ ...u, aId: to(u.aId), bId: to(u.bId) })),
        };
        const before = evaluateAll(ped, REFERENCE);
        const after = evaluateAll(renamed, REFERENCE);
        const normalise = (results: GuidelineResult[], rename: (id: string) => string) =>
          results.map((r) => ({
            ...r,
            evidence: r.evidence.map(rename).sort(),
            findings: r.findings.map((f) => ({
              ...f,
              evidence: f.evidence.map(rename).sort(),
              selfReportedEvidence: f.selfReportedEvidence.map(rename).sort(),
              unknowns: f.unknowns.map((g) => ({ ...g, personId: rename(g.personId) })).sort((a, b) => (a.personId + a.field).localeCompare(b.personId + b.field)),
              steps: f.steps.map((s) => ({ ...s, evidence: s.evidence.map(rename).sort(), text: s.text.split('; ').sort().join('; ') })),
            })),
          }));
        expect(normalise(after, (id) => id)).toEqual(normalise(before, to));
      }),
      fcOptions,
    );
  });
});

describe('monotonicity', () => {
  const relativeArb = fc.record({
    how: fc.constantFrom('child', 'sibling', 'parent'),
    sex: fc.constantFrom<Sex>('female', 'male', 'unknown'),
    code: fc.constantFrom(...CONDITION_CODES),
    age: fc.option(fc.constantFrom(...BOUNDARY_AGES), { nil: undefined }),
    confirmed: fc.constantFrom(...CONFIRMATIONS),
  });

  it('adding a relative with a condition never lowers any status', () => {
    fc.assert(
      fc.property(pedigreeArb, relativeArb, (ped, rel) => {
        const added =
          rel.how === 'child'
            ? addChild(ped, ped.probandId, { sex: rel.sex })
            : rel.how === 'sibling'
              ? addSibling(ped, ped.probandId, { sex: rel.sex }, { type: 'full' })
              : addParent(ped, ped.probandId, { sex: rel.sex });
        if (!added.ok) return;
        const withCondition = setCondition(added.pedigree, added.createdId ?? '', {
          code: rel.code,
          confirmed: rel.confirmed,
          ...(rel.age === undefined ? {} : { ageAtOnset: rel.age }),
        });
        if (!withCondition.ok) return;
        const before = evaluateAll(ped, REFERENCE);
        const after = evaluateAll(withCondition.pedigree, REFERENCE);
        before.forEach((result, i) => {
          expect(STRENGTH[after[i]?.status ?? 'none']).toBeGreaterThanOrEqual(STRENGTH[result.status]);
        });
      }),
      fcOptions,
    );
  });

  it('adding a healthy person who is not a blood relative changes nothing at all', () => {
    const howArb = fc.record({ how: fc.constantFrom('partner', 'stranger', 'step-parent', 'adoptive-child'), at: fc.nat(), sex: fc.constantFrom<Sex>('female', 'male') });
    fc.assert(
      fc.property(pedigreeArb, howArb, (ped, { how, at, sex }) => {
        const ids = Object.keys(ped.persons);
        const anchor = ids[at % ids.length] ?? ped.probandId;
        const result =
          how === 'partner'
            ? addPartner(ped, anchor, { sex })
            : how === 'stranger'
              ? addPerson(ped, { sex })
              : how === 'step-parent'
                ? addParent(ped, ped.probandId, { sex }, 'step')
                : addChild(ped, anchor, { sex }, { kind: 'adoptive' });
        if (!result.ok) return;
        expect(evaluateAll(result.pedigree, REFERENCE)).toEqual(evaluateAll(ped, REFERENCE));
      }),
      fcOptions,
    );
  });

  it('removing a relative who triggered a finding never raises any status', () => {
    fc.assert(
      fc.property(pedigreeArb, fc.nat(), (ped, pick) => {
        const before = evaluateAll(ped, REFERENCE);
        const triggers = [...new Set(before.flatMap((r) => r.evidence))].filter((id) => id !== ped.probandId);
        if (triggers.length === 0) return;
        const removed = removePerson(ped, triggers[pick % triggers.length] ?? '', { cascade: true });
        if (!removed.ok) return;
        const after = evaluateAll(removed.pedigree, REFERENCE);
        before.forEach((result, i) => {
          expect(STRENGTH[after[i]?.status ?? 'none']).toBeLessThanOrEqual(STRENGTH[result.status]);
        });
      }),
      fcOptions,
    );
  });
});

describe('threshold metamorphic: CG164 first-degree female relative under 40', () => {
  it('raising her onset age from 39 to 40 flips that rule from Meets to not met, and changes no other rule', () => {
    fc.assert(
      fc.property(pedigreeArb, fc.constantFrom('child', 'sibling'), (ped, how) => {
        // Take breast cancer out of the tree so only the added relative can meet the rule.
        let clean = ped;
        for (const person of Object.values(ped.persons)) {
          for (const condition of person.conditions) {
            if (condition.code !== 'breast') continue;
            const result = removeCondition(clean, person.id, condition.id);
            if (result.ok) clean = result.pedigree;
          }
        }
        const added = must(
          how === 'child'
            ? addChild(clean, clean.probandId, { sex: 'female' })
            : addSibling(clean, clean.probandId, { sex: 'female' }, { type: 'full' }),
        );
        const at = (age: number) => {
          const result = setCondition(added.ped, added.id, { id: 'cx', code: 'breast', ageAtOnset: age, confirmed: 'confirmed' });
          if (!result.ok) throw new Error(result.error.message);
          return evaluateAll(result.pedigree, REFERENCE);
        };
        const rule = (results: GuidelineResult[]) =>
          results.flatMap((r) => r.findings).find((f) => f.ruleId === 'cg164-female-under-40');
        const at39 = at(39);
        const at40 = at(40);
        expect(rule(at39)?.status).toBe('meets');
        expect(rule(at39)?.evidence).toEqual([added.id]);
        expect(rule(at40)?.status).toBe('none');
        const others = (results: GuidelineResult[]) => ruleStatuses(results).filter((s) => !s.startsWith('cg164-female-under-40:'));
        expect(others(at40)).toEqual(others(at39));
      }),
      fcOptions,
    );
  });
});

describe('statuses summary', () => {
  it('a guideline status is the strongest status among its rules', () => {
    fc.assert(
      fc.property(pedigreeArb, (ped) => {
        for (const result of evaluateAll(ped, REFERENCE)) {
          const strongest = Math.max(...result.findings.map((f) => STRENGTH[f.status]));
          expect(STRENGTH[result.status]).toBe(strongest);
        }
        expect(statuses(evaluateAll(ped, REFERENCE))).toHaveLength(listGuidelines().length);
      }),
      { ...fcOptions, numRuns: 200 },
    );
  });
});
