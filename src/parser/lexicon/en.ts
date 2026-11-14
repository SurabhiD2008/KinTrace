import type { ConditionCode, Sex } from '../../domain/types';

// English word lists for the offline parser. Pure data: the parser reads them
// and never hardcodes a word. A new language adds a sibling file with the
// same shape. Phrases are lower case, split into words ("half sister").

/** A family member as written, before possessive chains are worked out. */
export type BaseRelation =
  | 'self'
  | 'mother'
  | 'father'
  | 'parent'
  | 'parents'
  | 'sister'
  | 'brother'
  | 'sibling'
  | 'half_sister'
  | 'half_brother'
  | 'daughter'
  | 'son'
  | 'child'
  | 'grandmother'
  | 'grandfather'
  | 'grandparents'
  | 'aunt'
  | 'uncle'
  | 'niece'
  | 'nephew'
  | 'cousin'
  | 'grandchild'
  | 'partner';

export interface RelationWord {
  phrase: string[];
  base: BaseRelation;
  sex?: Sex;
}

const rel = (phrases: string[], base: BaseRelation, sex?: Sex): RelationWord[] =>
  phrases.map((p) => ({ phrase: p.split(' '), base, ...(sex !== undefined && { sex }) }));

export interface Lexicon {
  relations: RelationWord[];
  /** Any of these words marks a step relative: not blood, so not added. */
  stepWords: string[][];
  sideWords: { phrase: string[]; side: 'maternal' | 'paternal' }[];
  /** "on my mum's side", "on her side": the relation word inside sets the side. */
  sideNoun: string[];
  conditions: { phrase: string[]; code: ConditionCode; subtype?: string }[];
  /** "cancer" with no type: a condition KinTrace cannot place. */
  genericConditions: string[][];
  negations: string[][];
  /** Phrases that wipe out a whole clause: "no one in the family had…". */
  nobody: string[][];
  hedges: string[][];
  /** "not sure whether", "either": with "or" between two conditions, the user must choose. */
  choiceMarkers: string[][];
  orWords: string[];
  deathWords: string[][];
  /** "my late father": death only when it sits before a family word. */
  lateWord: string;
  ageIntros: string[][];
  /** "when she was 44": the middle word can be any of these. */
  whenPronouns: string[];
  decadeWords: Record<string, number>;
  decadeQualifiers: string[];
  decadeIntros: string[][];
  numberWords: Record<string, number>;
  tensWords: Record<string, number>;
  selfWords: string[];
  /** Verbs that make "I" the subject: "I had", "I was". */
  selfVerbs: string[];
  possessives: { word: string; anchor: 'self' | 'previous' }[];
  subjectPronouns: string[];
  conjunctions: string[];
  /** Words that suggest the text is an instruction rather than family history. */
  instructionWords: string[][];
  /** Common words; a clause with none of them and no other hit is probably another language. */
  stopwords: string[];
}

export const en: Lexicon = {
  relations: [
    ...rel(['mother', 'mom', 'mum', 'mommy', 'mummy', 'mama', 'mamma', 'mam', 'ma'], 'mother', 'female'),
    ...rel(['father', 'dad', 'daddy', 'papa', 'pa', 'pop', 'pops'], 'father', 'male'),
    ...rel(['parent'], 'parent'),
    ...rel(['parents'], 'parents'),
    ...rel(['half sister', 'half sis', 'halfsister'], 'half_sister', 'female'),
    ...rel(['half brother', 'half bro', 'halfbrother'], 'half_brother', 'male'),
    ...rel(['sister', 'sis', 'sisters'], 'sister', 'female'),
    ...rel(['brother', 'bro', 'brothers'], 'brother', 'male'),
    ...rel(['sibling', 'siblings'], 'sibling'),
    ...rel(['daughter', 'daughters'], 'daughter', 'female'),
    ...rel(['son', 'sons'], 'son', 'male'),
    ...rel(['child', 'kid'], 'child'),
    ...rel(['grandmother', 'grandma', 'granny', 'gran', 'nana', 'nan', 'nanna', 'grandmom', 'grandmum', 'grand mother'], 'grandmother', 'female'),
    ...rel(['grandfather', 'grandpa', 'granddad', 'grandad', 'gramps', 'grandpop', 'grand father'], 'grandfather', 'male'),
    ...rel(['grandparents'], 'grandparents'),
    ...rel(['aunt', 'aunty', 'auntie', 'aunts'], 'aunt', 'female'),
    ...rel(['uncle', 'uncles'], 'uncle', 'male'),
    ...rel(['niece'], 'niece', 'female'),
    ...rel(['nephew'], 'nephew', 'male'),
    ...rel(['cousin', 'cousins'], 'cousin'),
    ...rel(['granddaughter'], 'grandchild', 'female'),
    ...rel(['grandson'], 'grandchild', 'male'),
    ...rel(['grandchild', 'grandkid'], 'grandchild'),
    ...rel(['husband'], 'partner', 'male'),
    ...rel(['wife'], 'partner', 'female'),
    ...rel(['partner', 'spouse'], 'partner'),
  ],
  stepWords: [
    ['stepmother'], ['stepmom'], ['stepmum'], ['stepfather'], ['stepdad'], ['stepsister'],
    ['stepbrother'], ['stepson'], ['stepdaughter'], ['stepparent'], ['step'],
  ],
  sideWords: [
    { phrase: ['maternal'], side: 'maternal' },
    { phrase: ['paternal'], side: 'paternal' },
  ],
  sideNoun: ['side'],
  conditions: [
    { phrase: ['small', 'bowel'], code: 'small_bowel' },
    { phrase: ['small', 'intestine'], code: 'small_bowel' },
    { phrase: ['renal', 'pelvis'], code: 'renal_pelvis' },
    { phrase: ['type', '2', 'diabetes'], code: 'diabetes_type2' },
    { phrase: ['type', 'two', 'diabetes'], code: 'diabetes_type2' },
    { phrase: ['type', 'ii', 'diabetes'], code: 'diabetes_type2' },
    { phrase: ['sudden', 'cardiac', 'death'], code: 'sudden_cardiac_death' },
    { phrase: ['sudden', 'cardiac', 'arrest'], code: 'sudden_cardiac_death' },
    { phrase: ['heart', 'attack'], code: 'coronary_event', subtype: 'heart_attack' },
    { phrase: ['heart', 'attacks'], code: 'coronary_event', subtype: 'heart_attack' },
    { phrase: ['myocardial', 'infarction'], code: 'coronary_event', subtype: 'heart_attack' },
    { phrase: ['bypass'], code: 'coronary_event', subtype: 'bypass_surgery' },
    { phrase: ['stent'], code: 'coronary_event', subtype: 'stent' },
    { phrase: ['stents'], code: 'coronary_event', subtype: 'stent' },
    { phrase: ['angioplasty'], code: 'coronary_event', subtype: 'angioplasty' },
    { phrase: ['angina'], code: 'coronary_event', subtype: 'angina' },
    { phrase: ['high', 'cholesterol'], code: 'high_ldl' },
    { phrase: ['high', 'ldl'], code: 'high_ldl' },
    { phrase: ['hypercholesterolaemia'], code: 'high_ldl' },
    { phrase: ['hypercholesterolemia'], code: 'high_ldl' },
    { phrase: ['breast'], code: 'breast' },
    { phrase: ['ovarian'], code: 'ovarian' },
    { phrase: ['ovary'], code: 'ovarian' },
    { phrase: ['ovaries'], code: 'ovarian' },
    { phrase: ['bowel'], code: 'colorectal' },
    { phrase: ['colon'], code: 'colorectal' },
    { phrase: ['colorectal'], code: 'colorectal' },
    { phrase: ['rectal'], code: 'colorectal' },
    { phrase: ['womb'], code: 'endometrial' },
    { phrase: ['uterine'], code: 'endometrial' },
    { phrase: ['uterus'], code: 'endometrial' },
    { phrase: ['endometrial'], code: 'endometrial' },
    { phrase: ['kidney'], code: 'renal_pelvis' },
    { phrase: ['ureter'], code: 'ureter' },
    { phrase: ['ureteral'], code: 'ureter' },
    { phrase: ['prostate'], code: 'prostate' },
    { phrase: ['pancreatic'], code: 'pancreatic' },
    { phrase: ['pancreas'], code: 'pancreatic' },
    { phrase: ['stroke'], code: 'stroke' },
    { phrase: ['strokes'], code: 'stroke' },
  ],
  genericConditions: [['cancer'], ['cancers'], ['tumour'], ['tumor'], ['diabetes'], ['heart', 'problems'], ['heart', 'disease'], ['heart', 'trouble']],
  negations: [['never'], ['no'], ['not'], ["didn't"], ['did', 'not'], ["doesn't"], ["hasn't"], ["haven't"], ["wasn't"], ['without'], ['neither'], ['nor']],
  nobody: [['no', 'one'], ['nobody'], ['none', 'of'], ['noone']],
  hedges: [
    ['i', 'think'], ['i', 'believe'], ['i', 'guess'], ['not', 'sure', 'if'], ['not', 'sure'],
    ['maybe'], ['might', 'have'], ['might'], ['possibly'], ['probably'], ['perhaps'], ['apparently'],
  ],
  choiceMarkers: [['not', 'sure', 'whether'], ['either'], ['whether']],
  orWords: ['or'],
  deathWords: [['passed', 'away'], ['passed', 'on'], ['died'], ['dies'], ['deceased'], ['dead']],
  lateWord: 'late',
  ageIntros: [['at', 'the', 'age', 'of'], ['at', 'age'], ['aged'], ['age'], ['at']],
  whenPronouns: ['she', 'he', 'they', 'i'],
  decadeWords: {
    teens: 10, twenties: 20, thirties: 30, forties: 40, fifties: 50, sixties: 60,
    seventies: 70, eighties: 80, nineties: 90,
  },
  decadeQualifiers: ['early', 'mid', 'late'],
  decadeIntros: [['in', 'her'], ['in', 'his'], ['in', 'their'], ['in', 'my'], ['in', 'the'], ['in']],
  numberWords: {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19,
  },
  tensWords: { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 },
  selfWords: ['i', 'myself'],
  selfVerbs: ['had', 'have', 'was', 'were', 'am', "i've", 'got', 'developed', 'get'],
  possessives: [
    { word: 'my', anchor: 'self' },
    { word: 'our', anchor: 'self' },
    { word: 'her', anchor: 'previous' },
    { word: 'his', anchor: 'previous' },
    { word: 'their', anchor: 'previous' },
  ],
  subjectPronouns: ['she', 'he', 'they'],
  conjunctions: ['and', 'both', '&'],
  instructionWords: [
    ['ignore'], ['disregard'], ['instruction'], ['instructions'], ['rules'], ['prompt'], ['pretend'],
    ['override'], ['jailbreak'], ['system'], ['forget'], ['mark', 'everyone'], ['set', 'everyone'],
    ['everyone', 'healthy'], ['you', 'are'], ['you', 'must'], ['delete'], ['assistant'],
  ],
  stopwords: [
    'the', 'my', 'her', 'his', 'their', 'our', 'had', 'has', 'have', 'was', 'were', 'is',
    'and', 'of', 'at', 'in', 'with', 'she', 'he', 'they', 'it', 'to', 'when', 'from', 'on', 'i',
    'also', 'but', 'who', 'both', 'family', 'years', 'old', 'got', 'think',
  ],
};
