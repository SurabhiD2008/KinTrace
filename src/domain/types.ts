/** Schema version of a stored pedigree. Bump together with a step in io.ts migrate(). */
export const PEDIGREE_VERSION = 1;

export type PersonId = string;

export const SEXES = ['female', 'male', 'intersex', 'unknown'] as const;
export type Sex = (typeof SEXES)[number];

export const CONDITION_CODES = [
  'breast',
  'ovarian',
  'colorectal',
  'endometrial',
  'small_bowel',
  'ureter',
  'renal_pelvis',
  'prostate',
  'pancreatic',
  'coronary_event',
  'stroke',
  'high_ldl',
  'sudden_cardiac_death',
  'diabetes_type2',
] as const;
export type ConditionCode = (typeof CONDITION_CODES)[number];

export const CONDITION_DOMAINS = ['cancer', 'cardio', 'metabolic'] as const;
export type ConditionDomain = (typeof CONDITION_DOMAINS)[number];

/** The domain each code belongs to. setCondition fills `domain` from this. */
export const DOMAIN_OF_CODE: Readonly<Record<ConditionCode, ConditionDomain>> = {
  breast: 'cancer',
  ovarian: 'cancer',
  colorectal: 'cancer',
  endometrial: 'cancer',
  small_bowel: 'cancer',
  ureter: 'cancer',
  renal_pelvis: 'cancer',
  prostate: 'cancer',
  pancreatic: 'cancer',
  coronary_event: 'cardio',
  stroke: 'cardio',
  sudden_cardiac_death: 'cardio',
  high_ldl: 'metabolic',
  diabetes_type2: 'metabolic',
};

export const LATERALITIES = ['left', 'right', 'bilateral', 'unknown'] as const;
export type Laterality = (typeof LATERALITIES)[number];

export const CONFIRMATIONS = ['confirmed', 'reported', 'unsure'] as const;
export type Confirmation = (typeof CONFIRMATIONS)[number];

export interface Condition {
  id: string;
  code: ConditionCode;
  domain: ConditionDomain;
  ageAtOnset?: number;
  /** The user has said the age at onset is not known. */
  ageUnknown: boolean;
  /** Free detail such as 'bilateral' or 'premature'. */
  subtype?: string;
  laterality?: Laterality;
  confirmed: Confirmation;
}

export interface Person {
  id: PersonId;
  /** Optional; may be a role label such as "Mother" instead of a name. */
  displayName?: string;
  sex: Sex;
  birthYear?: number;
  ageNow?: number;
  deceased: boolean;
  ageAtDeath?: number;
  conditions: Condition[];
  notes?: string;
  /** The user does not know whether this person is alive. `deceased` is then not trusted. */
  vitalStatusUnknown?: boolean;
  /** The user has flagged that this person's health history is not known. */
  healthHistoryUnknown?: boolean;
}

export const PARENT_LINK_KINDS = ['biological', 'adoptive', 'step'] as const;
export type ParentLinkKind = (typeof PARENT_LINK_KINDS)[number];

/** Only biological links carry genetic relatedness. At most two per child. */
export interface ParentLink {
  childId: PersonId;
  parentId: PersonId;
  kind: ParentLinkKind;
}

export const PARTNERSHIP_STATUSES = ['current', 'former'] as const;
export type PartnershipStatus = (typeof PARTNERSHIP_STATUSES)[number];

export interface Partnership {
  id: string;
  aId: PersonId;
  bId: PersonId;
  status: PartnershipStatus;
}

export interface Pedigree {
  version: number;
  persons: Record<PersonId, Person>;
  parentLinks: ParentLink[];
  partnerships: Partnership[];
  /** Exactly one person is the proband (the user). */
  probandId: PersonId;
}

/** Hard limits, enforced when loading stored or imported data. */
export const LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  maxPersons: 500,
  maxParentLinks: 2000,
  maxPartnerships: 1000,
  maxConditionsPerPerson: 50,
  maxAge: 120,
  maxNameLength: 80,
  maxNotesLength: 2000,
  maxSubtypeLength: 40,
  maxIdLength: 64,
} as const;
