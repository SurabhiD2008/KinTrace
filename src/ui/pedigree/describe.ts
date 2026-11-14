import { ageOf, relationshipTo } from '../../domain';
import type { Condition, Pedigree, PersonId } from '../../domain';
import { t } from '../../i18n';
import type { MessageKey } from '../../i18n';

// Words for people and conditions, shared by the drawing, the drawer and dialogs.

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The name shown for a person: their own label, else "You" or their relationship. */
export function personName(ped: Pedigree, id: PersonId): string {
  const person = ped.persons[id];
  if (person?.displayName !== undefined && person.displayName.trim() !== '') {
    return person.displayName;
  }
  if (id === ped.probandId) return t('canvas.you');
  return capitalise(relationshipTo(ped, ped.probandId, id).label);
}

/** "mother", "maternal aunt"; "you" for the proband. */
export function relationshipLabel(ped: Pedigree, id: PersonId): string {
  return id === ped.probandId
    ? t('canvas.you')
    : capitalise(relationshipTo(ped, ped.probandId, id).label);
}

/** True when the person is related to the proband through more than one line (consanguinity). */
export function relatedTwice(ped: Pedigree, id: PersonId): boolean {
  return id !== ped.probandId && relationshipTo(ped, ped.probandId, id).consanguinity;
}

export function conditionName(condition: Pick<Condition, 'code'>): string {
  const key: MessageKey = `cond.name.${condition.code}`;
  return t(key);
}

/** The short text under a symbol: "Breast 38", or "Breast ?" when the age is not known. */
export function conditionShort(condition: Condition): string {
  const key: MessageKey = `cond.short.${condition.code}`;
  return condition.ageAtOnset === undefined
    ? t('cond.shortNoAge', { label: t(key) })
    : t('cond.shortAtAge', { label: t(key), age: condition.ageAtOnset });
}

/** "Mother, 60, breast cancer at 38" for screen readers. */
export function personAriaLabel(ped: Pedigree, id: PersonId, referenceYear?: number): string {
  const person = ped.persons[id];
  if (!person) return '';
  const parts = [personName(ped, id)];
  const age = ageOf(person, referenceYear);
  if (person.deceased) {
    parts.push(age === null ? t('aria.deceased') : t('aria.diedAt', { age }));
  } else if (age !== null) {
    parts.push(String(age));
  }
  for (const condition of person.conditions) {
    const name = conditionName(condition);
    const text =
      condition.ageAtOnset === undefined
        ? t('aria.conditionNoAge', { name })
        : t('aria.conditionAtAge', { name, age: condition.ageAtOnset });
    parts.push(condition.confirmed === 'unsure' ? t('aria.unsure', { text }) : text);
  }
  if (person.healthHistoryUnknown === true) parts.push(t('aria.historyUnknown'));
  return parts.join(', ');
}
