import { relationshipTo } from '../../domain';
import type { ParentLinkKind, Pedigree, PersonId } from '../../domain';

// Pure geometry for the family tree drawing. No React, no DOM.
//
// How it works:
// 1. People joined by a partnership or by sharing a child form a "group"
//    that must sit on one generation row.
// 2. Groups are layered so every parent group is above its child groups,
//    then pulled down to sit directly above their nearest children.
// 3. Each row is ordered by walking the tree from the top, family by family.
// 4. x positions start evenly spaced and are nudged so parents sit over
//    their children, always keeping the row order and a minimum gap, which
//    is what guarantees that no two symbols overlap.

export const NODE_SIZE = 48;
export const H_SPACING = 164;
export const V_SPACING = 176;

export interface LayoutNode {
  id: PersonId;
  /** Centre of the symbol. */
  x: number;
  y: number;
  /** 0 for the proband, negative for ancestors, positive for descendants. */
  generation: number;
  /** Not linked to the proband's tree; parked in the spare row at the bottom. */
  spare: boolean;
}

export interface LayoutCouple {
  id: string;
  aId: PersonId;
  bId: PersonId;
  /** Centre points of the two partners, left one first. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 'coparents' joins two people who share a child but have no recorded partnership. */
  status: 'current' | 'former' | 'coparents';
  /** The two are blood relatives of each other: drawn as a double line. */
  consanguineous: boolean;
  /** Nobody stands between them on the row. */
  adjacent: boolean;
}

export interface LayoutDescent {
  id: string;
  parentIds: PersonId[];
  kind: ParentLinkKind;
  /** Where the line leaves the parents: the midpoint of the couple line, or under a lone parent. */
  origin: { x: number; y: number };
  /** Height of the horizontal sibling bar. */
  barY: number;
  /** Top centre of each child's symbol. */
  children: { id: PersonId; x: number; y: number }[];
}

export interface LayoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface PedigreeLayout {
  nodes: LayoutNode[];
  couples: LayoutCouple[];
  descents: LayoutDescent[];
  bounds: LayoutBounds;
}

interface Unit {
  key: string;
  kind: ParentLinkKind;
  parentIds: PersonId[];
  childIds: PersonId[];
}

const RELAX_PASSES = 6;
const HALF = NODE_SIZE / 2;

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function centreOf(ids: readonly PersonId[], x: ReadonlyMap<PersonId, number>): number | null {
  const xs = ids.map((id) => x.get(id)).filter((value) => value !== undefined);
  return xs.length === 0 ? null : (Math.min(...xs) + Math.max(...xs)) / 2;
}

/** Layers groups so each is below all of its parent groups; null if the links form a cycle. */
function layer(
  groups: readonly string[],
  edges: ReadonlyMap<string, Set<string>>,
): Map<string, number> | null {
  const indegree = new Map(groups.map((group) => [group, 0]));
  for (const children of edges.values()) {
    for (const child of children) indegree.set(child, (indegree.get(child) ?? 0) + 1);
  }
  const level = new Map<string, number>();
  const ready = groups.filter((group) => indegree.get(group) === 0);
  const order: string[] = [];
  for (let group = ready.shift(); group !== undefined; group = ready.shift()) {
    order.push(group);
    const own = level.get(group) ?? 0;
    level.set(group, own);
    for (const child of edges.get(group) ?? []) {
      level.set(child, Math.max(level.get(child) ?? 0, own + 1));
      const left = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, left);
      if (left === 0) ready.push(child);
    }
  }
  if (order.length < groups.length) return null;
  // Pull each group down to sit directly above its nearest child group.
  for (const group of order.reverse()) {
    const childLevels = [...(edges.get(group) ?? [])].map((child) => level.get(child) ?? 0);
    if (childLevels.length > 0) level.set(group, Math.min(...childLevels) - 1);
  }
  return level;
}

export function layoutPedigree(ped: Pedigree): PedigreeLayout {
  const ids = Object.keys(ped.persons);
  const empty: LayoutBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  if (ids.length === 0) return { nodes: [], couples: [], descents: [], bounds: empty };

  const insertion = new Map(ids.map((id, index) => [id, index]));
  const byInsertion = (a: PersonId, b: PersonId) =>
    (insertion.get(a) ?? 0) - (insertion.get(b) ?? 0);
  const known = (id: PersonId) => insertion.has(id);
  const links = ped.parentLinks.filter(
    (link) => known(link.childId) && known(link.parentId) && link.childId !== link.parentId,
  );
  const pairs = ped.partnerships.filter(
    (pair) => known(pair.aId) && known(pair.bId) && pair.aId !== pair.bId,
  );

  // Who is connected to the proband; everyone else goes to the spare row.
  const neighbours = new Map<PersonId, PersonId[]>();
  for (const link of links) {
    pushTo(neighbours, link.childId, link.parentId);
    pushTo(neighbours, link.parentId, link.childId);
  }
  for (const pair of pairs) {
    pushTo(neighbours, pair.aId, pair.bId);
    pushTo(neighbours, pair.bId, pair.aId);
  }
  const rootId = known(ped.probandId) ? ped.probandId : (ids[0] ?? '');
  const main = new Set<PersonId>([rootId]);
  const reach = [rootId];
  for (let id = reach.pop(); id !== undefined; id = reach.pop()) {
    for (const other of neighbours.get(id) ?? []) {
      if (!main.has(other)) {
        main.add(other);
        reach.push(other);
      }
    }
  }
  const mainIds = ids.filter((id) => main.has(id));
  const mainLinks = links.filter((link) => main.has(link.childId));
  const mainPairs = pairs.filter((pair) => main.has(pair.aId));

  // Family units: the children of one set of parents, per kind of link.
  const partnerKeys = new Set(mainPairs.map((pair) => [pair.aId, pair.bId].sort().join('+')));
  const units = new Map<string, Unit>();
  const addToUnit = (kind: ParentLinkKind, parentIds: PersonId[], childId: PersonId) => {
    const sorted = [...parentIds].sort(byInsertion);
    const key = `${kind}:${sorted.join('+')}`;
    const unit = units.get(key) ?? { key, kind, parentIds: sorted, childIds: [] };
    unit.childIds.push(childId);
    units.set(key, unit);
  };
  for (const childId of mainIds) {
    const own = mainLinks.filter((link) => link.childId === childId);
    for (const kind of ['biological', 'adoptive'] as const) {
      const parents = own.filter((link) => link.kind === kind).map((link) => link.parentId);
      if (parents.length > 0) addToUnit(kind, [...new Set(parents)], childId);
    }
    for (const link of own.filter((candidate) => candidate.kind === 'step')) {
      // A step-parent drawn beside the child's parent needs no line of their own.
      const besideParent = own.some(
        (other) =>
          other.parentId !== link.parentId &&
          partnerKeys.has([other.parentId, link.parentId].sort().join('+')),
      );
      if (!besideParent) addToUnit('step', [link.parentId], childId);
    }
  }
  const unitList = [...units.values()];
  const coParents = unitList
    .filter((unit) => unit.kind !== 'step' && unit.parentIds.length === 2)
    .map((unit) => unit.parentIds as [PersonId, PersonId])
    .filter(([a, b]) => !partnerKeys.has([a, b].sort().join('+')));

  // Groups and generations. If partnerships make layering impossible (someone
  // partnered with their own ancestor), fall back to one person per group so
  // that parents still end up above their children.
  const assign = (joined: readonly (readonly [PersonId, PersonId])[]) => {
    const groupOf = new Map(mainIds.map((id) => [id, id]));
    const find = (id: PersonId): PersonId => {
      let current = id;
      let next = groupOf.get(current);
      while (next !== undefined && next !== current) {
        current = next;
        next = groupOf.get(current);
      }
      return current;
    };
    for (const [a, b] of joined) {
      const [ra, rb] = [find(a), find(b)].sort(byInsertion);
      if (ra !== undefined && rb !== undefined && ra !== rb) groupOf.set(rb, ra);
    }
    const group = new Map(mainIds.map((id) => [id, find(id)]));
    const edges = new Map<string, Set<string>>();
    for (const link of mainLinks) {
      const parent = group.get(link.parentId);
      const child = group.get(link.childId);
      if (parent === undefined || child === undefined || parent === child) continue;
      const set = edges.get(parent) ?? new Set<string>();
      set.add(child);
      edges.set(parent, set);
    }
    const groups = [...new Set(group.values())];
    return { group, groups, edges, level: layer(groups, edges) };
  };
  const joined = [...mainPairs.map((pair) => [pair.aId, pair.bId] as const), ...coParents];
  let grouping = assign(joined);
  if (!grouping.level) grouping = assign([]);
  const { group, groups, edges } = grouping;
  const level = grouping.level ?? new Map(groups.map((g) => [g, 0]));
  const probandLevel = level.get(group.get(rootId) ?? '') ?? 0;
  const generationOf = (id: PersonId) => (level.get(group.get(id) ?? '') ?? 0) - probandLevel;

  const membersOf = new Map<string, PersonId[]>();
  for (const id of mainIds) pushTo(membersOf, group.get(id) ?? id, id);
  const partnersOf = new Map<PersonId, PersonId[]>();
  for (const [a, b] of joined) {
    if (group.get(a) !== group.get(b)) continue;
    pushTo(partnersOf, a, b);
    pushTo(partnersOf, b, a);
  }
  const parentsOf = new Map<PersonId, PersonId[]>();
  for (const link of mainLinks) pushTo(parentsOf, link.childId, link.parentId);
  const unitsOfParent = new Map<PersonId, Unit[]>();
  for (const unit of unitList) {
    for (const parentId of unit.parentIds) pushTo(unitsOfParent, parentId, unit);
  }

  const maleFirst = (id: PersonId) => (ped.persons[id]?.sex === 'male' ? 0 : 1);

  /** Members of a group left to right: a person with two partners sits between them. */
  const orderGroup = (groupId: string, entry: PersonId | undefined): PersonId[] => {
    const members = membersOf.get(groupId) ?? [];
    if (members.length <= 1) return members;
    const degree = (id: PersonId) => (partnersOf.get(id) ?? []).length;
    const ends = members.filter((id) => degree(id) === 1);
    const isPath = ends.length === 2 && members.every((id) => degree(id) <= 2);
    const start = isPath ? ends[0] : (entry ?? members[0]);
    const walk: PersonId[] = [];
    const seen = new Set<PersonId>();
    const stack = start === undefined ? [] : [start];
    for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
      if (seen.has(id)) continue;
      seen.add(id);
      walk.push(id);
      stack.push(...(partnersOf.get(id) ?? []).filter((other) => !seen.has(other)).reverse());
    }
    for (const id of members) if (!seen.has(id)) walk.push(id);
    if (!isPath) {
      // Not a simple chain: put the first person between their first two partners.
      const [hub, first, ...rest] = walk;
      return hub !== undefined && first !== undefined && degree(hub) >= 2
        ? [first, hub, ...rest]
        : walk;
    }
    if (entry === undefined) {
      // Pedigree convention: in a couple, the male partner is drawn on the left.
      const [first, last] = [walk[0], walk[walk.length - 1]];
      const swap = first !== undefined && last !== undefined && maleFirst(last) < maleFirst(first);
      return swap ? walk.reverse() : walk;
    }
    // Keep the person we arrived through nearest the left, beside their siblings.
    return walk.indexOf(entry) > (walk.length - 1) / 2 ? walk.reverse() : walk;
  };

  // Row order: walk down from the top of the proband's family, then pull in
  // each in-law family right after the person who married into it.
  const rows = new Map<number, PersonId[]>();
  const visited = new Set<string>();
  const priority: string[] = [];
  const hasParentGroup = new Set([...edges.values()].flatMap((children) => [...children]));
  const topGroupsAbove = (id: PersonId): string[] => {
    const tops: string[] = [];
    const seen = new Set<PersonId>();
    const pending = [id];
    for (let current = pending.shift(); current !== undefined; current = pending.shift()) {
      if (seen.has(current)) continue;
      seen.add(current);
      const parents = parentsOf.get(current) ?? [];
      const own = group.get(current);
      if (parents.length === 0 && own !== undefined && !hasParentGroup.has(own)) tops.push(own);
      // Pedigree convention: the father's family is drawn on the left.
      pending.push(...[...parents].sort((a, b) => maleFirst(a) - maleFirst(b)));
    }
    return tops;
  };
  const marriesIntoUnvisitedFamily = (childId: PersonId): PersonId[] =>
    (membersOf.get(group.get(childId) ?? '') ?? []).filter(
      (member) =>
        member !== childId &&
        (parentsOf.get(member) ?? []).some((parent) => !visited.has(group.get(parent) ?? '')),
    );
  const orderChildren = (unit: Unit): PersonId[] => {
    const children = [...unit.childIds].sort(byInsertion);
    const years = children.map((id) => ped.persons[id]?.birthYear);
    if (years.every((year) => year !== undefined)) {
      return children
        .map((id, index) => ({ id, year: years[index] ?? 0 }))
        .sort((a, b) => a.year - b.year || byInsertion(a.id, b.id))
        .map((entry) => entry.id);
    }
    // Birth order unknown: keep insertion order, but put a child who married
    // into another family in the tree at the edge next to that family.
    const staying = children.filter((id) => marriesIntoUnvisitedFamily(id).length === 0);
    const leaving = children.filter((id) => marriesIntoUnvisitedFamily(id).length > 0);
    return [...staying, ...leaving];
  };
  const visit = (groupId: string, entry?: PersonId): void => {
    if (visited.has(groupId)) return;
    visited.add(groupId);
    const members = orderGroup(groupId, entry);
    for (const member of members) pushTo(rows, generationOf(member), member);
    if (entry !== undefined) {
      for (const inLaw of members.filter((member) => member !== entry)) {
        priority.push(...topGroupsAbove(inLaw).filter((top) => !visited.has(top)));
      }
    }
    const done = new Set<string>();
    for (const member of members) {
      for (const unit of unitsOfParent.get(member) ?? []) {
        if (done.has(unit.key)) continue;
        done.add(unit.key);
        for (const childId of orderChildren(unit)) visit(group.get(childId) ?? childId, childId);
      }
    }
  };
  const roots = groups.filter((g) => !hasParentGroup.has(g));
  const probandTops = topGroupsAbove(rootId);
  const queue = [...probandTops, ...roots.filter((g) => !probandTops.includes(g)), ...groups];
  while (priority.length > 0 || queue.length > 0) {
    const next = priority.shift() ?? queue.shift();
    if (next !== undefined) visit(next);
  }

  // x positions: evenly spaced, then nudged so families line up, keeping order.
  const x = new Map<PersonId, number>();
  for (const row of rows.values()) row.forEach((id, index) => x.set(id, index * H_SPACING));
  const enforce = (row: readonly PersonId[]) => {
    for (let index = 1; index < row.length; index += 1) {
      const id = row[index];
      const before = row[index - 1];
      if (id === undefined || before === undefined) continue;
      x.set(id, Math.max(x.get(id) ?? 0, (x.get(before) ?? 0) + H_SPACING));
    }
  };
  const nudge = (moving: 'parentIds' | 'childIds', towards: 'parentIds' | 'childIds') => {
    const shifts = new Map<PersonId, number[]>();
    for (const unit of unitList) {
      const from = centreOf(unit[moving], x);
      const to = centreOf(unit[towards], x);
      if (from === null || to === null) continue;
      for (const id of unit[moving]) pushTo(shifts, id, to - from);
    }
    for (const [id, list] of shifts) {
      const mean = list.reduce((sum, value) => sum + value, 0) / list.length;
      x.set(id, (x.get(id) ?? 0) + mean);
    }
    for (const row of rows.values()) enforce(row);
  };
  for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
    nudge('childIds', 'parentIds');
    nudge('parentIds', 'childIds');
  }
  const leftmost = Math.min(...mainIds.map((id) => x.get(id) ?? 0));

  // Nodes, with unconnected people parked in a spare row underneath.
  const generations = mainIds.map(generationOf);
  const spareGeneration = Math.max(...generations) + 1;
  const nodes: LayoutNode[] = mainIds.map((id) => ({
    id,
    x: (x.get(id) ?? 0) - leftmost,
    y: generationOf(id) * V_SPACING,
    generation: generationOf(id),
    spare: false,
  }));
  ids
    .filter((id) => !main.has(id))
    .forEach((id, index) => {
      nodes.push({
        id,
        x: index * H_SPACING,
        y: spareGeneration * V_SPACING,
        generation: spareGeneration,
        spare: true,
      });
    });
  const at = new Map(nodes.map((node) => [node.id, node]));

  const couples: LayoutCouple[] = [];
  const addCouple = (id: string, aId: PersonId, bId: PersonId, status: LayoutCouple['status']) => {
    const a = at.get(aId);
    const b = at.get(bId);
    if (!a || !b) return;
    const [left, right] = a.x <= b.x ? [a, b] : [b, a];
    const between = nodes.some(
      (node) => node.y === left.y && right.y === left.y && node.x > left.x && node.x < right.x,
    );
    couples.push({
      id,
      aId: left.id,
      bId: right.id,
      x1: left.x,
      y1: left.y,
      x2: right.x,
      y2: right.y,
      status,
      consanguineous: relationshipTo(ped, aId, bId).bloodline,
      adjacent: !between,
    });
  };
  for (const pair of mainPairs) addCouple(pair.id, pair.aId, pair.bId, pair.status);
  for (const [a, b] of coParents) addCouple(`co-${a}-${b}`, a, b, 'coparents');

  const unitsPerRow = new Map<number, number>();
  const descents: LayoutDescent[] = [];
  for (const unit of unitList) {
    const parents = unit.parentIds.map((id) => at.get(id)).filter((node) => node !== undefined);
    const children = unit.childIds.map((id) => at.get(id)).filter((node) => node !== undefined);
    if (parents.length === 0 || children.length === 0) continue;
    const rowY = Math.max(...parents.map((node) => node.y));
    const xs = parents.map((node) => node.x);
    const childRowY = Math.min(...children.map((node) => node.y));
    const slot = unitsPerRow.get(childRowY) ?? 0;
    unitsPerRow.set(childRowY, slot + 1);
    descents.push({
      id: unit.key,
      parentIds: unit.parentIds,
      kind: unit.kind,
      origin: {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: parents.length === 1 ? rowY + HALF : rowY,
      },
      // The bar sits just above the children, clear of the parents' labels.
      // Neighbouring families get bars at slightly different heights.
      barY: childRowY - HALF - 18 - (slot % 3) * 8,
      children: children.map((node) => ({ id: node.id, x: node.x, y: node.y - HALF })),
    });
  }

  const allX = nodes.map((node) => node.x);
  const allY = nodes.map((node) => node.y);
  const bounds: LayoutBounds = {
    minX: Math.min(...allX) - HALF,
    minY: Math.min(...allY) - HALF,
    maxX: Math.max(...allX) + HALF,
    maxY: Math.max(...allY) + HALF,
    width: Math.max(...allX) - Math.min(...allX) + NODE_SIZE,
    height: Math.max(...allY) - Math.min(...allY) + NODE_SIZE,
  };
  return { nodes, couples, descents, bounds };
}
