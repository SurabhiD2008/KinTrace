import { createPedigree, createSamplePedigree } from '../../../src/domain';
import type { Pedigree } from '../../../src/domain';
import { evaluateAll, getGuideline, listGuidelines } from '../../../src/guidelines';
import type { FindingStatus } from '../../../src/guidelines';
import { en } from '../../../src/i18n/en';
import { CASES, GUIDELINE_IDS, family, findingFor, statusOf } from '../../fixtures/guidelineFamily';
import { buildPedigree, deepFreeze } from '../../fixtures/pedigrees';

const STRENGTH: Record<FindingStatus, number> = { none: 0, discuss: 1, meets: 2 };


function statuses(ped: Pedigree): Record<string, FindingStatus> {
  return Object.fromEntries(evaluateAll(ped).map((result) => [result.guidelineId, result.status]));
}

function withPerson(ped: Pedigree, id: string, linked: boolean, affected: boolean): Pedigree {
  const conditions = affected
    ? family({ x: [['breast', 35], ['colorectal', 40], ['coronary_event', 40]] }).persons.x?.conditions ?? []
    : [];
  return {
    ...ped,
    persons: { ...ped.persons, [id]: { id, sex: 'female', deceased: false, conditions } },
    parentLinks: linked
      ? [
          ...ped.parentLinks,
          { childId: id, parentId: 'mom', kind: 'biological' },
          { childId: id, parentId: 'dad', kind: 'biological' },
        ]
      : ped.parentLinks,
  };
}

describe('registry', () => {
  it('lists the five guidelines with complete, sourced profiles', () => {
    const guidelines = listGuidelines();
    expect(guidelines.map((guideline) => guideline.id)).toEqual([...GUIDELINE_IDS]);
    for (const guideline of guidelines) {
      expect(guideline.sourceUrl).toMatch(/^https:\/\//);
      expect(guideline.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['cancer', 'cardio']).toContain(guideline.domain);
      for (const text of [guideline.name, guideline.shortName, guideline.sourceTitle, guideline.publisher, guideline.countryOrScope]) {
        expect(text).not.toBe('');
      }
      expect(guideline.rules.length).toBeGreaterThan(0);
    }
  });

  it('has one rule per CG164 criterion and one rule for each other guideline', () => {
    const count = (id: string) => getGuideline(id)?.rules.length;
    expect(GUIDELINE_IDS.map(count)).toEqual([6, 1, 1, 1, 1]);
  });

  it('returns undefined for an unknown guideline id', () => {
    expect(getGuideline('nope')).toBeUndefined();
  });

  it('gives a guideline the strongest status among its rules', () => {
    // Mother at 38 meets one CG164 rule; the bilateral rule is only "could be met".
    const ped = family({ mom: [['breast', 38]] });
    expect(findingFor(ped, 'cg164-bilateral-under-50').status).toBe('discuss');
    expect(findingFor(ped, 'cg164-three-relatives').status).toBe('none');
    expect(statusOf(ped, 'nice-cg164')).toBe('meets');
  });
});

describe('golden: the sample pedigree', () => {
  const results = evaluateAll(createSamplePedigree());
  const result = (id: string) => results.find((candidate) => candidate.guidelineId === id);

  it.each<[string, FindingStatus, string[]]>([
    ['nice-cg164', 'meets', ['maunt', 'mgm', 'mother']],
    ['amsterdam-ii', 'none', []],
    ['nice-cg71', 'discuss', ['father']],
    ['dlcn-family-history', 'none', []],
    // Not "none" as first expected: NG238 has no threshold of 55 for men. See docs/RULES.md.
    ['nice-ng238', 'discuss', ['father']],
  ])('%s is %s with evidence %j', (id, status, evidence) => {
    expect(result(id)?.status).toBe(status);
    expect([...(result(id)?.evidence ?? [])].sort()).toEqual(evidence);
  });

  it('meets CG164 through exactly three criteria', () => {
    const met = result('nice-cg164')?.findings.filter((finding) => finding.status === 'meets');
    expect(met?.map((finding) => finding.ruleId)).toEqual([
      'cg164-female-under-40',
      'cg164-two-relatives',
      'cg164-breast-and-ovarian',
    ]);
  });

  it('never lets the second-degree paternal uncle trigger or support a heart rule', () => {
    for (const id of ['nice-cg71', 'dlcn-family-history', 'nice-ng238']) {
      const findings = result(id)?.findings ?? [];
      expect(findings.flatMap((finding) => finding.evidence)).not.toContain('puncle');
      expect(findings.flatMap((finding) => finding.steps.flatMap((step) => step.evidence))).not.toContain('puncle');
    }
  });

  it('flags the sample evidence as self-reported', () => {
    const cg71 = result('nice-cg71')?.findings[0];
    expect(cg71?.selfReportedEvidence).toEqual(['father']);
  });
});

describe('unknown relatives', () => {
  it('surfaces the unknown biological parents of a lone proband in every finding', () => {
    const findings = evaluateAll(createPedigree({ sex: 'female', ageNow: 30 })).flatMap((r) => r.findings);
    expect(findings).toHaveLength(10);
    for (const finding of findings) {
      expect(finding.status).toBe('none');
      expect(finding.unknowns.map((gap) => gap.field)).toEqual(['biologicalParent', 'biologicalParent']);
    }
  });

  it('surfaces one unknown parent when only the mother is recorded', () => {
    const ped = buildPedigree({ people: 'me:f mom:f', bio: 'me<mom' });
    const [finding] = evaluateAll(ped).flatMap((r) => r.findings);
    expect(finding?.unknowns.map((gap) => gap.field)).toEqual(['biologicalParent']);
  });

  it('returns no findings when the proband is missing, instead of throwing', () => {
    const broken: Pedigree = { ...createSamplePedigree(), probandId: 'ghost' };
    expect(evaluateAll(broken).map((r) => r.findings)).toEqual([[], [], [], [], []]);
  });
});

describe('monotonicity', () => {
  it.each(CASES.map((affected, index) => [index, affected] as const))(
    'case %i: adding a qualifying relative never lowers a status',
    (_index, affected) => {
      const before = statuses(family(affected));
      const after = statuses(withPerson(family(affected), 'extra', true, true));
      for (const id of GUIDELINE_IDS) {
        expect(STRENGTH[after[id] ?? 'none']).toBeGreaterThanOrEqual(STRENGTH[before[id] ?? 'none']);
      }
    },
  );

  it.each(CASES.map((affected, index) => [index, affected] as const))(
    'case %i: adding a healthy relative or an unconnected person never changes a status',
    (_index, affected) => {
      const before = statuses(family(affected));
      expect(statuses(withPerson(family(affected), 'healthy', true, false))).toEqual(before);
      expect(statuses(withPerson(family(affected), 'stranger', false, true))).toEqual(before);
    },
  );
});

describe('purity', () => {
  it.each(CASES.map((affected, index) => [index, affected] as const))(
    'case %i: evaluating twice gives equal results and leaves the input untouched',
    (_index, affected) => {
      const ped = deepFreeze(family(affected));
      const pristine = family(affected);
      const first = evaluateAll(ped);
      expect(evaluateAll(ped)).toEqual(first);
      expect(ped).toEqual(pristine);
    },
  );
});

describe('wording', () => {
  const FORBIDDEN = /risk of|%|probability|chance|likely/i;

  function stringsIn(value: unknown, found: string[] = []): string[] {
    if (typeof value === 'string') found.push(value);
    else if (Array.isArray(value)) value.forEach((item) => stringsIn(item, found));
    else if (typeof value === 'object' && value !== null) Object.values(value).forEach((v) => stringsIn(v, found));
    return found;
  }

  it('has no forbidden word in any string table entry the engine draws on', () => {
    const prefixes = ['g.', 'gap.', 'person.', 'rel.', 'ordinal.'];
    const entries = Object.entries(en).filter(([key]) => prefixes.some((prefix) => key.startsWith(prefix)));
    expect(entries.length).toBeGreaterThan(100);
    for (const [key, value] of entries) {
      expect(`${key}: ${value}`).not.toMatch(FORBIDDEN);
    }
  });

  it('has no forbidden word in any profile field or in any finding the cases produce', () => {
    // stringsIn skips functions, so each profile's evaluate() is ignored.
    const profiles = listGuidelines();
    const outputs = [...CASES.map((affected) => family(affected)), createSamplePedigree()].map((ped) => evaluateAll(ped));
    const strings = stringsIn([profiles, outputs]);
    expect(strings.length).toBeGreaterThan(1000);
    for (const text of strings) {
      expect(text).not.toMatch(FORBIDDEN);
    }
  });

  it('never puts a number followed by a percent sign or the word "score" in a finding', () => {
    const strings = stringsIn(CASES.map((affected) => evaluateAll(family(affected))));
    for (const text of strings) {
      expect(text).not.toMatch(/\bscore\b|diagnos(is|ed with familial)/i);
    }
  });
});
