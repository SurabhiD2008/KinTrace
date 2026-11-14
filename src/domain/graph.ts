import type { ParentLinkKind, Pedigree, PersonId } from './types';

/** Lookup tables over a pedigree's links. Build once per pedigree, reuse per query. */
export interface PedigreeIndex {
  /** Biological parents of each child. */
  bioParents: Map<PersonId, PersonId[]>;
  /** Biological children of each parent. */
  bioChildren: Map<PersonId, PersonId[]>;
}

function push(map: Map<PersonId, PersonId[]>, key: PersonId, value: PersonId): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildIndex(ped: Pedigree): PedigreeIndex {
  const bioParents = new Map<PersonId, PersonId[]>();
  const bioChildren = new Map<PersonId, PersonId[]>();
  for (const link of ped.parentLinks) {
    if (link.kind !== 'biological') continue;
    push(bioParents, link.childId, link.parentId);
    push(bioChildren, link.parentId, link.childId);
  }
  return { bioParents, bioChildren };
}

export function parentIdsOf(ped: Pedigree, childId: PersonId, kind?: ParentLinkKind): PersonId[] {
  return ped.parentLinks
    .filter((link) => link.childId === childId && (kind === undefined || link.kind === kind))
    .map((link) => link.parentId);
}

/**
 * Everyone reachable upward from `startId` through the given parent lookup.
 * Does not include `startId` unless a cycle leads back to it. Safe on cycles.
 */
export function ancestorsOf(parents: Map<PersonId, PersonId[]>, startId: PersonId): Set<PersonId> {
  const seen = new Set<PersonId>();
  const queue = [...(parents.get(startId) ?? [])];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    if (seen.has(next)) continue;
    seen.add(next);
    queue.push(...(parents.get(next) ?? []));
  }
  return seen;
}

/** People connected to `startId` through any parent link or partnership, including `startId`. */
export function connectedTo(ped: Pedigree, startId: PersonId): Set<PersonId> {
  const neighbours = new Map<PersonId, PersonId[]>();
  for (const link of ped.parentLinks) {
    push(neighbours, link.childId, link.parentId);
    push(neighbours, link.parentId, link.childId);
  }
  for (const pair of ped.partnerships) {
    push(neighbours, pair.aId, pair.bId);
    push(neighbours, pair.bId, pair.aId);
  }
  const seen = new Set<PersonId>([startId]);
  const queue = [startId];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    for (const other of neighbours.get(next) ?? []) {
      if (seen.has(other)) continue;
      seen.add(other);
      queue.push(other);
    }
  }
  return seen;
}
