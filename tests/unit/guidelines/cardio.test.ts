import type { FindingReason, FindingStatus } from '../../../src/guidelines';
import { family, findingFor } from '../../fixtures/guidelineFamily';
import type { Affected } from '../../fixtures/guidelineFamily';

const CG71 = 'cg71-premature-chd';
const DLCN = 'dlcn-family-history';
const NG238 = 'ng238-family-history';

type Row = [name: string, affected: Affected, status: FindingStatus, evidence: string[]];

function check(ruleId: string, [, affected, status, evidence]: Row) {
  const finding = findingFor(family(affected), ruleId);
  expect(finding.status).toBe(status);
  expect(finding.evidence).toEqual(evidence);
}

describe('CG71: coronary event before 60 in the proband or a first-degree relative', () => {
  const rows: Row[] = [
    ['father at 59', { dad: [['coronary_event', 59]] }, 'discuss', ['dad']],
    ['father at 60', { dad: [['coronary_event', 60]] }, 'none', []],
    ['mother at 59', { mom: [['coronary_event', 59]] }, 'discuss', ['mom']],
    ['mother at 60', { mom: [['coronary_event', 60]] }, 'none', []],
    ['the proband at 50 (personal history counts)', { me: [['coronary_event', 50]] }, 'discuss', ['me']],
    ['a son at 30', { son: [['coronary_event', 30]] }, 'discuss', ['son']],
    ['paternal uncle at 40 (second degree)', { puncle: [['coronary_event', 40]] }, 'none', []],
    ['maternal grandfather at 40 (second degree)', { mgf: [['coronary_event', 40]] }, 'none', []],
    ['half-sister at 40 (second degree)', { hsis: [['coronary_event', 40]] }, 'none', []],
    ['step-mother at 40', { stepmom: [['coronary_event', 40]] }, 'none', []],
    ['father with a stroke at 40 (not a coronary event)', { dad: [['stroke', 40]] }, 'none', []],
    [
      'father at 57 and uncle at 54: only the father is evidence',
      { dad: [['coronary_event', 57]], puncle: [['coronary_event', 54]] },
      'discuss',
      ['dad'],
    ],
    [
      'father with events at 61 and 58 (one relative, earliest counts)',
      { dad: [['coronary_event', 61], ['coronary_event', 58]] },
      'discuss',
      ['dad'],
    ],
  ];
  it.each(rows)('%s -> %s', (...row) => check(CG71, row));

  it('is advice to discuss, never "meets"', () => {
    expect(findingFor(family({ dad: [['coronary_event', 40]] }), CG71)).toMatchObject({
      status: 'discuss',
      reason: 'guideline-advises-discussion',
    });
  });
});

describe('DLCN family-history item: before 55 in men, before 60 in women', () => {
  const rows: Row[] = [
    ['father at 54', { dad: [['coronary_event', 54]] }, 'discuss', ['dad']],
    ['father at 55', { dad: [['coronary_event', 55]] }, 'none', []],
    ['brother at 54', { bro: [['coronary_event', 54]] }, 'discuss', ['bro']],
    ['mother at 59', { mom: [['coronary_event', 59]] }, 'discuss', ['mom']],
    ['mother at 60', { mom: [['coronary_event', 60]] }, 'none', []],
    ['mother at 57 (under the threshold for women)', { mom: [['coronary_event', 57]] }, 'discuss', ['mom']],
    ['father at 57 (over the threshold for men)', { dad: [['coronary_event', 57]] }, 'none', []],
    ['sibling of unknown sex at 54 (early for either sex)', { sibx: [['coronary_event', 54]] }, 'discuss', ['sibx']],
    ['sibling of unknown sex at 60 (not early for either sex)', { sibx: [['coronary_event', 60]] }, 'none', []],
    ['paternal uncle at 40 (second degree)', { puncle: [['coronary_event', 40]] }, 'none', []],
    ['the proband at 40 (the item is about relatives)', { me: [['coronary_event', 40]] }, 'none', []],
    ['father with a stroke at 40', { dad: [['stroke', 40]] }, 'none', []],
  ];
  it.each(rows)('%s -> %s', (...row) => check(DLCN, row));

  it('is unknown for a relative of unknown sex between the two thresholds', () => {
    const finding = findingFor(family({ sibx: [['coronary_event', 57]] }), DLCN);
    expect(finding).toMatchObject({ status: 'discuss', reason: 'could-be-met-if-completed' });
    expect(finding.unknowns.map((gap) => `${gap.personId}.${gap.field}`)).toEqual(['sibx.sex']);
  });

  it('marks the lab and examination items as unknown, for the clinician, without changing the status', () => {
    const met = findingFor(family({ dad: [['coronary_event', 54]] }), DLCN);
    expect(met.reason).toBe('guideline-advises-discussion');
    const clinicianSteps = met.steps.filter((step) => step.clinicianConfirms);
    expect(clinicianSteps.map((step) => step.result)).toEqual(['unknown', 'unknown', 'unknown']);
    const notMet = findingFor(family(), DLCN);
    expect(notMet.status).toBe('none');
    expect(notMet.steps.filter((step) => step.clinicianConfirms)).toHaveLength(3);
  });

  it('is always labelled as the family-history item', () => {
    const finding = findingFor(family({ dad: [['coronary_event', 54]] }), DLCN);
    expect(finding.summary).toContain('family-history item');
  });
});

describe('NG238: angina or heart attack before 60 in a first-degree relative, either sex', () => {
  const rows: Row[] = [
    ['father at 59', { dad: [['coronary_event', 59]] }, 'discuss', ['dad']],
    ['father at 60', { dad: [['coronary_event', 60]] }, 'none', []],
    ['mother at 59', { mom: [['coronary_event', 59]] }, 'discuss', ['mom']],
    ['mother at 60', { mom: [['coronary_event', 60]] }, 'none', []],
    // The guideline has no 55/65 thresholds by sex: these sit on the old expectations' boundaries.
    ['father at 54', { dad: [['coronary_event', 54]] }, 'discuss', ['dad']],
    ['father at 55 (no lower threshold for men)', { dad: [['coronary_event', 55]] }, 'discuss', ['dad']],
    ['mother at 64 (no higher threshold for women)', { mom: [['coronary_event', 64]] }, 'none', []],
    ['mother at 65', { mom: [['coronary_event', 65]] }, 'none', []],
    ['sibling of unknown sex at 59 (sex does not matter)', { sibx: [['coronary_event', 59]] }, 'discuss', ['sibx']],
    ['paternal uncle at 40 (second degree)', { puncle: [['coronary_event', 40]] }, 'none', []],
    ['the proband at 40 (relatives only)', { me: [['coronary_event', 40]] }, 'none', []],
    ['father with a stroke at 40', { dad: [['stroke', 40]] }, 'none', []],
  ];
  it.each(rows)('%s -> %s', (...row) => check(NG238, row));
});

describe('heart rules: unknowns and confidence', () => {
  it.each<[string, string, Affected, FindingStatus, FindingReason, string[]]>([
    ['CG71: missing age', CG71, { sis: [['coronary_event']] }, 'discuss', 'could-be-met-if-completed', ['sis.conditionOnset']],
    ['DLCN: missing age', DLCN, { sis: [['coronary_event']] }, 'discuss', 'could-be-met-if-completed', ['sis.conditionOnset']],
    ['NG238: missing age', NG238, { sis: [['coronary_event']] }, 'discuss', 'could-be-met-if-completed', ['sis.conditionOnset']],
    [
      'CG71: an "unsure" event at 50',
      CG71,
      { dad: [['coronary_event', 50, { confirmed: 'unsure' }]] },
      'discuss',
      'could-be-met-if-completed',
      ['dad.conditionConfirmation'],
    ],
    [
      'NG238: an "unsure" event at 70',
      NG238,
      { dad: [['coronary_event', 70, { confirmed: 'unsure' }]] },
      'none',
      'not-met',
      [],
    ],
    ['CG71: nobody affected', CG71, {}, 'none', 'not-met', []],
  ])('%s', (_name, ruleId, affected, status, reason, gaps) => {
    const finding = findingFor(family(affected), ruleId);
    expect(finding).toMatchObject({ status, reason });
    expect(finding.unknowns.map((gap) => `${gap.personId}.${gap.field}`)).toEqual(gaps);
  });

  it('flags a self-reported event', () => {
    const finding = findingFor(
      family({ dad: [['coronary_event', 50, { confirmed: 'reported' }]] }),
      CG71,
    );
    expect(finding.selfReportedEvidence).toEqual(['dad']);
  });
});
