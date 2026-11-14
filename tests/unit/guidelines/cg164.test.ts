import type { FindingReason, FindingStatus } from '../../../src/guidelines';
import { family, findingFor, statusOf } from '../../fixtures/guidelineFamily';
import type { Affected } from '../../fixtures/guidelineFamily';

type Row = [name: string, affected: Affected, ruleId: string, status: FindingStatus];

const FEMALE = 'cg164-female-under-40';
const MALE = 'cg164-male-any-age';
const BILATERAL = 'cg164-bilateral-under-50';
const TWO = 'cg164-two-relatives';
const BREAST_OVARIAN = 'cg164-breast-and-ovarian';
const THREE = 'cg164-three-relatives';

describe('CG164: single-relative criteria', () => {
  it.each<Row>([
    ['mother with breast cancer at 39', { mom: [['breast', 39]] }, FEMALE, 'meets'],
    ['mother with breast cancer at 40', { mom: [['breast', 40]] }, FEMALE, 'none'],
    ['sister at 39', { sis: [['breast', 39]] }, FEMALE, 'meets'],
    ['daughter at 30', { dau: [['breast', 30]] }, FEMALE, 'meets'],
    ['a deceased mother at 35', { mom: [['breast', 35]] }, FEMALE, 'meets'],
    ['father at 39 (male, so not this criterion)', { dad: [['breast', 39]] }, FEMALE, 'none'],
    ['half-sister at 35 (second degree)', { hsis: [['breast', 35]] }, FEMALE, 'none'],
    ['maternal aunt at 35 (second degree)', { maunt: [['breast', 35]] }, FEMALE, 'none'],
    ['father with breast cancer at 70', { dad: [['breast', 70]] }, MALE, 'meets'],
    ['brother with breast cancer, age not recorded', { bro: [['breast']] }, MALE, 'meets'],
    ['son at 45', { son: [['breast', 45]] }, MALE, 'meets'],
    ['mother at 70 (female, so not this criterion)', { mom: [['breast', 70]] }, MALE, 'none'],
    ['maternal grandfather (second degree)', { mgf: [['breast', 60]] }, MALE, 'none'],
    [
      'mother, bilateral, first primary at 49',
      { mom: [['breast', 49, { laterality: 'bilateral' }]] },
      BILATERAL,
      'meets',
    ],
    [
      'mother, bilateral, first primary at 50',
      { mom: [['breast', 50, { laterality: 'bilateral' }]] },
      BILATERAL,
      'none',
    ],
    [
      'mother with left at 45 and right at 60',
      { mom: [['breast', 45, { laterality: 'left' }], ['breast', 60, { laterality: 'right' }]] },
      BILATERAL,
      'meets',
    ],
    [
      'mother with left at 55 and right at 60',
      { mom: [['breast', 55, { laterality: 'left' }], ['breast', 60, { laterality: 'right' }]] },
      BILATERAL,
      'none',
    ],
    [
      'mother, bilateral given as a subtype, at 45',
      { mom: [['breast', 45, { laterality: 'left', subtype: 'Bilateral' }]] },
      BILATERAL,
      'meets',
    ],
    [
      'mother, one breast only, at 45',
      { mom: [['breast', 45, { laterality: 'left' }]] },
      BILATERAL,
      'none',
    ],
    [
      'maternal aunt, bilateral at 40 (second degree)',
      { maunt: [['breast', 40, { laterality: 'bilateral' }]] },
      BILATERAL,
      'none',
    ],
  ])('%s -> %s is %s', (_name, affected, ruleId, status) => {
    const deceased = _name.includes('deceased') ? { mom: { deceased: true } } : {};
    expect(findingFor(family(affected, deceased), ruleId).status).toBe(status);
  });
});

describe('CG164: criteria that combine relatives', () => {
  it.each<Row>([
    ['mother and sister', { mom: [['breast', 60]], sis: [['breast', 62]] }, TWO, 'meets'],
    ['mother and maternal grandmother', { mom: [['breast', 60]], mgm: [['breast', 70]] }, TWO, 'meets'],
    ['mother and maternal aunt', { mom: [['breast', 60]], maunt: [['breast', 55]] }, TWO, 'meets'],
    ['mother and paternal aunt (different sides)', { mom: [['breast', 60]], paunt: [['breast', 55]] }, TWO, 'none'],
    ['mother and father (different sides)', { mom: [['breast', 60]], dad: [['breast', 65]] }, TWO, 'none'],
    ['sister and paternal aunt (a sister is on both sides)', { sis: [['breast', 50]], paunt: [['breast', 55]] }, TWO, 'meets'],
    ['daughter and paternal aunt', { dau: [['breast', 41]], paunt: [['breast', 55]] }, TWO, 'meets'],
    ['maternal grandmother and aunt (no first-degree relative)', { mgm: [['breast', 70]], maunt: [['breast', 55]] }, TWO, 'none'],
    ['mother and half-sister (second degree, same side)', { mom: [['breast', 60]], hsis: [['breast', 45]] }, TWO, 'meets'],
    ['father and half-sister through the mother', { dad: [['breast', 60]], hsis: [['breast', 45]] }, TWO, 'none'],
    ['mother and half-aunt (third degree)', { mom: [['breast', 60]], mhaunt: [['breast', 45]] }, TWO, 'none'],
    ['mother and cousin (third degree)', { mom: [['breast', 60]], cousin: [['breast', 45]] }, TWO, 'none'],
    ['mother alone', { mom: [['breast', 60]] }, TWO, 'none'],
    [
      'mother with two breast cancers recorded (one relative, counted once)',
      { mom: [['breast', 60], ['breast', 61]] },
      TWO,
      'none',
    ],
    ['mother breast, maternal aunt ovarian', { mom: [['breast', 60]], maunt: [['ovarian', 50]] }, BREAST_OVARIAN, 'meets'],
    ['mother ovarian, maternal grandmother breast', { mom: [['ovarian', 60]], mgm: [['breast', 70]] }, BREAST_OVARIAN, 'meets'],
    ['mother breast, paternal aunt ovarian (different sides)', { mom: [['breast', 60]], paunt: [['ovarian', 50]] }, BREAST_OVARIAN, 'none'],
    ['grandmother breast, aunt ovarian (no first-degree relative)', { mgm: [['breast', 70]], maunt: [['ovarian', 50]] }, BREAST_OVARIAN, 'none'],
    ['mother with both breast and ovarian, nobody else', { mom: [['breast', 60], ['ovarian', 62]] }, BREAST_OVARIAN, 'none'],
    ['mother breast, sister ovarian', { mom: [['breast', 60]], sis: [['ovarian', 40]] }, BREAST_OVARIAN, 'meets'],
    ['mother breast only', { mom: [['breast', 60]] }, BREAST_OVARIAN, 'none'],
    [
      'mother, grandmother and aunt on the same side',
      { mom: [['breast', 60]], mgm: [['breast', 70]], maunt: [['breast', 55]] },
      THREE,
      'meets',
    ],
    [
      'three second-degree relatives on the same side',
      { mgm: [['breast', 70]], maunt: [['breast', 55]], muncle: [['breast', 66]] },
      THREE,
      'meets',
    ],
    [
      'mother, grandmother and a paternal aunt',
      { mom: [['breast', 60]], mgm: [['breast', 70]], paunt: [['breast', 55]] },
      THREE,
      'none',
    ],
    [
      'two relatives, one with two cancers recorded',
      { mom: [['breast', 60], ['breast', 64]], mgm: [['breast', 70]] },
      THREE,
      'none',
    ],
  ])('%s -> %s is %s', (_name, affected, ruleId, status) => {
    expect(findingFor(family(affected), ruleId).status).toBe(status);
  });

  it('names everyone on the qualifying side as evidence, and nobody from the other side', () => {
    const ped = family({
      mom: [['breast', 60]],
      mgm: [['breast', 70]],
      paunt: [['breast', 55]],
    });
    expect(findingFor(ped, TWO).evidence.sort()).toEqual(['mgm', 'mom']);
  });
});

describe('CG164: who counts as a relative', () => {
  it.each<[string, Affected, FindingStatus]>([
    ['a step-mother with breast cancer at 30', { stepmom: [['breast', 30]] }, 'none'],
    ['an adopted-in sibling with breast cancer at 30', { asib: [['breast', 30]] }, 'none'],
    ['an adopted-out biological sibling at 30', { outsib: [['breast', 30]] }, 'meets'],
    ['a partner with breast cancer', { partner: [['breast', 30]] }, 'none'],
    ['a step-mother and an adopted-in sibling together', { stepmom: [['breast', 30]], asib: [['breast', 31]] }, 'none'],
  ])('%s -> guideline is %s', (_name, affected, status) => {
    expect(statusOf(family(affected), 'nice-cg164')).toBe(status);
  });
});

describe('CG164: unknowns and confidence', () => {
  it.each<[string, Affected, string, FindingStatus, FindingReason, string[]]>([
    [
      'missing age at diagnosis',
      { mom: [['breast']] },
      FEMALE,
      'discuss',
      'could-be-met-if-completed',
      ['mom.conditionOnset'],
    ],
    [
      'an "unsure" breast cancer at 35',
      { mom: [['breast', 35, { confirmed: 'unsure' }]] },
      FEMALE,
      'discuss',
      'could-be-met-if-completed',
      ['mom.conditionConfirmation'],
    ],
    [
      'an "unsure" breast cancer at 60 (too old either way)',
      { mom: [['breast', 60, { confirmed: 'unsure' }]] },
      FEMALE,
      'none',
      'not-met',
      [],
    ],
    [
      'a sibling of unknown sex at 35',
      { sibx: [['breast', 35]] },
      FEMALE,
      'discuss',
      'could-be-met-if-completed',
      ['sibx.sex'],
    ],
    [
      'a sibling of unknown sex, for the male criterion',
      { sibx: [['breast', 35]] },
      MALE,
      'discuss',
      'could-be-met-if-completed',
      ['sibx.sex'],
    ],
    [
      'an intersex sibling at 35',
      { sibi: [['breast', 35]] },
      FEMALE,
      'discuss',
      'could-be-met-if-completed',
      ['sibi.sex'],
    ],
    [
      'breast cancer at 45 with the side not recorded',
      { mom: [['breast', 45]] },
      BILATERAL,
      'discuss',
      'could-be-met-if-completed',
      ['mom.conditionLaterality'],
    ],
    [
      'breast cancer at 55 with the side not recorded (too old either way)',
      { mom: [['breast', 55]] },
      BILATERAL,
      'none',
      'not-met',
      [],
    ],
    [
      'one sure and one unsure relative',
      { mom: [['breast', 60]], mgm: [['breast', 70, { confirmed: 'unsure' }]] },
      TWO,
      'discuss',
      'could-be-met-if-completed',
      ['mgm.conditionConfirmation'],
    ],
  ])('%s', (_name, affected, ruleId, status, reason, gaps) => {
    const finding = findingFor(family(affected), ruleId);
    expect(finding).toMatchObject({ status, reason });
    expect(finding.unknowns.map((gap) => `${gap.personId}.${gap.field}`)).toEqual(gaps);
  });

  it('does not let unknown sex block a criterion that does not depend on sex', () => {
    const ped = family({ sibx: [['breast', 35]], mom: [['breast', 60]] });
    expect(findingFor(ped, TWO)).toMatchObject({ status: 'meets', reason: 'criteria-met' });
  });

  it('counts a reported condition and flags the person as self-reported', () => {
    const reported = family({ mom: [['breast', 35, { confirmed: 'reported' }]] });
    expect(findingFor(reported, FEMALE)).toMatchObject({
      status: 'meets',
      evidence: ['mom'],
      selfReportedEvidence: ['mom'],
    });
    const confirmed = family({ mom: [['breast', 35, { confirmed: 'confirmed' }]] });
    expect(findingFor(confirmed, FEMALE).selfReportedEvidence).toEqual([]);
  });

  it('shows each step with its result and the people it rests on', () => {
    const finding = findingFor(family({ mom: [['breast', 38]], sis: [['breast', 61]] }), FEMALE);
    expect(finding.steps).toEqual([
      {
        text: 'A first-degree relative has had breast cancer (your mother at 38; your sister at 61)',
        result: 'passed',
        evidence: ['mom', 'sis'],
        clinicianConfirms: false,
      },
      {
        text: 'That relative is female (your mother; your sister)',
        result: 'passed',
        evidence: ['mom', 'sis'],
        clinicianConfirms: false,
      },
      {
        text: 'The breast cancer was found before age 40 (your mother at 38)',
        result: 'passed',
        evidence: ['mom'],
        clinicianConfirms: false,
      },
    ]);
    expect(finding.evidence).toEqual(['mom']);
    expect(finding.summary).toBe(
      'Meets criteria: one first-degree female relative whose breast cancer was found before age 40.',
    );
  });
});
