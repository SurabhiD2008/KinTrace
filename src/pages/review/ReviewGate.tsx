import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { relationshipTo, relativesOf, validatePedigree } from '../../domain';
import type { Pedigree } from '../../domain';
import { t } from '../../i18n';
import { Card, CompletenessPanel, ROUTES, buildLink } from '../../ui';
import { personName } from '../../ui/pedigree/describe';

export interface ReviewGateProps {
  started: boolean;
  pedigree: Pedigree;
  referenceYear: number;
  /** Rendered only when the family can be checked. */
  children: ReactNode;
}

/**
 * Shows why a family cannot be checked yet, instead of findings: no tree,
 * a tree that contradicts itself, or nobody but the user in it.
 */
export function ReviewGate({ started, pedigree, referenceYear, children }: ReviewGateProps) {
  if (!started) {
    return (
      <Card title={t('review.empty.title')}>
        <p>{t('review.empty.body')}</p>
        <Link className="kt-button kt-button--primary" to={ROUTES.build}>
          {t('review.empty.link')}
        </Link>
      </Card>
    );
  }

  const errors = validatePedigree(pedigree, { referenceYear }).filter(
    (issue) => issue.severity === 'error',
  );
  if (errors.length > 0) {
    return (
      <div className="kt-notice kt-notice--error" role="alert">
        <h2>{t('review.invalid.title')}</h2>
        <p>{t('review.invalid.body')}</p>
        <ul className="kt-review__issues">
          {errors.map((issue) => {
            const people = issue.personIds
              .filter((id) => id in pedigree.persons)
              .map((id) => personName(pedigree, id));
            const message =
              people.length > 0
                ? t('review.invalid.people', { message: issue.message, people: people.join(', ') })
                : issue.message;
            return (
              <li key={`${issue.code}|${issue.personIds.join(',')}`}>
                <span>{message}</span>{' '}
                <Link
                  className="link-target"
                  to={buildLink(issue.personIds.find((id) => id in pedigree.persons))}
                  aria-label={t('review.invalid.fixLabel', { message })}
                >
                  {t('review.invalid.fix')}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // Someone adopted into the family whose birth parents are not recorded: say that their
  // biological history is unknown, rather than treating the gap as a healthy family.
  const parentKinds = pedigree.parentLinks
    .filter((link) => link.childId === pedigree.probandId)
    .map((link) => link.kind);
  const adoptedIn =
    parentKinds.includes('adoptive') && parentKinds.filter((kind) => kind === 'biological').length < 2;
  // Biological parents who share an ancestor in the tree. The guidelines here do not
  // account for it, so it is said plainly for the doctor rather than left out.
  const [parentA, parentB] = pedigree.parentLinks
    .filter((link) => link.childId === pedigree.probandId && link.kind === 'biological')
    .map((link) => link.parentId);
  const parentsRelated =
    parentA !== undefined && parentB !== undefined && relationshipTo(pedigree, parentA, parentB).bloodline;
  const notes = (
    <>
      {adoptedIn ? (
        <div className="kt-notice kt-review__note" role="note" aria-label={t('review.adopted.title')}>
          <p>{t('review.adopted.title')}</p>
          {t('review.adopted.body')}
        </div>
      ) : null}
      {parentsRelated ? (
        <div className="kt-notice kt-review__note" role="note" aria-label={t('review.consanguinity.title')}>
          <p>{t('review.consanguinity.title')}</p>
          {t('review.consanguinity.body')}
        </div>
      ) : null}
    </>
  );

  if (relativesOf(pedigree, pedigree.probandId, 3).length === 0) {
    return (
      <div className="stack">
        {notes}
        <Card title={t('review.alone.title')}>
          <p>{t(adoptedIn ? 'review.alone.adoptedBody' : 'review.alone.body')}</p>
          <Link className="kt-button kt-button--primary" to={buildLink(pedigree.probandId, 'biologicalParent')}>
            {t('review.alone.link')}
          </Link>
        </Card>
        <div id="completeness">
          <CompletenessPanel pedigree={pedigree} referenceYear={referenceYear} />
        </div>
      </div>
    );
  }

  return (
    <>
      {notes}
      {children}
    </>
  );
}
