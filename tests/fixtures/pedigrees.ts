import { PEDIGREE_VERSION } from '../../src/domain';
import type {
  ParentLink,
  ParentLinkKind,
  Partnership,
  PartnershipStatus,
  Pedigree,
  Person,
  Sex,
} from '../../src/domain';

const SEX_BY_LETTER: Record<string, Sex> = { f: 'female', m: 'male', i: 'intersex', u: 'unknown' };

export interface PedigreeSpec {
  /** Defaults to the first person listed. */
  proband?: string;
  /** Space-separated `id:sex`, sex being f, m, i or u. Example: `me:f mom:f dad:m`. */
  people: string;
  /** Extra fields per person id. */
  details?: Record<string, Partial<Omit<Person, 'id'>>>;
  /** Space-separated `child<parent` or `child<parent+parent`. */
  bio?: string;
  adoptive?: string;
  step?: string;
  /** Space-separated `a+b`. */
  partners?: string;
  formerPartners?: string;
}

function words(text: string | undefined): string[] {
  return (text ?? '').split(/\s+/).filter((word) => word !== '');
}

function links(text: string | undefined, kind: ParentLinkKind): ParentLink[] {
  return words(text).flatMap((word) => {
    const [childId = '', parents = ''] = word.split('<');
    return parents.split('+').map((parentId) => ({ childId, parentId, kind }));
  });
}

function pairs(text: string | undefined, status: PartnershipStatus): Omit<Partnership, 'id'>[] {
  return words(text).map((word) => {
    const [aId = '', bId = ''] = word.split('+');
    return { aId, bId, status };
  });
}

/** Builds a pedigree directly, without going through the mutations under test. */
export function buildPedigree(spec: PedigreeSpec): Pedigree {
  const persons: Record<string, Person> = {};
  for (const word of words(spec.people)) {
    const [id = '', letter = 'u'] = word.split(':');
    persons[id] = {
      id,
      sex: SEX_BY_LETTER[letter] ?? 'unknown',
      deceased: false,
      conditions: [],
      ...spec.details?.[id],
    };
  }
  const partnerships = [
    ...pairs(spec.partners, 'current'),
    ...pairs(spec.formerPartners, 'former'),
  ].map((pair, index) => ({ id: `u${index + 1}`, ...pair }));
  return {
    version: PEDIGREE_VERSION,
    persons,
    parentLinks: [
      ...links(spec.bio, 'biological'),
      ...links(spec.adoptive, 'adoptive'),
      ...links(spec.step, 'step'),
    ],
    partnerships,
    probandId: spec.proband ?? Object.keys(persons)[0] ?? '',
  };
}

/** Freezes a value all the way down, so any attempt to mutate it throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * A deterministic family of exactly `count` people: every couple has three
 * children and each child gets a partner from outside the family. The
 * proband (`probandId`) sits in the fourth generation, with ancestors,
 * cousins and descendants around them.
 */
export function generatePedigree(count: number): Pedigree {
  const persons: Record<string, Person> = {};
  const parentLinks: ParentLink[] = [];
  const partnerships: Partnership[] = [];
  let made = 0;
  const add = (sex: Sex): string => {
    made += 1;
    const id = `g${made}`;
    persons[id] = { id, sex, deceased: false, conditions: [] };
    return id;
  };
  const couple = (aId: string, bId: string): [string, string] => {
    partnerships.push({ id: `u${partnerships.length + 1}`, aId, bId, status: 'current' });
    return [aId, bId];
  };

  const queue: [string, string][] = [couple(add('female'), add('male'))];
  const childrenByGeneration: string[][] = [];
  let generation = 0;
  while (made < count && queue.length > 0) {
    const batch = queue.splice(0, queue.length);
    const children: string[] = [];
    for (const [motherId, fatherId] of batch) {
      for (let n = 0; n < 3 && made < count; n += 1) {
        const childId = add(n % 2 === 0 ? 'female' : 'male');
        parentLinks.push({ childId, parentId: motherId, kind: 'biological' });
        parentLinks.push({ childId, parentId: fatherId, kind: 'biological' });
        children.push(childId);
        if (made < count) {
          const partnerId = add(n % 2 === 0 ? 'male' : 'female');
          queue.push(n % 2 === 0 ? couple(childId, partnerId) : couple(partnerId, childId));
        }
      }
    }
    childrenByGeneration[generation] = children;
    generation += 1;
  }
  const probandId = childrenByGeneration[2]?.[0] ?? 'g1';
  return { version: PEDIGREE_VERSION, persons, parentLinks, partnerships, probandId };
}
