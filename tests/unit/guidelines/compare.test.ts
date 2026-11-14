import { createPedigree, createSamplePedigree } from '../../../src/domain';
import { compareGuidelines, defaultDomain, evaluateAll, listGuidelines } from '../../../src/guidelines';
import { en } from '../../../src/i18n/en';
import { CASES, family } from '../../fixtures/guidelineFamily';

const rule = (id: string) => {
  const found = listGuidelines()
    .flatMap((guideline) => guideline.rules)
    .find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No rule ${id}`);
  return found;
};
const reasons = (ruleId: string, ped = family()) =>
  Object.fromEntries(rule(ruleId).explainExclusions(ped).map((e) => [e.personId, e.reason]));

describe('rule thresholds', () => {
  it('every rule has a plain-words threshold whose key exists and whose placeholders are all filled', () => {
    for (const guideline of listGuidelines()) {
      for (const { thresholds } of guideline.rules) {
        expect(en[thresholds.key]).toBeDefined();
        const placeholders = [...en[thresholds.key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        for (const name of placeholders) expect(thresholds.params).toHaveProperty(name ?? '');
        expect(thresholds.conditions.length).toBeGreaterThan(0);
      }
    }
  });

  it.each([
    ['cg71-premature-chd', 'You or a first-degree relative, event before age 60', { any: 60 }, true],
    ['dlcn-family-history', 'First-degree relative, event before age 55 in a man or before age 60 in a woman', { male: 55, female: 60 }, false],
    ['ng238-family-history', 'First-degree relative, event before age 60', { any: 60 }, false],
    ['cg164-female-under-40', 'First-degree female relative, breast cancer before age 40', { female: 40 }, false],
    ['cg164-male-any-age', 'First-degree male relative, breast cancer at any age', {}, false],
  ])('%s counts "%s"', (ruleId, text, ageLimits, countsSelf) => {
    const { thresholds } = rule(ruleId);
    expect(en[thresholds.key].replace(/\{(\w+)\}/g, (_m, n: string) => String(thresholds.params[n]))).toBe(text);
    expect(thresholds.ageLimits).toEqual(ageLimits);
    expect(thresholds.countsSelf).toBe(countsSelf);
  });
});

describe('explainExclusions', () => {
  it('gives the reason the brief asks for: father, 57, above the under-55 threshold for men', () => {
    expect(reasons('dlcn-family-history', family({ dad: [['coronary_event', 57]] }))).toEqual({
      dad: 'Your father, 57: above the under-55 threshold for men',
    });
  });

  it('uses the woman’s threshold for a woman', () => {
    expect(reasons('dlcn-family-history', family({ mom: [['coronary_event', 61]] }))).toEqual({
      mom: 'Your mother, 61: above the under-60 threshold for women',
    });
    // 57 is under 60, so a mother at 57 is counted, not excluded.
    expect(reasons('dlcn-family-history', family({ mom: [['coronary_event', 57]] }))).toEqual({});
  });

  it('explains degree, "not sure" and a sex that is not recorded', () => {
    const ped = family({
      puncle: [['coronary_event', 40]],
      bro: [['coronary_event', 70, { confirmed: 'unsure' }]],
      sibx: [['coronary_event', 60]],
    });
    expect(reasons('ng238-family-history', ped)).toEqual({
      puncle: 'Your paternal uncle, 40: a second-degree relative; only first-degree relatives count',
      bro: 'Your brother: recorded as not sure, so not counted',
      sibx: 'Your sibling, 60: above the under-60 threshold',
    });
    // Unknown sex at 60 is past both of the DLCN limits, so it is excluded on age.
    expect(reasons('dlcn-family-history', ped).sibx).toBe('Your sibling, 60: above the under-60 threshold');
  });

  it('keeps people with a missing detail in the finding as possible evidence, never excluded', () => {
    const ped = family({ sis: [['coronary_event']], sibx: [['coronary_event', 57]] });
    expect(reasons('dlcn-family-history', ped)).toEqual({});
    expect(evaluateAll(ped).find((r) => r.guidelineId === 'dlcn-family-history')?.status).toBe('discuss');
  });

  it('says the person’s own history does not count where it does not, and counts it where it does', () => {
    const ped = family({ me: [['coronary_event', 50]] });
    expect(reasons('ng238-family-history', ped)).toEqual({
      me: 'You, 50: your own history is not part of this criterion',
    });
    expect(reasons('cg71-premature-chd', ped)).toEqual({});
  });

  it('explains sex and laterality for the breast rules', () => {
    const ped = family({ dad: [['breast', 70]], mom: [['breast', 45, { laterality: 'left' }]] });
    expect(reasons('cg164-female-under-40', ped)).toMatchObject({
      dad: 'Your father, 70: not female; this criterion is about female relatives',
      mom: 'Your mother, 45: above the under-40 threshold',
    });
    expect(reasons('cg164-bilateral-under-50', ped)).toMatchObject({
      mom: 'Your mother, 45: one breast recorded; this criterion needs both',
    });
  });

  it('never ignores step or adoptive relatives silently: they are simply not blood relatives and not listed', () => {
    const ped = family({ stepmom: [['coronary_event', 40]], asib: [['coronary_event', 40]] });
    expect(reasons('cg71-premature-chd', ped)).toEqual({});
  });

  it.each(CASES.map((affected, index) => [index, affected] as const))(
    'case %i: nobody is both counted and excluded, and everyone with a relevant condition is one or the other',
    (_index, affected) => {
      const ped = family(affected);
      const findings = evaluateAll(ped).flatMap((result) => result.findings);
      for (const guideline of listGuidelines()) {
        for (const r of guideline.rules) {
          const finding = findings.find((f) => f.ruleId === r.id);
          const counted = new Set(finding?.evidence ?? []);
          const excluded = r.explainExclusions(ped).map((e) => e.personId);
          for (const id of excluded) expect(counted.has(id)).toBe(false);
          const relevant = Object.values(ped.persons).filter(
            (p) => p.id in affected && p.conditions.some((c) => r.thresholds.conditions.includes(c.code)),
          );
          for (const person of relevant) {
            const isBlood = !['stepmom', 'asib', 'partner', 'hsdad', 'ap1', 'ap2'].includes(person.id);
            if (isBlood) expect(counted.has(person.id) || excluded.includes(person.id)).toBe(true);
          }
        }
      }
    },
  );

  it('returns nothing, instead of throwing, when the proband is missing', () => {
    const broken = { ...createSamplePedigree(), probandId: 'ghost' };
    for (const guideline of listGuidelines()) {
      for (const r of guideline.rules) expect(r.explainExclusions(broken)).toEqual([]);
    }
  });
});

describe('compareGuidelines', () => {
  it('golden: the sample heart comparison is driven by the father at 57', () => {
    const { rows, countedBy, why } = compareGuidelines(createSamplePedigree(), 'cardio');
    const row = (id: string) => rows.find((r) => r.guideline.id === id);
    expect(rows.map((r) => r.guideline.id)).toEqual(['nice-cg71', 'dlcn-family-history', 'nice-ng238']);
    expect(row('nice-cg71')).toMatchObject({ status: 'discuss', counted: ['father'] });
    expect(row('dlcn-family-history')).toMatchObject({ status: 'none', counted: [] });
    expect(row('dlcn-family-history')?.notCounted).toContainEqual({
      personId: 'father',
      reason: 'Your father, 57: above the under-55 threshold for men',
    });
    // Not "not met" as the brief expected: NG238 has no threshold of 55 for men. See docs/RULES.md.
    expect(row('nice-ng238')).toMatchObject({ status: 'discuss', counted: ['father'] });
    // The paternal uncle is seen by all three and counted by none.
    for (const r of rows) expect(r.notCounted.map((e) => e.personId)).toContain('puncle');
    expect(countedBy).toEqual({ father: 2 });
    expect(why.join(' ')).toContain('under 55 for men and under 60 for women');
    expect(why.join(' ')).toContain(
      'Your father, 57: above the under-55 threshold for men. That is why this relative is not counted by DLCN family-history item, but is counted by NICE CG71 and NICE NG238.',
    );
  });

  it('golden: the sample cancer comparison counts the three maternal relatives once each', () => {
    const { rows, countedBy } = compareGuidelines(createSamplePedigree(), 'cancer');
    expect(rows.map((r) => [r.guideline.id, r.status])).toEqual([
      ['nice-cg164', 'meets'],
      ['amsterdam-ii', 'none'],
    ]);
    expect(countedBy).toEqual({ mother: 1, mgm: 1, maunt: 1 });
    expect(rows[0]?.thresholds).toHaveLength(6);
  });

  it('says so when nobody is counted', () => {
    expect(compareGuidelines(family(), 'cardio').why).toContain(
      'Nobody in your family tree is counted by any of these guidelines, from what has been entered so far.',
    );
  });

  it('agrees with evaluateAll for every case', () => {
    for (const affected of CASES) {
      const ped = family(affected);
      const results = evaluateAll(ped);
      for (const domain of ['cancer', 'cardio'] as const) {
        for (const row of compareGuidelines(ped, domain).rows) {
          const result = results.find((r) => r.guidelineId === row.guideline.id);
          expect(row.status).toBe(result?.status);
          expect(row.counted).toEqual(result?.evidence);
        }
      }
    }
  });

  it('defaults to heart only when someone has a heart condition', () => {
    expect(defaultDomain(createSamplePedigree())).toBe('cardio');
    expect(defaultDomain(family({ mom: [['breast', 38]] }))).toBe('cancer');
    expect(defaultDomain(createPedigree())).toBe('cancer');
  });
});
