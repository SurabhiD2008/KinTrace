import {
  createSamplePedigree,
  deserialize,
  migrate,
  pedigreeSchema,
  serialize,
} from '../../../src/domain';
import type { Pedigree } from '../../../src/domain';
import { generatePedigree } from '../../fixtures/pedigrees';

const sample = createSamplePedigree();

/** The sample as plain JSON data, with a change applied before it is turned back into text. */
function tampered(change: (raw: Record<string, unknown>) => void): string {
  const raw = JSON.parse(serialize(sample)) as Record<string, unknown>;
  change(raw);
  return JSON.stringify(raw);
}

/** The sample's mother as plain JSON data. */
function motherIn(raw: Record<string, unknown>): Record<string, unknown> {
  const mother = (raw.persons as Record<string, Record<string, unknown>>).mother;
  if (!mother) throw new Error('sample has no mother');
  return mother;
}

function firstConditionOf(person: Record<string, unknown>): Record<string, unknown> {
  const [condition] = person.conditions as Record<string, unknown>[];
  if (!condition) throw new Error('person has no condition');
  return condition;
}

function addLink(raw: Record<string, unknown>, link: Record<string, string>) {
  (raw.parentLinks as unknown[]).push(link);
}

describe('serialize and deserialize', () => {
  it('round-trips the sample pedigree unchanged', () => {
    expect(deserialize(serialize(sample))).toEqual({ ok: true, pedigree: sample });
  });

  it('round-trips a generated 300-person pedigree unchanged', () => {
    const large = generatePedigree(300);
    expect(deserialize(serialize(large))).toEqual({ ok: true, pedigree: large });
  });

  it('strips unknown fields at every level', () => {
    const json = tampered((raw) => {
      raw.tracking = 'x';
      motherIn(raw).secret = 1;
      firstConditionOf(motherIn(raw)).extra = true;
    });
    expect(deserialize(json)).toEqual({ ok: true, pedigree: sample });
  });

  it('accepts exactly 500 people', () => {
    expect(deserialize(serialize(generatePedigree(500))).ok).toBe(true);
  });
});

describe('deserialize rejects bad input without throwing', () => {
  const big = generatePedigree(501);
  const cases: [string, unknown, RegExp][] = [
    ['a value that is not text', 42, /not text/],
    ['an object instead of text', { version: 1 }, /not text/],
    ['garbage', '}{ not json', /not valid JSON/],
    ['an empty string', '', /not valid JSON/],
    ['JSON null', 'null', /no version/],
    ['a JSON array', '[]', /no version/],
    ['a JSON number', '7', /no version/],
    ['a missing version', tampered((raw) => delete raw.version), /no version/],
    ['a version given as text', tampered((raw) => (raw.version = '1')), /no version/],
    ['a newer version', tampered((raw) => (raw.version = 2)), /newer version/],
    ['a fractional version', tampered((raw) => (raw.version = 0.5)), /version/],
    ['persons of the wrong type', tampered((raw) => (raw.persons = [])), /persons/],
    ['a missing proband id', tampered((raw) => delete raw.probandId), /probandId/],
    [
      'an age given as text',
      tampered((raw) => (motherIn(raw).ageNow = 'sixty')),
      /persons\.mother\.ageNow/,
    ],
    [
      'a condition code outside the closed list',
      tampered((raw) => (firstConditionOf(motherIn(raw)).code = 'headache')),
      /persons\.mother\.conditions\.0\.code/,
    ],
    [
      'an age above 120',
      tampered((raw) => (motherIn(raw).ageNow = 121)),
      /persons\.mother\.ageNow/,
    ],
    ['501 people', serialize(big), /more than 500 people/],
    ['more than 2 MB', `${' '.repeat(2 * 1024 * 1024)}${serialize(sample)}`, /larger than 2 MB/],
    [
      'more than 2 MB once multi-byte characters are counted',
      `"${'é'.repeat(1024 * 1024 + 10)}"`,
      /larger than 2 MB/,
    ],
    [
      'a cycle injected through JSON',
      tampered((raw) => addLink(raw, { childId: 'mgm', parentId: 'proband', kind: 'biological' })),
      /own ancestor/,
    ],
    [
      'a link to someone who is not in the tree',
      tampered((raw) => addLink(raw, { childId: 'proband', parentId: 'ghost', kind: 'step' })),
      /not in the tree/,
    ],
    [
      'a third biological parent',
      tampered((raw) => addLink(raw, { childId: 'proband', parentId: 'puncle', kind: 'biological' })),
      /more than two biological parents/,
    ],
    ['a proband who is not in the tree', tampered((raw) => (raw.probandId = 'ghost')), /no starting person/],
    ['a prototype-pollution payload', '{"__proto__":{}}', /not allowed/],
    [
      'a prototype-pollution payload nested in a person',
      serialize(sample).replace('"persons":{', '"persons":{"__proto__":{"polluted":true},'),
      /not allowed/,
    ],
    [
      'a constructor key',
      serialize(sample).replace('"persons":{', '"persons":{"constructor":{"prototype":{}},'),
      /not allowed/,
    ],
    ['a person id that is not a plain token', serialize(sample).replaceAll('"mgf"', '"<img>"'), /persons/],
  ];

  it.each(cases)('rejects %s', (_name, input, expected) => {
    const result = deserialize(input);
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(expected);
  });

  it('leaves Object.prototype untouched after a pollution attempt', () => {
    deserialize('{"__proto__":{"polluted":true},"version":1}');
    deserialize(serialize(sample).replace('"persons":{', '"persons":{"__proto__":{"polluted":true},'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });

  it('survives very deep nesting', () => {
    const deep = `${'['.repeat(5000)}${']'.repeat(5000)}`;
    expect(deserialize(`{"version":1,"persons":${deep}}`).ok).toBe(false);
  });

  it('caps the number of reported errors', () => {
    const json = tampered((raw) => {
      const persons = raw.persons as Record<string, Record<string, unknown>>;
      for (const person of Object.values(persons)) {
        person.sex = 'robot';
        person.deceased = 'maybe';
        person.conditions = 'none';
      }
    });
    const result = deserialize(json);
    expect(result.ok ? 0 : result.errors.length).toBe(20);
  });
});

describe('migrate', () => {
  it('passes current-version data through unchanged', () => {
    const raw: unknown = JSON.parse(serialize(sample));
    expect(migrate(raw)).toEqual({ ok: true, value: raw });
  });

  it.each<[string, unknown]>([
    ['data with no version', {}],
    ['data from a newer version', { version: 99 }],
    ['a value that is not an object', 'text'],
  ])('refuses %s', (_name, raw) => {
    expect(migrate(raw).ok).toBe(false);
  });
});

describe('pedigreeSchema', () => {
  it('accepts the sample and produces the same value', () => {
    const parsed: Pedigree = pedigreeSchema.parse(sample);
    expect(parsed).toEqual(sample);
  });
});
