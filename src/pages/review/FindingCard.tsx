import { useId } from 'react';
import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Gap, Pedigree, PersonId } from '../../domain';
import type { Finding, FindingStep, GuidelineProfile, GuidelineResult, StepResult } from '../../guidelines';
import { t } from '../../i18n';
import { Sticker, buildLink } from '../../ui';
import { personName } from '../../ui/pedigree/describe';
import { primaryFinding } from './order';

export interface FindingCardProps {
  guideline: GuidelineProfile;
  result: GuidelineResult;
  pedigree: Pedigree;
  expanded: boolean;
  onToggle(): void;
  onShowPerson(id: PersonId, from: HTMLElement): void;
}

const STEP_ICON: Record<StepResult, string> = { passed: '✓', failed: '✕', unknown: '?' };
const STEP_LABEL = {
  passed: 'findings.step.passed',
  failed: 'findings.step.failed',
  unknown: 'findings.step.unknown',
} as const;
const STATUS_LABEL = { meets: 'status.meets', discuss: 'status.discuss', none: 'status.none' } as const;

function StepBadge({ result }: { result: StepResult }) {
  return (
    <span className={`kt-step-badge kt-step-badge--${result}`} data-step-result={result}>
      <span aria-hidden="true">{STEP_ICON[result]}</span> {t(STEP_LABEL[result])}
    </span>
  );
}

interface StepsProps {
  finding: Finding;
  pedigree: Pedigree;
  onShowPerson(id: PersonId, from: HTMLElement): void;
}

function Steps({ finding, pedigree, onShowPerson }: StepsProps) {
  const show = (id: PersonId) => (event: MouseEvent<HTMLButtonElement>) =>
    onShowPerson(id, event.currentTarget);
  return (
    <ol className="kt-steps" aria-label={t('findings.steps')}>
      {finding.steps.map((step: FindingStep, index) => (
        <li key={`${finding.ruleId}-${index}`} className="kt-steps__step">
          <div className="kt-steps__line">
            <StepBadge result={step.result} />
            <span>{step.text}</span>
            {step.clinicianConfirms ? <Sticker status="neutral">{t('findings.clinician')}</Sticker> : null}
          </div>
          {step.evidence.length > 0 ? (
            <div className="kt-steps__people">
              <span className="muted">{t('findings.step.people')}</span>
              <ul className="kt-chips">
                {step.evidence
                  .filter((id) => id in pedigree.persons)
                  .map((id) => (
                    <li key={id}>
                      <button
                        type="button"
                        className="kt-chip"
                        aria-label={t('findings.showPerson', { name: personName(pedigree, id) })}
                        onClick={show(id)}
                      >
                        {personName(pedigree, id)}
                      </button>
                      {finding.selfReportedEvidence.includes(id) ? (
                        <Sticker status="neutral">{t('findings.selfReported')}</Sticker>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Missing details that could turn a "could be met" finding either way, once each. */
function changeGaps(result: GuidelineResult): Gap[] {
  const seen = new Set<string>();
  return result.findings
    .filter((finding) => finding.reason === 'could-be-met-if-completed')
    .flatMap((finding) => finding.unknowns)
    .filter((gap) => {
      const key = `${gap.personId}|${gap.field}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function FindingCard({
  guideline,
  result,
  pedigree,
  expanded,
  onToggle,
  onShowPerson,
}: FindingCardProps) {
  const bodyId = useId();
  const primary = primaryFinding(result);
  const others = result.findings.filter((finding) => finding !== primary);
  const gaps = changeGaps(result);

  return (
    <section className="kt-card kt-finding" data-guideline={guideline.id} data-status={result.status}>
      <h2 className="kt-finding__heading">
        <button
          type="button"
          className="kt-finding__toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="kt-finding__chevron" aria-hidden="true">
            {expanded ? '−' : '+'}
          </span>
          <span className="kt-finding__name">{guideline.name}</span>
          <Sticker status={result.status}>{t(STATUS_LABEL[result.status])}</Sticker>
        </button>
      </h2>
      <p className="kt-finding__source muted">
        {t('findings.source', { publisher: guideline.publisher, scope: guideline.countryOrScope })}
      </p>

      {expanded ? (
        <div id={bodyId} className="kt-finding__body">
          {primary ? <p className="kt-finding__summary">{primary.summary}</p> : null}
          {result.status === 'none' ? <p>{t('findings.none')}</p> : null}
          {primary ? <Steps finding={primary} pedigree={pedigree} onShowPerson={onShowPerson} /> : null}

          {gaps.length > 0 ? (
            <div className="kt-finding__change">
              <h3>{t('findings.change.title')}</h3>
              <p>{t('findings.change.body')}</p>
              <ul>
                {gaps.map((gap) => (
                  <li key={`${gap.personId}|${gap.field}`}>
                    <Link className="link-target" to={buildLink(gap.personId, gap.field)}>
                      {gap.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {others.length > 0 ? (
            <details className="kt-finding__others">
              <summary>
                {others.length === 1
                  ? t('findings.others.one')
                  : t('findings.others.many', { count: others.length })}
              </summary>
              {others.map((finding) => (
                <div key={finding.ruleId} className="kt-finding__other">
                  <p>
                    <Sticker status={finding.status}>{t(STATUS_LABEL[finding.status])}</Sticker>{' '}
                    {finding.summary}
                  </p>
                  <Steps finding={finding} pedigree={pedigree} onShowPerson={onShowPerson} />
                </div>
              ))}
            </details>
          ) : null}

          <p>
            <a href={guideline.sourceUrl} target="_blank" rel="noreferrer noopener" className="link-target">
              {t('findings.sourceLink', { name: guideline.shortName })}
            </a>
          </p>
        </div>
      ) : null}
    </section>
  );
}
