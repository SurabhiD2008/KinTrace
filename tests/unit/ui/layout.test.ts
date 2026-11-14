import {
  addChild,
  addParent,
  addPartner,
  addPerson,
  addSibling,
  createPedigree,
  createSamplePedigree,
} from '../../../src/domain';
import type { MutationResult, Pedigree } from '../../../src/domain';
import { H_SPACING, NODE_SIZE, layoutPedigree } from '../../../src/ui/pedigree/layout';
import type { PedigreeLayout } from '../../../src/ui/pedigree/layout';
import { buildPedigree, generatePedigree } from '../../fixtures/pedigrees';

function at(layout: PedigreeLayout, id: string) {
  const node = layout.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`No node ${id}`);
  return node;
}

function rowOrder(layout: PedigreeLayout, generation: number): string[] {
  return layout.nodes
    .filter((node) => node.generation === generation && !node.spare)
    .sort((a, b) => a.x - b.x)
    .map((node) => node.id);
}

/** The three guarantees that must hold for any tree. */
function expectSound(ped: Pedigree, layout: PedigreeLayout) {
  expect(layout.nodes).toHaveLength(Object.keys(ped.persons).length);
  for (const a of layout.nodes) {
    for (const b of layout.nodes) {
      if (a.id >= b.id || a.y !== b.y) continue;
      expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(NODE_SIZE);
    }
  }
  for (const link of ped.parentLinks) {
    expect(at(layout, link.parentId).y).toBeLessThan(at(layout, link.childId).y);
  }
  for (const couple of layout.couples) {
    expect(at(layout, couple.aId).generation).toBe(at(layout, couple.bId).generation);
  }
}

/** Small seeded generator, so the random trees are the same on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPedigree(seed: number): Pedigree {
  const random = seeded(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  let ped = createPedigree({ sex: 'female' });
  const steps = 3 + Math.floor(random() * 22);
  for (let step = 0; step < steps; step += 1) {
    const id = pick(Object.keys(ped.persons));
    const sex = pick(['female', 'male', 'unknown'] as const);
    const partners = ped.partnerships
      .filter((pair) => pair.aId === id || pair.bId === id)
      .map((pair) => (pair.aId === id ? pair.bId : pair.aId));
    const actions: (() => MutationResult)[] = [
      () => addParent(ped, id, { sex }),
      () => addParent(ped, id, { sex }, pick(['adoptive', 'step'] as const)),
      () => addSibling(ped, id, { sex }),
      () => addSibling(ped, id, { sex }, { type: 'half' }),
      () => addPartner(ped, id, { sex }, pick(['current', 'former'] as const)),
      () => addChild(ped, id, { sex }),
      () =>
        addChild(ped, id, { sex }, partners[0] === undefined ? {} : { otherParentId: partners[0] }),
    ];
    const result = pick(actions)();
    if (result.ok) ped = result.pedigree;
  }
  return ped;
}

describe('layoutPedigree: the sample pedigree', () => {
  const sample = createSamplePedigree();
  const layout = layoutPedigree(sample);

  it('is sound', () => expectSound(sample, layout));

  it.each<[string, number]>([
    ['proband', 0],
    ['sister', 0],
    ['mother', -1],
    ['father', -1],
    ['maunt', -1],
    ['puncle', -1],
    ['mgm', -2],
    ['pgf', -2],
  ])('puts %s on generation %i', (id, generation) => {
    expect(at(layout, id).generation).toBe(generation);
  });

  it('keeps each family together, father\'s side on the left: uncle, father | mother, aunt', () => {
    expect(rowOrder(layout, -1)).toEqual(['puncle', 'father', 'mother', 'maunt']);
    expect(rowOrder(layout, -2)).toEqual(['pgf', 'pgm', 'mgf', 'mgm']);
    expect(rowOrder(layout, 0)).toEqual(['proband', 'sister']);
  });

  it('centres the parents over their children and drops the descent line from the couple midpoint', () => {
    const parentsCentre = (at(layout, 'mother').x + at(layout, 'father').x) / 2;
    const childrenCentre = (at(layout, 'proband').x + at(layout, 'sister').x) / 2;
    expect(parentsCentre).toBe(childrenCentre);
    const descent = layout.descents.find((d) => d.parentIds.join('+') === 'mother+father');
    expect(descent?.origin).toEqual({ x: parentsCentre, y: at(layout, 'mother').y });
    expect(descent?.children.map((child) => child.id)).toEqual(['proband', 'sister']);
  });

  it('draws the three partnerships as adjacent, non-consanguineous couples', () => {
    expect(layout.couples).toHaveLength(3);
    for (const couple of layout.couples) {
      expect(couple).toMatchObject({ adjacent: true, consanguineous: false, status: 'current' });
      expect(couple.x2 - couple.x1).toBe(H_SPACING);
    }
  });

  it('reports bounds that contain every symbol', () => {
    for (const node of layout.nodes) {
      expect(node.x - NODE_SIZE / 2).toBeGreaterThanOrEqual(layout.bounds.minX);
      expect(node.x + NODE_SIZE / 2).toBeLessThanOrEqual(layout.bounds.maxX);
      expect(node.y + NODE_SIZE / 2).toBeLessThanOrEqual(layout.bounds.maxY);
    }
    expect(layout.bounds.width).toBe(layout.bounds.maxX - layout.bounds.minX);
  });
});

describe('layoutPedigree: shapes of family', () => {
  it('lays out a single person at the origin', () => {
    const layout = layoutPedigree(createPedigree());
    expect(layout.nodes).toEqual([{ id: 'p1', x: 0, y: 0, generation: 0, spare: false }]);
    expect(layout.couples).toEqual([]);
    expect(layout.descents).toEqual([]);
    expect(layout.bounds).toMatchObject({ width: NODE_SIZE, height: NODE_SIZE });
  });

  it('returns an empty layout for an empty pedigree', () => {
    const emptyPed: Pedigree = { ...createPedigree(), persons: {} };
    expect(layoutPedigree(emptyPed).nodes).toEqual([]);
  });

  it('draws a person with two partners between them', () => {
    const ped = buildPedigree({
      people: 'me:f first:m second:m a:f b:m',
      bio: 'a<me+first b<me+second',
      partners: 'me+second',
      formerPartners: 'me+first',
    });
    const layout = layoutPedigree(ped);
    expectSound(ped, layout);
    const row = rowOrder(layout, 0);
    expect(row.indexOf('me')).toBe(1);
    expect(new Set([row[0], row[2]])).toEqual(new Set(['first', 'second']));
    expect(layout.couples.map((couple) => couple.status).sort()).toEqual(['current', 'former']);
  });

  it('gives half-siblings their own descent line from the right parents', () => {
    const ped = buildPedigree({
      people: 'me:f mom:f dad:m other:m half:m',
      bio: 'me<mom+dad half<mom+other',
      partners: 'mom+dad',
      formerPartners: 'mom+other',
    });
    const layout = layoutPedigree(ped);
    expectSound(ped, layout);
    expect(layout.descents.map((descent) => descent.id).sort()).toEqual([
      'biological:mom+dad',
      'biological:mom+other',
    ]);
    expect(at(layout, 'half').generation).toBe(0);
    expect(rowOrder(layout, -1).indexOf('mom')).toBe(1);
  });

  it('orders siblings by birth year when every one is known, else by insertion', () => {
    const spec = { people: 'me:f mom:f dad:m s1:f s2:m', bio: 'me<mom+dad s1<mom+dad s2<mom+dad' };
    const byYear = layoutPedigree(
      buildPedigree({
        ...spec,
        details: { me: { birthYear: 1990 }, s1: { birthYear: 1985 }, s2: { birthYear: 1995 } },
      }),
    );
    expect(rowOrder(byYear, 0)).toEqual(['s1', 'me', 's2']);
    const byInsertion = layoutPedigree(
      buildPedigree({ ...spec, details: { me: { birthYear: 1990 } } }),
    );
    expect(rowOrder(byInsertion, 0)).toEqual(['me', 's1', 's2']);
  });

  it('joins parents who share a child even without a recorded partnership', () => {
    const ped = buildPedigree({ people: 'me:f mom:f dad:m', bio: 'me<mom+dad' });
    const layout = layoutPedigree(ped);
    // The male partner is drawn on the left.
    expect(layout.couples).toMatchObject([{ status: 'coparents', aId: 'dad', bId: 'mom' }]);
    expect(at(layout, 'mom').generation).toBe(-1);
    expect(at(layout, 'dad').generation).toBe(-1);
  });

  it('marks a partnership between blood relatives as consanguineous', () => {
    const ped = buildPedigree({
      people: 'p:f m:f f:m a:m ax:f b:f bx:m g1:f g2:m',
      bio: 'p<m+f f<a+ax m<b+bx a<g1+g2 b<g1+g2',
      partners: 'm+f a+ax b+bx g1+g2',
    });
    const layout = layoutPedigree(ped);
    expectSound(ped, layout);
    const consanguineous = layout.couples.filter((couple) => couple.consanguineous);
    expect(consanguineous.map((couple) => [couple.aId, couple.bId].sort())).toEqual([['f', 'm']]);
  });

  it('lays out five generations on five rows', () => {
    const ped = buildPedigree({
      people: 'me:f mom:f gm:f ggm:f kid:m gkid:f',
      bio: 'me<mom mom<gm gm<ggm kid<me gkid<kid',
    });
    const layout = layoutPedigree(ped);
    expectSound(ped, layout);
    expect(['ggm', 'gm', 'mom', 'me', 'kid', 'gkid'].map((id) => at(layout, id).generation)).toEqual([
      -3, -2, -1, 0, 1, 2,
    ]);
    // A single line of descent is drawn straight down.
    expect(new Set(layout.nodes.map((node) => node.x)).size).toBe(1);
  });

  it('draws a lone step-parent with a line, and none for one beside the parent', () => {
    const lone = layoutPedigree(buildPedigree({ people: 'me:f mom:f sp:m', bio: 'me<mom', step: 'me<sp' }));
    expect(lone.descents.map((descent) => descent.kind).sort()).toEqual(['biological', 'step']);
    const beside = layoutPedigree(
      buildPedigree({ people: 'me:f mom:f sp:m', bio: 'me<mom', step: 'me<sp', partners: 'mom+sp' }),
    );
    expect(beside.descents.map((descent) => descent.kind)).toEqual(['biological']);
    expect(at(beside, 'sp').generation).toBe(-1);
  });

  it('parks people with no link to the tree in a spare row instead of crashing', () => {
    const base = createSamplePedigree();
    const withLoners = [1, 2].reduce((ped, n) => {
      const result = addPerson(ped, { id: `loner${n}` });
      return result.ok ? result.pedigree : ped;
    }, base);
    const layout = layoutPedigree(withLoners);
    const spare = layout.nodes.filter((node) => node.spare);
    expect(spare.map((node) => node.id)).toEqual(['loner1', 'loner2']);
    expect(spare.every((node) => node.generation === 1)).toBe(true);
    expect(spare[1] && spare[0] ? spare[1].x - spare[0].x : 0).toBe(H_SPACING);
    expectSound(withLoners, layout);
  });

  it('survives data that contains a cycle or a missing proband', () => {
    const cycle = buildPedigree({ people: 'a:f b:f', bio: 'a<b b<a' });
    expect(layoutPedigree(cycle).nodes).toHaveLength(2);
    const noProband: Pedigree = { ...createSamplePedigree(), probandId: 'ghost' };
    expect(layoutPedigree(noProband).nodes).toHaveLength(10);
  });

  it('keeps parents above children when someone is partnered with their own ancestor', () => {
    const ped = buildPedigree({ people: 'gm:f mom:f me:f', bio: 'mom<gm me<mom', partners: 'gm+me' });
    const layout = layoutPedigree(ped);
    expect(at(layout, 'gm').y).toBeLessThan(at(layout, 'mom').y);
    expect(at(layout, 'mom').y).toBeLessThan(at(layout, 'me').y);
  });
});

describe('layoutPedigree: size and random trees', () => {
  it('lays out a 60-person tree soundly in under 50 ms', () => {
    const ped = generatePedigree(60);
    layoutPedigree(ped); // warm-up, so the measurement is not dominated by first-call compilation
    const start = performance.now();
    const layout = layoutPedigree(ped);
    const elapsed = performance.now() - start;
    expectSound(ped, layout);
    expect(elapsed).toBeLessThan(50);
  });

  it('is deterministic: the same pedigree gives the same layout', () => {
    const ped = randomPedigree(7);
    expect(layoutPedigree(ped)).toEqual(layoutPedigree(ped));
  });

  it('keeps all three guarantees over 200 random trees', () => {
    let people = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const ped = randomPedigree(seed);
      people += Object.keys(ped.persons).length;
      expectSound(ped, layoutPedigree(ped));
    }
    // The generator must produce real trees, not 200 single people.
    expect(people).toBeGreaterThan(2000);
  });
});
