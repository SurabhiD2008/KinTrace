import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ageOf } from '../../domain';
import type { Pedigree, PersonId } from '../../domain';
import { t } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Button, buildLink } from '../../ui';
import { capitalise, conditionName, personName, relatedTwice, relationshipLabel } from '../../ui/pedigree/describe';

export interface PersonPopoverProps {
  pedigree: Pedigree;
  personId: PersonId;
  referenceYear: number;
  onClose(): void;
}

/** Read-only details for one person. Nothing here can change the tree. */
export function PersonPopover({ pedigree, personId, referenceYear, onClose }: PersonPopoverProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [personId]);

  const person = pedigree.persons[personId];
  if (!person) return null;
  const name = personName(pedigree, personId);
  const relation = relationshipLabel(pedigree, personId);
  const age = ageOf(person, referenceYear);
  const ageLine =
    person.vitalStatusUnknown === true
      ? t('popover.vitalUnknown')
      : person.deceased
        ? age === null
          ? t('popover.deceased')
          : t('popover.diedAt', { age })
        : age === null
          ? t('popover.ageUnknown')
          : t('popover.age', { age });

  return (
    <section
      className="kt-popover"
      aria-label={t('popover.label', { name })}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="kt-popover__head">
        <h3 ref={heading} tabIndex={-1}>
          {name}
        </h3>
        <Button onClick={onClose}>{t('drawer.close')}</Button>
      </div>
      {relation !== name ? <p className="muted">{relation}</p> : null}
      {relatedTwice(pedigree, personId) ? <p className="muted">{t('rel.consanguinity')}</p> : null}
      <p>{ageLine}</p>
      {person.conditions.length === 0 ? (
        <p>{t('drawer.noConditions')}</p>
      ) : (
        <ul>
          {person.conditions.map((condition) => {
            const certaintyKey: MessageKey = `drawer.certainty.${condition.confirmed}`;
            const params = {
              name: capitalise(conditionName(condition)),
              certainty: t(certaintyKey),
            };
            return (
              <li key={condition.id}>
                {condition.ageAtOnset === undefined
                  ? t('popover.conditionNoAge', params)
                  : t('popover.conditionAt', { ...params, age: condition.ageAtOnset })}
              </li>
            );
          })}
        </ul>
      )}
      {person.healthHistoryUnknown === true ? <p>{t('popover.historyUnknown')}</p> : null}
      <p className="muted">{t('popover.readOnly')}</p>
      <Link className="link-target" to={buildLink(personId)}>
        {t('popover.edit')}
      </Link>
    </section>
  );
}
