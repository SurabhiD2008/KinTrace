import { ageOf, createSamplePedigree, relationshipTo, relativesOf } from '../../../src/domain';
import type { Degree, Person, Side } from '../../../src/domain';
import { buildPedigree, generatePedigree } from '../../fixtures/pedigrees';

// One large family that contains every named relationship of "me".
const family = buildPedigree({
  people:
    'me:f mom:f dad:m sis:f bro:m hsis:f hd:m mgm:f mgf:m pgm:f pgf:m maunt:f puncle:m ' +
    'mhuncle:m cousin:f auntsp:m hcousin:m mggm:f mggf:m mgaunt:f c1r:f cousin2:m spouse:m ' +
    'kid:m kidsp:f gkid:f gkidsp:m ggkid:u sissp:m niece:f niecesp:m gniece:f brosp:f nibx:u ' +
    'hniece:f stepdad:m adoptedkid:f stranger:u',
  bio:
    'me<mom+dad sis<mom+dad bro<mom+dad hsis<mom+hd mom<mgm+mgf dad<pgm+pgf maunt<mgm+mgf ' +
    'puncle<pgm+pgf mhuncle<mgm cousin<maunt+auntsp hcousin<mhuncle mgm<mggm+mggf ' +
    'mgaunt<mggm+mggf c1r<mgaunt cousin2<c1r kid<me+spouse gkid<kid+kidsp ggkid<gkid+gkidsp ' +
    'niece<sis+sissp gniece<niece+niecesp nibx<bro+brosp hniece<hsis',
  step: 'me<stepdad',
  adoptive: 'adoptedkid<me',
  partners: 'me+spouse',
  formerPartners: 'mom+hd',
});

describe('relationshipTo: blood relatives of "me"', () => {
  it.each<[string, Degree, string, Side, number]>([
    ['mom', 1, 'mother', 'maternal', 1],
    ['dad', 1, 'father', 'paternal', 1],
    ['sis', 1, 'sister', 'both', 0],
    ['bro', 1, 'brother', 'both', 0],
    ['kid', 1, 'son', 'none', -1],
    ['hsis', 2, 'half-sister', 'maternal', 0],
    ['mgm', 2, 'maternal grandmother', 'maternal', 2],
    ['mgf', 2, 'maternal grandfather', 'maternal', 2],
    ['pgm', 2, 'paternal grandmother', 'paternal', 2],
    ['pgf', 2, 'paternal grandfather', 'paternal', 2],
    ['gkid', 2, 'granddaughter', 'none', -2],
    ['maunt', 2, 'maternal aunt', 'maternal', 1],
    ['puncle', 2, 'paternal uncle', 'paternal', 1],
    ['niece', 2, 'niece', 'both', -1],
    ['nibx', 2, 'niece or nephew', 'both', -1],
    ['mhuncle', 3, 'maternal half-uncle', 'maternal', 1],
    ['cousin', 3, 'maternal first cousin', 'maternal', 0],
    ['mggm', 3, 'maternal great-grandmother', 'maternal', 3],
    ['mggf', 3, 'maternal great-grandfather', 'maternal', 3],
    ['mgaunt', 3, 'maternal great-aunt', 'maternal', 2],
    ['gniece', 3, 'great-niece', 'both', -2],
    ['ggkid', 3, 'great-grandchild', 'none', -3],
    ['hniece', 3, 'half-niece', 'maternal', -1], // the mirror of a half-aunt, not a generic 'relative (3rd degree)'
  ])('%s is degree %i: %s (%s side)', (toId, degree, label, side, generationDelta) => {
    expect(relationshipTo(family, 'me', toId)).toEqual({
      degree,
      label,
      side,
      generationDelta,
      bloodline: true,
      consanguinity: false,
    });
  });
});

describe('relationshipTo: beyond third degree and non-blood relatives', () => {
  it.each<[string, string, boolean, number]>([
    ['cousin2', 'distant blood relative', true, 0], // second cousin
    ['c1r', 'distant blood relative', true, 0], // first cousin once removed
    ['hcousin', 'distant blood relative', true, 0], // half first cousin
    ['stepdad', 'step-parent', false, 1],
    ['adoptedkid', 'adopted child', false, -1],
    ['spouse', 'partner', false, 0],
    ['stranger', 'not a blood relative', false, 0],
    ['nobody', 'not a blood relative', false, 0], // id not in the tree
  ])('%s has no degree: %s', (toId, label, bloodline, generationDelta) => {
    expect(relationshipTo(family, 'me', toId)).toEqual({
      degree: null,
      label,
      side: 'none',
      generationDelta,
      bloodline,
      consanguinity: false,
    });
  });

  it('describes a person relative to themselves as self, with no degree', () => {
    expect(relationshipTo(family, 'me', 'me')).toMatchObject({ degree: null, label: 'self' });
  });
});

describe('relationshipTo: direction', () => {
  it.each<[string, string, Degree, string, Side]>([
    ['mom', 'me', 1, 'daughter', 'none'],
    ['kid', 'me', 1, 'mother', 'maternal'],
    ['maunt', 'me', 2, 'niece', 'both'],
    ['cousin', 'me', 3, 'maternal first cousin', 'maternal'],
    ['mgm', 'me', 2, 'granddaughter', 'none'],
    ['hsis', 'me', 2, 'half-sister', 'maternal'],
  ])('from %s, %s is degree %i: %s', (fromId, toId, degree, label, side) => {
    expect(relationshipTo(family, fromId, toId)).toMatchObject({
      degree,
      label,
      side,
      bloodline: true,
    });
  });

  it('does not make former partners blood relatives, whatever children they share', () => {
    expect(relationshipTo(family, 'mom', 'hd')).toMatchObject({
      degree: null,
      label: 'former partner',
      bloodline: false,
    });
  });
});

describe('relationshipTo: the sample pedigree', () => {
  const sample = createSamplePedigree();
  it.each<[string, Degree, string, Side]>([
    ['sister', 1, 'sister', 'both'],
    ['mother', 1, 'mother', 'maternal'],
    ['father', 1, 'father', 'paternal'],
    ['mgm', 2, 'maternal grandmother', 'maternal'],
    ['mgf', 2, 'maternal grandfather', 'maternal'],
    ['maunt', 2, 'maternal aunt', 'maternal'],
    ['puncle', 2, 'paternal uncle', 'paternal'],
    ['pgm', 2, 'paternal grandmother', 'paternal'],
    ['pgf', 2, 'paternal grandfather', 'paternal'],
  ])('%s is degree %i: %s', (toId, degree, label, side) => {
    expect(relationshipTo(sample, 'proband', toId)).toMatchObject({ degree, label, side });
  });

  it('lists all nine relatives, first degree before second, then by label', () => {
    expect(relativesOf(sample, 'proband', 3).map((relative) => relative.personId)).toEqual([
      'father',
      'mother',
      'sister',
      'maunt',
      'mgf',
      'mgm',
      'pgf',
      'pgm',
      'puncle',
    ]);
  });
});

describe('relationshipTo: adoption, step links and unusual families', () => {
  it('counts an adopted-out sibling as a full sibling when the biological links are recorded', () => {
    const ped = buildPedigree({
      people: 'me:f mom:f dad:m sib:m amom:f adad:m',
      bio: 'me<mom+dad sib<mom+dad',
      adoptive: 'sib<amom+adad',
    });
    expect(relationshipTo(ped, 'me', 'sib')).toMatchObject({
      degree: 1,
      label: 'brother',
      bloodline: true,
    });
    expect(relationshipTo(ped, 'sib', 'amom')).toMatchObject({
      degree: null,
      label: 'adoptive parent',
      bloodline: false,
    });
  });

  it('does not treat an adopted-in sibling as a blood relative', () => {
    const ped = buildPedigree({
      people: 'me:f mom:f dad:m asib:f',
      bio: 'me<mom+dad',
      adoptive: 'asib<mom+dad',
    });
    expect(relationshipTo(ped, 'me', 'asib')).toMatchObject({ degree: null, bloodline: false });
    expect(relativesOf(ped, 'me').map((relative) => relative.personId)).toEqual(['dad', 'mom']);
  });

  it('treats twins as full siblings', () => {
    const ped = buildPedigree({
      people: 'me:f twin:f mom:f dad:m',
      details: { me: { birthYear: 1990 }, twin: { birthYear: 1990 } },
      bio: 'me<mom+dad twin<mom+dad',
    });
    expect(relationshipTo(ped, 'me', 'twin')).toMatchObject({ degree: 1, label: 'sister' });
  });

  it('handles same-sex partners: one biological mother, one adoptive', () => {
    const ped = buildPedigree({
      people: 'me:f mama:f mum:f',
      bio: 'me<mama',
      adoptive: 'me<mum',
      partners: 'mama+mum',
    });
    expect(relationshipTo(ped, 'me', 'mama')).toMatchObject({ degree: 1, label: 'mother' });
    expect(relationshipTo(ped, 'me', 'mum')).toMatchObject({
      degree: null,
      label: 'adoptive parent',
      bloodline: false,
    });
    expect(relationshipTo(ped, 'mama', 'mum')).toMatchObject({ label: 'partner', bloodline: false });
  });

  it('handles a person with two partners: children of each are half-siblings', () => {
    const ped = buildPedigree({
      people: 'dad:m first:f second:f a:f b:m',
      proband: 'a',
      bio: 'a<dad+first b<dad+second',
      partners: 'dad+second',
      formerPartners: 'dad+first',
    });
    expect(relationshipTo(ped, 'a', 'b')).toMatchObject({
      degree: 2,
      label: 'half-brother',
      side: 'paternal',
    });
    expect(relationshipTo(ped, 'dad', 'first').label).toBe('former partner');
    expect(relationshipTo(ped, 'dad', 'second').label).toBe('partner');
  });

  it('labels a parent of unknown sex as parent, with no side', () => {
    const ped = buildPedigree({ people: 'me:f p:u gp:f', bio: 'me<p p<gp' });
    expect(relationshipTo(ped, 'me', 'p')).toMatchObject({ degree: 1, label: 'parent', side: 'none' });
    expect(relationshipTo(ped, 'me', 'gp')).toMatchObject({
      degree: 2,
      label: 'grandmother',
      side: 'none',
    });
  });

  it('finds no relatives for a person with unknown parents or a proband alone', () => {
    const alone = buildPedigree({ people: 'me:f' });
    expect(relativesOf(alone, 'me')).toEqual([]);
    const unlinked = buildPedigree({ people: 'me:f other:m' });
    expect(relationshipTo(unlinked, 'me', 'other')).toMatchObject({ degree: null, bloodline: false });
    expect(relativesOf(unlinked, 'me')).toEqual([]);
  });

  it('terminates on a cycle in the data instead of looping', () => {
    const ped = buildPedigree({ people: 'a:f b:f', bio: 'a<b b<a' });
    expect(relationshipTo(ped, 'a', 'b').degree).toBe(1);
  });
});

describe('relationshipTo: consanguinity', () => {
  // g1 and g2 are the shared grandparents; their children a and b are the
  // parents of f and m, who are first cousins and the parents of p.
  const cousins = buildPedigree({
    people: 'p:f m:f f:m a:m ax:f b:f bx:m g1:f g2:m',
    bio: 'p<m+f f<a+ax m<b+bx a<g1+g2 b<g1+g2',
    partners: 'm+f',
  });

  it('relates the two parents to each other through the shared grandparents', () => {
    expect(relationshipTo(cousins, 'm', 'f')).toMatchObject({
      degree: 3,
      label: 'maternal first cousin',
      bloodline: true,
    });
  });

  it('flags consanguinity when two distinct lines reach the same ancestor at the closest degree', () => {
    expect(relationshipTo(cousins, 'p', 'g1')).toEqual({
      degree: 3,
      label: 'great-grandmother',
      side: 'both',
      generationDelta: 3,
      bloodline: true,
      consanguinity: true,
    });
  });

  it('takes the lowest degree when a relative is reachable two ways', () => {
    // f is p's father (degree 1) and also p's mother's first cousin (degree 4).
    expect(relationshipTo(cousins, 'p', 'f')).toMatchObject({
      degree: 1,
      label: 'father',
      consanguinity: false,
    });
    // a is p's grandfather (degree 2) and also p's great-uncle (degree 3).
    expect(relationshipTo(cousins, 'p', 'a')).toMatchObject({
      degree: 2,
      label: 'paternal grandfather',
      consanguinity: false,
    });
  });

  it('flags double first cousins, who are related through both sides', () => {
    const ped = buildPedigree({
      people: 'x:f y:m xm:f xf:m ym:f yf:m s1:f s2:m t1:f t2:m',
      // xf and yf are brothers (parents s1+s2); xm and ym are sisters (parents t1+t2).
      bio: 'x<xm+xf y<ym+yf xf<s1+s2 yf<s1+s2 xm<t1+t2 ym<t1+t2',
    });
    expect(relationshipTo(ped, 'x', 'y')).toMatchObject({
      degree: 3,
      label: 'first cousin',
      side: 'both',
      consanguinity: true,
    });
  });
});

describe('relativesOf', () => {
  it('returns only first-degree relatives when asked, sorted by label', () => {
    expect(relativesOf(family, 'me', 1).map((relative) => relative.personId)).toEqual([
      'bro',
      'dad',
      'mom',
      'sis',
      'kid',
    ]);
  });

  it('never includes the proband, non-blood relatives or anyone beyond the maximum degree', () => {
    const ids = relativesOf(family, 'me', 3).map((relative) => relative.personId);
    for (const excluded of ['me', 'stepdad', 'adoptedkid', 'spouse', 'cousin2', 'c1r', 'hcousin']) {
      expect(ids).not.toContain(excluded);
    }
    expect(ids).toHaveLength(23);
  });

  it('handles a 300-person pedigree in under 200 ms', () => {
    const large = generatePedigree(300);
    expect(Object.keys(large.persons)).toHaveLength(300);
    // A duration measurement only; no test reads the date.
    const start = performance.now();
    const relatives = relativesOf(large, large.probandId, 3);
    const elapsed = performance.now() - start;
    expect(relatives.length).toBeGreaterThan(20);
    expect(elapsed).toBeLessThan(200);
  });
});

describe('ageOf', () => {
  const base: Person = { id: 'a', sex: 'female', deceased: false, conditions: [] };
  it.each<[string, Partial<Person>, number | undefined, number | null]>([
    ['uses the stated age first', { ageNow: 40, birthYear: 1950 }, 2020, 40],
    ['derives age from birth year and the reference year', { birthYear: 1980 }, 2020, 40],
    ['is unknown with a birth year but no reference year', { birthYear: 1980 }, undefined, null],
    ['uses age at death for someone who has died', { deceased: true, ageAtDeath: 71 }, 2020, 71],
    [
      'does not age a deceased person from their birth year',
      { deceased: true, birthYear: 1900, ageAtDeath: 60 },
      2020,
      60,
    ],
    ['is unknown for a deceased person with no age at death', { deceased: true }, 2020, null],
    ['is unknown when nothing is recorded', {}, 2020, null],
  ])('%s', (_name, fields, referenceYear, expected) => {
    expect(ageOf({ ...base, ...fields }, referenceYear)).toBe(expected);
  });
});
