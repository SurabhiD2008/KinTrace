// 500 generated families per property take longer than the 5-second default.
vi.setConfig({ testTimeout: 120_000 });
import fc from 'fast-check';
import { relationshipTo, relativesOf } from '../../../src/domain';
import { t } from '../../../src/i18n';
import { en } from '../../../src/i18n/en';
import type { MessageKey } from '../../../src/i18n';
import { fcOptions, pedigreeArb, pedigreeWithPairArb } from '../generators';

// Properties of the relationship engine over generated pedigrees.

const KINDS = [
  'parent', 'grandparent', 'greatGrandparent', 'child', 'grandchild', 'greatGrandchild',
  'sibling', 'halfSibling', 'auntUncle', 'halfAuntUncle', 'nibling', 'halfNibling',
  'cousin', 'greatAuntUncle', 'greatNibling',
] as const;
type Kind = (typeof KINDS)[number] | 'fallback';

const INVERSE: Record<Kind, Kind> = {
  parent: 'child', child: 'parent',
  grandparent: 'grandchild', grandchild: 'grandparent',
  greatGrandparent: 'greatGrandchild', greatGrandchild: 'greatGrandparent',
  sibling: 'sibling', halfSibling: 'halfSibling', cousin: 'cousin',
  auntUncle: 'nibling', nibling: 'auntUncle',
  halfAuntUncle: 'halfNibling', halfNibling: 'halfAuntUncle',
  greatAuntUncle: 'greatNibling', greatNibling: 'greatAuntUncle',
  fallback: 'fallback',
};

const LABEL_KIND = new Map<string, Kind>();
for (const kind of KINDS) {
  for (const sex of ['f', 'm', 'x']) {
    const key = `rel.${kind}.${sex}` as MessageKey;
    if (key in en) LABEL_KIND.set(t(key), kind);
  }
}

function kindOfLabel(label: string): Kind | undefined {
  if (/^relative \((1st|2nd|3rd) degree\)$/.test(label)) return 'fallback';
  const bare = label.replace(/^(maternal|paternal) /, '');
  return LABEL_KIND.get(bare);
}

describe('relationshipTo', () => {
  it('degree, bloodline and consanguinity are symmetric', () => {
    fc.assert(
      fc.property(pedigreeWithPairArb, ({ ped, a, b }) => {
        const ab = relationshipTo(ped, a, b);
        const ba = relationshipTo(ped, b, a);
        expect(ab.degree).toBe(ba.degree);
        expect(ab.bloodline).toBe(ba.bloodline);
        expect(ab.consanguinity).toBe(ba.consanguinity);
      }),
      fcOptions,
    );
  });

  it('labels are inverses (mother <-> daughter or son) and generations mirror, when there is one closest line', () => {
    fc.assert(
      fc.property(pedigreeWithPairArb, ({ ped, a, b }) => {
        const ab = relationshipTo(ped, a, b);
        const ba = relationshipTo(ped, b, a);
        if (a === b || ab.degree === null || ab.consanguinity) return;
        const kindAb = kindOfLabel(ab.label);
        const kindBa = kindOfLabel(ba.label);
        expect(kindAb, ab.label).toBeDefined();
        expect(kindBa, ba.label).toBeDefined();
        expect(INVERSE[kindAb as Kind]).toBe(kindBa);
        expect(ab.generationDelta + ba.generationDelta).toBe(0);
      }),
      fcOptions,
    );
  });

  it('a label names the sex of the person it describes', () => {
    fc.assert(
      fc.property(pedigreeWithPairArb, ({ ped, a, b }) => {
        const rel = relationshipTo(ped, a, b);
        const kind = kindOfLabel(rel.label);
        if (kind === undefined || kind === 'fallback' || kind === 'cousin') return;
        const sex = ped.persons[b]?.sex;
        const key = `rel.${kind}.${sex === 'female' ? 'f' : sex === 'male' ? 'm' : 'x'}` as MessageKey;
        expect(rel.label.endsWith(t(key))).toBe(true);
      }),
      fcOptions,
    );
  });
});

describe('relativesOf', () => {
  it('lists only existing people, never the proband, never beyond third degree, each once', () => {
    fc.assert(
      fc.property(pedigreeArb, (ped) => {
        const relatives = relativesOf(ped, ped.probandId, 3);
        const ids = relatives.map((r) => r.personId);
        expect(new Set(ids).size).toBe(ids.length);
        for (const { personId, relationship } of relatives) {
          expect(Object.hasOwn(ped.persons, personId)).toBe(true);
          expect(personId).not.toBe(ped.probandId);
          expect(relationship.degree).not.toBeNull();
          expect(relationship.degree).toBeLessThanOrEqual(3);
          expect(relationship.bloodline).toBe(true);
        }
      }),
      fcOptions,
    );
  });

  it('agrees with relationshipTo for every person in the tree', () => {
    fc.assert(
      fc.property(pedigreeArb, (ped) => {
        const listed = new Map(relativesOf(ped, ped.probandId, 3).map((r) => [r.personId, r.relationship]));
        for (const id of Object.keys(ped.persons)) {
          if (id === ped.probandId) continue;
          const rel = relationshipTo(ped, ped.probandId, id);
          if (rel.degree === null) expect(listed.has(id)).toBe(false);
          else expect(listed.get(id)).toEqual(rel);
        }
      }),
      { ...fcOptions, numRuns: 200 },
    );
  });
});
