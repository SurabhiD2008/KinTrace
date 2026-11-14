import type { ConditionCode } from '../../../src/domain';
import type { FindingStatus, StepResult } from '../../../src/guidelines';
import { family, findingFor } from '../../fixtures/guidelineFamily';
import type { Affected } from '../../fixtures/guidelineFamily';

const RULE = 'amsterdam-ii';

/** Results of the four steps KinTrace checks, in order. */
function stepResults(affected: Affected): StepResult[] {
  return findingFor(family(affected), RULE)
    .steps.filter((step) => !step.clinicianConfirms)
    .map((step) => step.result);
}

describe('Amsterdam II', () => {
  it.each<[string, Affected, FindingStatus]>([
    [
      'mother at 49, her mother and her sister',
      { mom: [['colorectal', 49]], mgm: [['endometrial', 60]], maunt: [['colorectal', 55]] },
      'meets',
    ],
    [
      'the same family with the youngest at 50',
      { mom: [['colorectal', 50]], mgm: [['endometrial', 60]], maunt: [['colorectal', 55]] },
      'none',
    ],
    [
      'the proband at 45, mother and sister',
      { me: [['colorectal', 45]], mom: [['colorectal', 60]], sis: [['endometrial', 62]] },
      'meets',
    ],
    ['only two affected relatives', { mom: [['colorectal', 45]], mgm: [['colorectal', 60]] }, 'none'],
    [
      'three affected in a single generation',
      { me: [['colorectal', 45]], sis: [['colorectal', 60]], bro: [['colorectal', 61]] },
      'none',
    ],
    [
      'mother, father and sister (the parents are on different sides)',
      { mom: [['colorectal', 45]], dad: [['colorectal', 60]], sis: [['colorectal', 40]] },
      'none',
    ],
    [
      'grandmother, proband and cousin (nobody is first-degree to the other two)',
      { mgm: [['colorectal', 45]], me: [['colorectal', 44]], cousin: [['colorectal', 40]] },
      'none',
    ],
    [
      'a step-mother does not make up the third',
      { mom: [['colorectal', 45]], mgm: [['colorectal', 60]], stepmom: [['colorectal', 50]] },
      'none',
    ],
    [
      'three relatives with breast cancer (not a Lynch-associated cancer)',
      { mom: [['breast', 45]], mgm: [['breast', 60]], maunt: [['breast', 55]] },
      'none',
    ],
    [
      'one relative with three cancers counts once',
      { mom: [['colorectal', 45], ['endometrial', 50], ['ureter', 55]] },
      'none',
    ],
    [
      'deceased relatives count',
      { dad: [['colorectal', 48]], pgf: [['colorectal', 70]], puncle: [['small_bowel', 66]] },
      'meets',
    ],
  ])('%s -> %s', (_name, affected, status) => {
    expect(findingFor(family(affected, { pgf: { deceased: true } }), RULE).status).toBe(status);
  });

  it.each<[ConditionCode]>([
    ['colorectal'],
    ['endometrial'],
    ['small_bowel'],
    ['ureter'],
    ['renal_pelvis'],
  ])('counts %s as a Lynch-associated cancer', (code) => {
    const affected: Affected = {
      mom: [[code, 45]],
      mgm: [['colorectal', 60]],
      maunt: [['colorectal', 55]],
    };
    expect(findingFor(family(affected), RULE).status).toBe('meets');
  });

  it.each<[string, Affected, StepResult[]]>([
    [
      'reports which step fails: no successive generations',
      { me: [['colorectal', 45]], sis: [['colorectal', 60]], bro: [['colorectal', 61]] },
      ['passed', 'passed', 'failed', 'passed'],
    ],
    [
      'reports which step fails: nobody under 50',
      { mom: [['colorectal', 50]], mgm: [['endometrial', 60]], maunt: [['colorectal', 55]] },
      ['passed', 'passed', 'passed', 'failed'],
    ],
    [
      'reports which step fails: no first-degree link',
      { mgm: [['colorectal', 45]], me: [['colorectal', 44]], cousin: [['colorectal', 40]] },
      ['passed', 'failed', 'failed', 'passed'],
    ],
    [
      'is unknown on age when no age is recorded',
      { mom: [['colorectal']], mgm: [['endometrial', 60]], maunt: [['colorectal', 55]] },
      ['passed', 'passed', 'passed', 'unknown'],
    ],
    [
      'is unknown on the count when the third cancer is "unsure"',
      {
        mom: [['colorectal', 45]],
        mgm: [['endometrial', 60]],
        maunt: [['colorectal', 55, { confirmed: 'unsure' }]],
      },
      ['unknown', 'unknown', 'passed', 'passed'],
    ],
  ])('%s', (_name, affected, expected) => {
    expect(stepResults(affected)).toEqual(expected);
  });

  it('becomes "could be met if completed" when only a missing age stands in the way', () => {
    const finding = findingFor(
      family({ mom: [['colorectal']], mgm: [['endometrial', 60]], maunt: [['colorectal', 55]] }),
      RULE,
    );
    expect(finding).toMatchObject({ status: 'discuss', reason: 'could-be-met-if-completed' });
    expect(finding.unknowns.map((gap) => `${gap.personId}.${gap.field}`)).toEqual([
      'mom.conditionOnset',
    ]);
  });

  it('shows the two clinician steps without letting them change a Meets result', () => {
    const finding = findingFor(
      family({ mom: [['colorectal', 49]], mgm: [['endometrial', 60]], maunt: [['colorectal', 55]] }),
      RULE,
    );
    expect(finding).toMatchObject({ status: 'meets', reason: 'criteria-met' });
    expect(finding.evidence.sort()).toEqual(['maunt', 'mgm', 'mom']);
    expect(finding.steps.slice(4)).toEqual([
      {
        text: 'Familial adenomatous polyposis has been excluded',
        result: 'unknown',
        evidence: [],
        clinicianConfirms: true,
      },
      {
        text: 'The tumours were verified by pathology',
        result: 'unknown',
        evidence: [],
        clinicianConfirms: true,
      },
    ]);
  });

  it('shows the clinician steps on a not-met result too', () => {
    const finding = findingFor(family(), RULE);
    expect(finding.status).toBe('none');
    expect(finding.steps.filter((step) => step.clinicianConfirms)).toHaveLength(2);
  });
});
