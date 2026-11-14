import { z } from 'zod';
import {
  CONDITION_CODES,
  CONDITION_DOMAINS,
  CONFIRMATIONS,
  LATERALITIES,
  LIMITS,
  PARENT_LINK_KINDS,
  PARTNERSHIP_STATUSES,
  SEXES,
} from './types';
import type { Condition, ParentLink, Partnership, Pedigree, Person } from './types';

// z.object() strips unknown keys, which is what loading stored data needs.
// exactOptional() keeps "absent" and "undefined" distinct, matching the
// hand-written interfaces under exactOptionalPropertyTypes.

/** Ids are plain tokens, so they can never be `__proto__` or carry markup. */
export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
  .max(LIMITS.maxIdLength);

const ageSchema = z.int().min(0).max(LIMITS.maxAge);
const birthYearSchema = z.int().min(1800).max(2200);

export const conditionSchema = z.object({
  id: idSchema,
  code: z.enum(CONDITION_CODES),
  domain: z.enum(CONDITION_DOMAINS),
  ageAtOnset: ageSchema.exactOptional(),
  ageUnknown: z.boolean(),
  subtype: z.string().max(LIMITS.maxSubtypeLength).exactOptional(),
  laterality: z.enum(LATERALITIES).exactOptional(),
  confirmed: z.enum(CONFIRMATIONS),
});

export const personSchema = z.object({
  id: idSchema,
  displayName: z.string().max(LIMITS.maxNameLength).exactOptional(),
  sex: z.enum(SEXES),
  birthYear: birthYearSchema.exactOptional(),
  ageNow: ageSchema.exactOptional(),
  deceased: z.boolean(),
  ageAtDeath: ageSchema.exactOptional(),
  conditions: z.array(conditionSchema).max(LIMITS.maxConditionsPerPerson),
  notes: z.string().max(LIMITS.maxNotesLength).exactOptional(),
  vitalStatusUnknown: z.boolean().exactOptional(),
  healthHistoryUnknown: z.boolean().exactOptional(),
});

export const parentLinkSchema = z.object({
  childId: idSchema,
  parentId: idSchema,
  kind: z.enum(PARENT_LINK_KINDS),
});

export const partnershipSchema = z.object({
  id: idSchema,
  aId: idSchema,
  bId: idSchema,
  status: z.enum(PARTNERSHIP_STATUSES),
});

export const pedigreeSchema = z.object({
  version: z.int().min(1),
  persons: z.record(idSchema, personSchema),
  parentLinks: z.array(parentLinkSchema).max(LIMITS.maxParentLinks),
  partnerships: z.array(partnershipSchema).max(LIMITS.maxPartnerships),
  probandId: idSchema,
});

// Compile-time proof that each schema produces exactly the hand-written type.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const schemaMatchesTypes: [
  Same<z.infer<typeof conditionSchema>, Condition>,
  Same<z.infer<typeof personSchema>, Person>,
  Same<z.infer<typeof parentLinkSchema>, ParentLink>,
  Same<z.infer<typeof partnershipSchema>, Partnership>,
  Same<z.infer<typeof pedigreeSchema>, Pedigree>,
] = [true, true, true, true, true];
