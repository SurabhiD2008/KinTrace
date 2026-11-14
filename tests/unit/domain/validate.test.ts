import { createSamplePedigree, validatePedigree } from '../../../src/domain';
import type { Pedigree, Person, Severity, ValidationCode } from '../../../src/domain';
import { buildPedigree } from '../../fixtures/pedigrees';
import type { PedigreeSpec } from '../../fixtures/pedigrees';

type Details = Record<string, Partial<Omit<Person, 'id'>>>;

const BIRTH_YEARS: Details = {
  me: { birthYear: 1990 },
  mom: { birthYear: 1960 },
  dad: { birthYear: 1958 },
};

/** A small valid family; each case overrides only what it needs. */
function family(overrides: Partial<PedigreeSpec> = {}, details: Details = {}): Pedigree {
  return buildPedigree({
    people: 'me:f mom:f dad:m',
    bio: 'me<mom+dad',
    partners: 'mom+dad',
    ...overrides,
    details: {
      ...details,
      me: { ...BIRTH_YEARS.me, ...details.me },
      mom: { ...BIRTH_YEARS.mom, ...details.mom },
      dad: { ...BIRTH_YEARS.dad, ...details.dad },
    },
  });
}

function withCondition(ageAtOnset: number, fields: Partial<Omit<Person, 'id'>>): Pedigree {
  return family(
    {},
    {
      mom: {
        ...fields,
        conditions: [
          {
            id: 'c1',
            code: 'breast',
            domain: 'cancer',
            ageAtOnset,
            ageUnknown: false,
            confirmed: 'reported',
          },
        ],
      },
    },
  );
}

function withMisfiledPerson(storedId: string): Pedigree {
  const ped = family();
  const mom = ped.persons.mom;
  if (!mom) throw new Error('fixture has no mom');
  return { ...ped, persons: { ...ped.persons, mom: { ...mom, id: storedId } } };
}

interface Case {
  code: ValidationCode;
  severity: Severity;
  bad: Pedigree;
  good: Pedigree;
  referenceYear?: number;
}

const cases: Case[] = [
  {
    code: 'missing_proband',
    severity: 'error',
    bad: family({ proband: 'ghost' }),
    good: family(),
  },
  {
    code: 'multiple_probands',
    severity: 'error',
    bad: withMisfiledPerson('me'),
    good: family(),
  },
  {
    code: 'person_id_mismatch',
    severity: 'error',
    bad: withMisfiledPerson('mum'),
    good: family(),
  },
  {
    code: 'unknown_person_reference',
    severity: 'error',
    bad: family({ step: 'me<ghost' }),
    good: family({ people: 'me:f mom:f dad:m ghost:m', step: 'me<ghost' }),
  },
  {
    code: 'cycle',
    severity: 'error',
    bad: family({ step: 'mom<me' }),
    good: family({ people: 'me:f mom:f dad:m kid:m', step: 'kid<me' }),
  },
  {
    code: 'too_many_biological_parents',
    severity: 'error',
    bad: family({ people: 'me:f mom:f dad:m third:m', bio: 'me<mom+dad+third' }),
    good: family({ people: 'me:f mom:f dad:m third:m', step: 'me<third' }),
  },
  {
    code: 'duplicate_parent_link',
    severity: 'error',
    bad: family({ step: 'me<mom' }),
    good: family({ people: 'me:f mom:f dad:m other:f', step: 'me<other' }),
  },
  {
    code: 'duplicate_partnership',
    severity: 'error',
    bad: family({ partners: 'mom+dad dad+mom' }),
    good: family({ partners: 'mom+dad' }),
  },
  {
    code: 'self_partnership',
    severity: 'error',
    bad: family({ partners: 'mom+mom' }),
    good: family({ partners: 'mom+dad' }),
  },
  {
    code: 'parent_born_after_child',
    severity: 'error',
    bad: family({}, { mom: { birthYear: 1995 } }),
    good: family({}, { mom: { birthYear: 1960 } }),
  },
  {
    code: 'parent_age_gap_too_small',
    severity: 'error',
    bad: family({}, { mom: { birthYear: 1979 } }), // 11 years older
    good: family({}, { mom: { birthYear: 1978 } }), // exactly 12
  },
  {
    code: 'parent_age_gap_large',
    severity: 'warning',
    bad: family({}, { dad: { birthYear: 1929 } }), // 61 years older
    good: family({}, { dad: { birthYear: 1930 } }), // exactly 60
  },
  {
    code: 'onset_after_death',
    severity: 'error',
    bad: withCondition(55, { deceased: true, ageAtDeath: 54 }),
    good: withCondition(54, { deceased: true, ageAtDeath: 54 }),
  },
  {
    code: 'onset_after_current_age',
    severity: 'error',
    bad: withCondition(61, { ageNow: 60 }),
    good: withCondition(60, { ageNow: 60 }),
  },
  {
    code: 'onset_after_current_age',
    severity: 'error',
    bad: withCondition(61, {}), // born 1960, so 60 in the reference year
    good: withCondition(60, {}),
    referenceYear: 2020,
  },
  {
    code: 'age_invalid',
    severity: 'error',
    bad: family({}, { mom: { ageNow: -1 } }),
    good: family({}, { mom: { ageNow: 0 } }),
  },
  {
    code: 'age_invalid',
    severity: 'error',
    bad: withCondition(40.5, {}),
    good: withCondition(40, {}),
  },
  {
    code: 'age_too_high',
    severity: 'error',
    bad: family({}, { mom: { deceased: true, ageAtDeath: 121 } }),
    good: family({}, { mom: { deceased: true, ageAtDeath: 120 } }),
  },
];

function run({ referenceYear }: Case, ped: Pedigree) {
  return validatePedigree(ped, referenceYear === undefined ? {} : { referenceYear });
}

describe('validatePedigree', () => {
  it.each(cases)('reports $code ($severity) for the failing example', (testCase) => {
    const found = run(testCase, testCase.bad).filter((issue) => issue.code === testCase.code);
    expect(found.length).toBeGreaterThan(0);
    for (const issue of found) {
      expect(issue.severity).toBe(testCase.severity);
      expect(issue.message).not.toBe('');
    }
  });

  it.each(cases)('does not report $code for the passing example', (testCase) => {
    const codes = run(testCase, testCase.good).map((issue) => issue.code);
    expect(codes).not.toContain(testCase.code);
  });

  it('finds nothing wrong with the base family or the sample pedigree', () => {
    expect(validatePedigree(family())).toEqual([]);
    expect(validatePedigree(createSamplePedigree(), { referenceYear: 2020 })).toEqual([]);
  });

  it('names the people involved', () => {
    const [issue] = validatePedigree(family({}, { mom: { birthYear: 1995 } }));
    expect(issue).toMatchObject({ code: 'parent_born_after_child', personIds: ['mom', 'me'] });
  });

  it('compares stated ages when birth years are missing', () => {
    const ped = buildPedigree({
      people: 'me:f mom:f',
      bio: 'me<mom',
      details: { me: { ageNow: 34 }, mom: { ageNow: 40 } },
    });
    expect(validatePedigree(ped).map((issue) => issue.code)).toEqual(['parent_age_gap_too_small']);
  });

  it('does not apply the age-gap rules to step or adoptive parents', () => {
    const ped = family(
      { people: 'me:f mom:f dad:m stepmum:f', step: 'me<stepmum' },
      { stepmum: { birthYear: 1988 } },
    );
    expect(validatePedigree(ped)).toEqual([]);
  });

  it('says nothing about onset when the current age cannot be known', () => {
    // A birth year alone gives no age unless a reference year is passed in.
    expect(validatePedigree(withCondition(61, {}))).toEqual([]);
  });
});
