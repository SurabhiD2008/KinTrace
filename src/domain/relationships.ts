import { t } from '../i18n';
import type { MessageKey } from '../i18n';
import { ancestorsOf, buildIndex } from './graph';
import type { PedigreeIndex } from './graph';
import type { Pedigree, Person, PersonId, Sex } from './types';

export type Degree = 1 | 2 | 3;
export type Side = 'maternal' | 'paternal' | 'both' | 'none';

export interface Relationship {
  /** Genetic degree of relationship; null beyond third degree or when not blood related. */
  degree: Degree | null;
  label: string;
  /** Which of the first person's biological parents the relationship runs through. */
  side: Side;
  /** Generations the second person is above (+) or below (-) the first. */
  generationDelta: number;
  /** True when the two share at least one biological ancestor, however distant. */
  bloodline: boolean;
  /** True when more than one distinct ancestor path exists at the closest degree. */
  consanguinity: boolean;
}

export interface Relative {
  personId: PersonId;
  relationship: Relationship;
}

/** Third degree needs at most four steps (first cousins: two up, two down). */
const MAX_STEPS = 4;

type Kind =
  | 'parent'
  | 'grandparent'
  | 'greatGrandparent'
  | 'child'
  | 'grandchild'
  | 'greatGrandchild'
  | 'sibling'
  | 'halfSibling'
  | 'auntUncle'
  | 'halfAuntUncle'
  | 'nibling'
  | 'halfNibling'
  | 'cousin'
  | 'greatAuntUncle'
  | 'greatNibling';

const SIDED_KINDS: ReadonlySet<Kind> = new Set<Kind>([
  'grandparent',
  'greatGrandparent',
  'auntUncle',
  'halfAuntUncle',
  'cousin',
  'greatAuntUncle',
]);

/** One way two people are connected through a common ancestor (or ancestor couple). */
interface Connection {
  up: number;
  down: number;
  /** The two lines meet at a couple: both people descend from both partners. */
  viaCouple: boolean;
  degree: number;
  side: Side;
}

/** Every path from `startId` upward, [start, parent, ..., ancestor], up to MAX_STEPS long. */
function upPaths(index: PedigreeIndex, startId: PersonId): PersonId[][] {
  const paths: PersonId[][] = [];
  const walk = (path: PersonId[]) => {
    paths.push(path);
    if (path.length > MAX_STEPS) return;
    const last = path[path.length - 1];
    if (last === undefined) return;
    for (const parentId of index.bioParents.get(last) ?? []) {
      // Skipping repeats keeps the walk finite even if the data contains a cycle.
      if (!path.includes(parentId)) walk([...path, parentId]);
    }
  };
  walk([startId]);
  return paths;
}

function sideOfParent(ped: Pedigree, parentId: PersonId | undefined): Side {
  const sex = parentId === undefined ? undefined : ped.persons[parentId]?.sex;
  if (sex === 'female') return 'maternal';
  if (sex === 'male') return 'paternal';
  return 'none';
}

function sharesBothParents(index: PedigreeIndex, a: PersonId, b: PersonId): boolean {
  const parentsOfB = new Set(index.bioParents.get(b) ?? []);
  const shared = new Set((index.bioParents.get(a) ?? []).filter((id) => parentsOfB.has(id)));
  return shared.size >= 2;
}

function findConnections(
  ped: Pedigree,
  index: PedigreeIndex,
  fromPaths: PersonId[][],
  toId: PersonId,
): Connection[] {
  const toPathsByTop = new Map<PersonId, PersonId[][]>();
  for (const path of upPaths(index, toId)) {
    const top = path[path.length - 1];
    if (top === undefined) continue;
    toPathsByTop.set(top, [...(toPathsByTop.get(top) ?? []), path]);
  }

  const connections = new Map<string, Connection>();
  for (const fromPath of fromPaths) {
    const top = fromPath[fromPath.length - 1];
    if (top === undefined) continue;
    const up = fromPath.length - 1;
    const fromBelow = fromPath.slice(0, up);
    for (const toPath of toPathsByTop.get(top) ?? []) {
      const down = toPath.length - 1;
      if (up + down === 0 || up + down > MAX_STEPS) continue;
      const toBelow = toPath.slice(0, down);
      // If the two lines share someone below the top, they really meet lower down.
      if (fromBelow.some((id) => toBelow.includes(id))) continue;

      const fromChild = fromPath[up - 1];
      const toChild = toPath[down - 1];
      const viaCouple =
        fromChild !== undefined &&
        toChild !== undefined &&
        sharesBothParents(index, fromChild, toChild);
      // A couple is reached once through each partner; both give the same key.
      const key = viaCouple
        ? `${fromBelow.join('>')}|${toBelow.join('>')}`
        : `${fromPath.join('>')}|${toPath.join('>')}`;
      const side: Side =
        up === 0 ? 'none' : viaCouple && up === 1 ? 'both' : sideOfParent(ped, fromPath[1]);
      connections.set(key, { up, down, viaCouple, degree: up + down - (viaCouple ? 1 : 0), side });
    }
  }
  return [...connections.values()];
}

function combineSides(sides: Side[]): Side {
  const maternal = sides.some((side) => side === 'maternal' || side === 'both');
  const paternal = sides.some((side) => side === 'paternal' || side === 'both');
  if (maternal && paternal) return 'both';
  if (maternal) return 'maternal';
  return paternal ? 'paternal' : 'none';
}

function kindOf({ up, down, viaCouple }: Connection): Kind | null {
  if (down === 0) return ([null, 'parent', 'grandparent', 'greatGrandparent'] as const)[up] ?? null;
  if (up === 0) return ([null, 'child', 'grandchild', 'greatGrandchild'] as const)[down] ?? null;
  if (up === 1 && down === 1) return viaCouple ? 'sibling' : 'halfSibling';
  if (up === 2 && down === 1) return viaCouple ? 'auntUncle' : 'halfAuntUncle';
  // The inverse of a half-aunt or half-uncle, so the two labels always mirror each other.
  if (up === 1 && down === 2) return viaCouple ? 'nibling' : 'halfNibling';
  if (!viaCouple) return null;
  if (up === 2 && down === 2) return 'cousin';
  if (up === 3 && down === 1) return 'greatAuntUncle';
  if (up === 1 && down === 3) return 'greatNibling';
  return null;
}

function sexKey(sex: Sex | undefined): 'f' | 'm' | 'x' {
  if (sex === 'female') return 'f';
  return sex === 'male' ? 'm' : 'x';
}

function labelFor(connection: Connection, degree: Degree, side: Side, sex: Sex | undefined): string {
  const kind = kindOf(connection);
  if (kind === null) {
    const ordinal: MessageKey = `ordinal.${degree}`;
    return t('rel.fallback', { ordinal: t(ordinal) });
  }
  const key: MessageKey = `rel.${kind}.${sexKey(sex)}`;
  const label = t(key);
  if (!SIDED_KINDS.has(kind) || (side !== 'maternal' && side !== 'paternal')) return label;
  const sideKey: MessageKey = `rel.side.${side}`;
  return t('rel.sided', { side: t(sideKey), label });
}

/** How two people who share no close blood tie are linked, if at all. */
function unrelated(ped: Pedigree, fromId: PersonId, toId: PersonId, bloodline: boolean): Relationship {
  const base = { degree: null, side: 'none', bloodline, consanguinity: false } as const;
  if (bloodline) return { ...base, label: t('rel.distant'), generationDelta: 0 };
  for (const link of ped.parentLinks) {
    if (link.kind === 'biological') continue;
    if (link.childId === fromId && link.parentId === toId) {
      const key: MessageKey = link.kind === 'step' ? 'rel.stepParent' : 'rel.adoptiveParent';
      return { ...base, label: t(key), generationDelta: 1 };
    }
    if (link.childId === toId && link.parentId === fromId) {
      const key: MessageKey = link.kind === 'step' ? 'rel.stepChild' : 'rel.adoptedChild';
      return { ...base, label: t(key), generationDelta: -1 };
    }
  }
  const pair = ped.partnerships.find(
    (p) => (p.aId === fromId && p.bId === toId) || (p.aId === toId && p.bId === fromId),
  );
  if (pair) {
    const key: MessageKey = pair.status === 'current' ? 'rel.partner' : 'rel.formerPartner';
    return { ...base, label: t(key), generationDelta: 0 };
  }
  return { ...base, label: t('rel.none'), generationDelta: 0 };
}

function relate(
  ped: Pedigree,
  index: PedigreeIndex,
  fromId: PersonId,
  fromPaths: PersonId[][],
  toId: PersonId,
): Relationship {
  if (!Object.hasOwn(ped.persons, fromId) || !Object.hasOwn(ped.persons, toId)) {
    return unrelated(ped, fromId, toId, false);
  }
  if (fromId === toId) {
    return {
      degree: null,
      label: t('rel.self'),
      side: 'none',
      generationDelta: 0,
      bloodline: true,
      consanguinity: false,
    };
  }

  const connections = findConnections(ped, index, fromPaths, toId);
  if (connections.length === 0) {
    const fromLine = ancestorsOf(index.bioParents, fromId).add(fromId);
    const toLine = ancestorsOf(index.bioParents, toId).add(toId);
    const shared = [...fromLine].some((id) => toLine.has(id));
    return unrelated(ped, fromId, toId, shared);
  }

  const closest = Math.min(...connections.map((connection) => connection.degree));
  const best = connections
    .filter((connection) => connection.degree === closest)
    .sort((a, b) => a.up - b.up || a.down - b.down);
  const first = best[0];
  if (first === undefined || (closest !== 1 && closest !== 2 && closest !== 3)) {
    return unrelated(ped, fromId, toId, true);
  }
  const side = combineSides(best.map((connection) => connection.side));
  return {
    degree: closest,
    label: labelFor(first, closest, side, ped.persons[toId]?.sex),
    side,
    generationDelta: first.up - first.down,
    bloodline: true,
    consanguinity: best.length > 1,
  };
}

/**
 * What `toId` is to `fromId` ("to is from's maternal aunt"), using biological
 * links only. Step and adoptive relatives get bloodline false and degree null.
 */
export function relationshipTo(ped: Pedigree, fromId: PersonId, toId: PersonId): Relationship {
  const index = buildIndex(ped);
  return relate(ped, index, fromId, upPaths(index, fromId), toId);
}

/** Blood relatives of the proband up to `maxDegree`, sorted by degree, then label. */
export function relativesOf(
  ped: Pedigree,
  probandId: PersonId,
  maxDegree: Degree = 3,
): Relative[] {
  const index = buildIndex(ped);
  const fromPaths = upPaths(index, probandId);
  const relatives: Relative[] = [];
  for (const personId of Object.keys(ped.persons)) {
    if (personId === probandId) continue;
    const relationship = relate(ped, index, probandId, fromPaths, personId);
    if (relationship.degree !== null && relationship.degree <= maxDegree) {
      relatives.push({ personId, relationship });
    }
  }
  const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return relatives.sort(
    (a, b) =>
      (a.relationship.degree ?? 0) - (b.relationship.degree ?? 0) ||
      compareText(a.relationship.label, b.relationship.label) ||
      compareText(a.personId, b.personId),
  );
}

/**
 * Best-known current age: the stated age, else reference year minus birth
 * year for a living person, else age at death. Null when unknown. The
 * reference year is passed in so nothing here depends on today's date.
 */
export function ageOf(person: Person, referenceYear?: number): number | null {
  if (person.ageNow !== undefined) return person.ageNow;
  if (!person.deceased && person.birthYear !== undefined && referenceYear !== undefined) {
    return referenceYear - person.birthYear;
  }
  return person.ageAtDeath ?? null;
}
