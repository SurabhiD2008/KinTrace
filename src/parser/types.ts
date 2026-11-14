import { z } from '../zod.js';
import { CONDITION_CODES, CONFIRMATIONS, LIMITS, SEXES } from '../domain/types.js';

// The one contract shared by the offline parser, the serverless AI parser,
// the resolver and the Quick add UI. Every entry is a proposal: nothing here
// changes the family tree until the user accepts it.

/** Longest text either parser accepts. */
export const MAX_INPUT_LENGTH = 2000;

/** Most entries, and most unparsed pieces, one parse result may carry. */
export const MAX_PARSE_ITEMS = 100;

/** Closed list: anything else is refused by the schema. */
export const RELATION_KEYS = [
  'mother',
  'father',
  'sister',
  'brother',
  'half_sister',
  'half_brother',
  'daughter',
  'son',
  'maternal_grandmother',
  'maternal_grandfather',
  'paternal_grandmother',
  'paternal_grandfather',
  'aunt',
  'uncle',
  'niece',
  'nephew',
  'cousin',
  'grandchild',
  'partner',
  'self',
] as const;
export type RelationKey = (typeof RELATION_KEYS)[number];

export const SIDES = ['maternal', 'paternal'] as const;
export type FamilySide = (typeof SIDES)[number];

/**
 * What the user must choose before an entry can be added.
 * - condition: `conditions[0].code` is a stand-in; the chosen option (a
 *   condition code) replaces it, keeping its age and certainty.
 * - relation: the chosen option (a relation key) replaces `relation`.
 * - side: the chosen option ('maternal' or 'paternal') replaces `side`; for
 *   a grandparent it also picks the maternal or paternal relation key.
 */
export const AMBIGUITY_KINDS = ['condition', 'relation', 'side'] as const;
export type AmbiguityKind = (typeof AMBIGUITY_KINDS)[number];

/** Why a piece of text was not turned into a suggestion. Shown through t(). */
export const UNPARSED_REASONS = [
  'step_relative',
  'instruction',
  'language',
  'no_person',
  'no_condition_type',
  'relation_unclear',
  'nothing_found',
  'too_long',
] as const;
export type UnparsedReason = (typeof UNPARSED_REASONS)[number];

const age = z.int().min(0).max(LIMITS.maxAge);

/** The values each kind of ambiguity may offer. */
const OPTION_VALUES: Record<AmbiguityKind, ReadonlySet<string>> = {
  condition: new Set(CONDITION_CODES),
  relation: new Set(RELATION_KEYS),
  side: new Set(SIDES),
};

export const proposedConditionSchema = z
  .object({
    code: z.enum(CONDITION_CODES),
    ageAtOnset: age.exactOptional(),
    /** The text gave only a fuzzy age ("in her forties"); ageNote keeps the words. */
    ageUnknown: z.boolean(),
    ageNote: z.string().min(1).max(60).exactOptional(),
    subtype: z.string().min(1).max(LIMITS.maxSubtypeLength).exactOptional(),
    certainty: z.enum(CONFIRMATIONS),
  })
  .strict()
  .refine((c) => !(c.ageUnknown && c.ageAtOnset !== undefined), {
    message: 'An age at onset cannot be given together with "age unknown".',
  });
export type ProposedCondition = z.infer<typeof proposedConditionSchema>;

export const sourceSpanSchema = z
  .object({ start: z.int().min(0), end: z.int().min(0) })
  .strict()
  .refine((span) => span.end >= span.start, { message: 'A span cannot end before it starts.' });
export type SourceSpan = z.infer<typeof sourceSpanSchema>;

export const proposedEntrySchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
    relation: z.enum(RELATION_KEYS),
    side: z.enum(SIDES).exactOptional(),
    sex: z.enum(SEXES).exactOptional(),
    displayName: z.string().min(1).max(LIMITS.maxNameLength).exactOptional(),
    conditions: z.array(proposedConditionSchema).max(20),
    deceased: z.boolean().exactOptional(),
    ageAtDeath: age.exactOptional(),
    sourceSpan: sourceSpanSchema,
    ambiguity: z
      .object({
        kind: z.enum(AMBIGUITY_KINDS),
        options: z.array(z.string().min(1).max(40)).min(2).max(6),
      })
      .strict()
      // Each option is a value the resolver will apply, so it must be one it knows.
      .refine((ambiguity) => ambiguity.options.every((option) => OPTION_VALUES[ambiguity.kind].has(option)), {
        message: 'An ambiguity option is not a known value for its kind.',
      })
      .exactOptional(),
  })
  .strict();
export type ProposedEntry = z.infer<typeof proposedEntrySchema>;

export const unparsedSchema = z
  .object({ text: z.string().max(MAX_INPUT_LENGTH), reason: z.enum(UNPARSED_REASONS) })
  .strict();
export type Unparsed = z.infer<typeof unparsedSchema>;

export const PARSE_ENGINES = ['offline', 'ai'] as const;
export type ParseEngine = (typeof PARSE_ENGINES)[number];

export const parseResultSchema = z
  .object({
    entries: z.array(proposedEntrySchema).max(MAX_PARSE_ITEMS),
    unparsed: z.array(unparsedSchema).max(MAX_PARSE_ITEMS),
    engine: z.enum(PARSE_ENGINES),
  })
  .strict();
export type ParseResult = z.infer<typeof parseResultSchema>;

// The serverless function never sends the user's text back. Unparsed pieces
// travel as character spans; the browser cuts the words out of its own copy.

export const aiRequestSchema = z
  .object({
    text: z.string().min(1).max(MAX_INPUT_LENGTH),
    locale: z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).max(20),
  })
  .strict();
export type AiRequest = z.infer<typeof aiRequestSchema>;

export const aiResponseSchema = z
  .object({
    entries: z.array(proposedEntrySchema).max(MAX_PARSE_ITEMS),
    unparsed: z
      .array(z.object({ span: sourceSpanSchema, reason: z.enum(UNPARSED_REASONS) }).strict())
      .max(MAX_PARSE_ITEMS),
    engine: z.literal('ai'),
  })
  .strict();
export type AiResponse = z.infer<typeof aiResponseSchema>;

/** One error shape for every refusal the function sends. Generic on purpose. */
export const AI_ERROR_CODES = [
  'bad_request',
  'too_large',
  'rate_limited',
  'unavailable',
  'upstream_error',
  'timeout',
  'method_not_allowed',
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];
