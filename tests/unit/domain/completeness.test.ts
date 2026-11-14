import { completeness, createSamplePedigree, updatePerson } from '../../../src/domain';
import type { GapField, Pedigree, Person } from '../../../src/domain';
import { buildPedigree } from '../../fixtures/pedigrees';

type Details = Record<string, Partial<Omit<Person, 'id'>>>;

/** Proband with both parents, everything known. Checks: 2x3 parents, 2x3 proband, 2x(4x3) parents = 36. */
function nuclear(details: Details = {}, extra: { people?: string; bio?: string } = {}): Pedigree {
  return buildPedigree({
    people: `me:f mom:f dad:m ${extra.people ?? ''}`,
    bio: `me<mom+dad ${extra.bio ?? ''}`,
    details: { me: { ageNow: 30 }, mom: { ageNow: 58 }, dad: { ageNow: 60 }, ...details },
  });
}

function gapKeys(ped: Pedigree, referenceYear?: number): string[] {
  const options = referenceYear === undefined ? {} : { referenceYear };
  return completeness(ped, options)
    .gaps.map((gap) => `${gap.personId}.${gap.field}:${gap.weight}`)
    .sort();
}

describe('completeness (a data-quality measure)', () => {
  it('is 100 with no gaps when everything expected is recorded', () => {
    expect(completeness(nuclear())).toEqual({ percent: 100, gaps: [] });
  });

  it.each<[string, Details, string[], number]>([
    ['a first-degree relative with no age', { mom: {} }, ['mom.age:3'], 92],
    ['a relative of unknown sex', { dad: { sex: 'unknown', ageNow: 60 } }, ['dad.sex:3'], 92],
    [
      'a relative whose living status is unknown',
      { mom: { ageNow: 58, vitalStatusUnknown: true } },
      ['mom.vitalStatus:3'],
      92,
    ],
    [
      'a relative flagged as having unknown health history',
      { dad: { ageNow: 60, healthHistoryUnknown: true } },
      ['dad.healthHistory:3'],
      92,
    ],
    ['a proband with no age or sex', { me: { sex: 'unknown' } }, ['me.age:3', 'me.sex:3'], 83],
  ])('reports %s', (_name, details, expectedGaps, percent) => {
    const ped = nuclear(details);
    expect(gapKeys(ped)).toEqual(expectedGaps);
    expect(completeness(ped).percent).toBe(percent);
  });

  it('reports each unknown biological parent of the proband', () => {
    const alone = buildPedigree({ people: 'me:f', details: { me: { ageNow: 30 } } });
    expect(gapKeys(alone)).toEqual(['me.biologicalParent:3', 'me.biologicalParent:3']);
    expect(completeness(alone).percent).toBe(50);

    const oneParent = buildPedigree({
      people: 'me:f mom:f',
      bio: 'me<mom',
      details: { me: { ageNow: 30 }, mom: { ageNow: 58 } },
    });
    expect(gapKeys(oneParent)).toEqual(['me.biologicalParent:3']);
  });

  it('does not count adoptive or step parents as known biological parents', () => {
    const adopted = buildPedigree({
      people: 'me:f amom:f adad:m',
      adoptive: 'me<amom+adad',
      details: { me: { ageNow: 30 }, amom: { ageNow: 58 }, adad: { ageNow: 60 } },
    });
    expect(gapKeys(adopted)).toEqual(['me.biologicalParent:3', 'me.biologicalParent:3']);
  });

  it('reports a recorded condition with no age at onset', () => {
    const condition = {
      id: 'c1',
      code: 'colorectal',
      domain: 'cancer',
      ageUnknown: true,
      confirmed: 'reported',
    } as const;
    const ped = nuclear({ mom: { ageNow: 58, conditions: [condition] } });
    expect(gapKeys(ped)).toEqual(['mom.conditionOnset:3']);
    const known = nuclear({
      mom: { ageNow: 58, conditions: [{ ...condition, ageUnknown: false, ageAtOnset: 50 }] },
    });
    expect(completeness(known).percent).toBe(100);
  });

  it.each<[string, string, string, number]>([
    ['first-degree', 'sib:u', 'sib<mom+dad', 3],
    ['second-degree', 'gm:u', 'mom<gm', 2],
    ['third-degree', 'gm:f ggm:u', 'mom<gm gm<ggm', 1],
  ])('weights a %s relative of unknown sex at the right weight', (_name, people, bio, weight) => {
    const id = people.split(' ').at(-1)?.split(':')[0] ?? '';
    const ped = nuclear({ gm: { ageNow: 80 }, [id]: { ageNow: 50 } }, { people, bio });
    expect(gapKeys(ped)).toEqual([`${id}.sex:${weight}`]);
  });

  it('accepts a birth year as a known age only when a reference year is given', () => {
    const ped = nuclear({ mom: { birthYear: 1962 } });
    expect(gapKeys(ped)).toEqual(['mom.age:3']);
    expect(gapKeys(ped, 2020)).toEqual([]);
  });

  it('reports an adopted-in relative with no biological family information', () => {
    const ped = nuclear({ asib: { ageNow: 25 } }, { people: 'asib:f' });
    const adoptedIn: Pedigree = {
      ...ped,
      parentLinks: [...ped.parentLinks, { childId: 'asib', parentId: 'mom', kind: 'adoptive' }],
    };
    expect(gapKeys(adoptedIn)).toEqual(['asib.biologicalFamily:1']);

    const withBirthParent: Pedigree = {
      ...adoptedIn,
      persons: { ...adoptedIn.persons, bmom: { id: 'bmom', sex: 'female', deceased: false, conditions: [] } },
      parentLinks: [...adoptedIn.parentLinks, { childId: 'asib', parentId: 'bmom', kind: 'biological' }],
    };
    expect(gapKeys(withBirthParent)).toEqual([]);
  });

  it('does not ask for details of people who are not blood relatives', () => {
    const ped = nuclear({}, { people: 'stepdad:u' });
    const withStep: Pedigree = {
      ...ped,
      parentLinks: [...ped.parentLinks, { childId: 'me', parentId: 'stepdad', kind: 'step' }],
    };
    expect(completeness(withStep)).toEqual({ percent: 100, gaps: [] });
  });

  it('never rounds up to 100 while a gap remains', () => {
    // 200 fully known siblings make one third-degree gap a tiny share of the total.
    const ids = Array.from({ length: 200 }, (_, index) => `s${index}`);
    const ped = nuclear(
      { ...Object.fromEntries(ids.map((id) => [id, { ageNow: 30 }])), gm: { ageNow: 80 } },
      {
        people: `${ids.map((id) => `${id}:f`).join(' ')} gm:f ggm:u`,
        bio: `${ids.map((id) => `${id}<mom+dad`).join(' ')} mom<gm gm<ggm`,
      },
    );
    const result = completeness(ped, {});
    expect(result.gaps.map((gap) => gap.field)).toEqual<GapField[]>(['sex', 'age']);
    expect(result.percent).toBe(99);
  });
});

describe('completeness of the sample pedigree', () => {
  const sample = createSamplePedigree();

  it('lists exactly what the sample leaves unknown', () => {
    expect(gapKeys(sample)).toEqual([
      'maunt.age:2',
      'mgf.age:2',
      'mgm.age:2',
      'pgf.age:2',
      'pgf.healthHistory:2',
      'pgf.vitalStatus:2',
      'pgm.age:2',
      'pgm.healthHistory:2',
      'pgm.vitalStatus:2',
    ]);
    const { percent } = completeness(sample);
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThan(100);
  });

  it('reaches 100 once every gap is filled in', () => {
    let ped = sample;
    const fill = (id: string, patch: Parameters<typeof updatePerson>[2]) => {
      const result = updatePerson(ped, id, patch);
      if (result.ok) ped = result.pedigree;
    };
    fill('maunt', { ageAtDeath: 47 });
    fill('mgm', { ageAtDeath: 70 });
    fill('mgf', { ageNow: 85 });
    fill('pgm', { ageNow: 88, vitalStatusUnknown: null, healthHistoryUnknown: null });
    fill('pgf', { deceased: true, ageAtDeath: 80, vitalStatusUnknown: false, healthHistoryUnknown: false });
    expect(completeness(ped)).toEqual({ percent: 100, gaps: [] });
  });

  it('describes gaps as missing information, never as health or risk', () => {
    for (const gap of completeness(sample).gaps) {
      expect(gap.text).not.toBe('');
      expect(gap.text).not.toMatch(/risk|healthy|likely|%/i);
    }
    expect(completeness(sample).gaps.find((gap) => gap.personId === 'pgm')?.text).toContain(
      'Paternal grandmother',
    );
  });
});
