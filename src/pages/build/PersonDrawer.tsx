import { useEffect, useId, useRef, useState } from 'react';
import {
  CONDITION_CODES,
  DOMAIN_OF_CODE,
  removeCondition,
  serialize,
  setCondition,
  updatePerson,
  validatePedigree,
} from '../../domain';
import type {
  Condition,
  ConditionCode,
  ConditionInput,
  Confirmation,
  Laterality,
  MutationResult,
  Pedigree,
  PersonId,
  PersonPatch,
  Sex,
  ValidationIssue,
} from '../../domain';
import { t } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Button } from '../../ui';
import { capitalise, conditionName, personName, relatedTwice, relationshipLabel } from '../../ui/pedigree/describe';

export type DrawerField =
  | 'displayName'
  | 'sex'
  | 'vitalStatus'
  | 'age'
  | 'healthHistory'
  | 'conditionOnset';

export interface PersonDrawerProps {
  pedigree: Pedigree;
  personId: PersonId;
  referenceYear: number;
  /** Changes when the drawer should take focus (opened, or a gap was clicked). */
  focusToken: number;
  /** The field to focus when the token changes; the heading when absent. */
  focusField: DrawerField | null;
  apply(mutation: (pedigree: Pedigree) => MutationResult): MutationResult;
  onClose(): void;
  onRequestDelete(id: PersonId): void;
}

const SEX_OPTIONS: readonly Sex[] = ['female', 'male', 'intersex', 'unknown'];
const CERTAINTY_OPTIONS: readonly Confirmation[] = ['confirmed', 'reported', 'unsure'];
const LATERALITY_OPTIONS: readonly Laterality[] = ['left', 'right', 'bilateral'];
const HEART_CODES: readonly ConditionCode[] = ['coronary_event', 'stroke', 'sudden_cardiac_death'];
const CANCER_CODES = CONDITION_CODES.filter((code) => DOMAIN_OF_CODE[code] === 'cancer');
const HEART_AND_METABOLIC_CODES = CONDITION_CODES.filter((code) => DOMAIN_OF_CODE[code] !== 'cancer');

const issueKey = (issue: ValidationIssue) => `${issue.code}|${issue.personIds.join(',')}`;

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  /** Tries to save; returns a message when the value is refused. `null` clears the field. */
  onCommit(value: number | null): string | null;
  disabled?: boolean;
  field?: DrawerField;
}

/**
 * A whole-number field. What is typed stays on screen, but only a value that
 * passes validation is saved; otherwise the reason is shown under the field.
 */
function NumberField({ label, value, onCommit, disabled, field }: NumberFieldProps) {
  const id = useId();
  const shown = (saved: number | undefined) => (saved === undefined ? '' : String(saved));
  const [state, setState] = useState({ draft: shown(value), error: null as string | null, saved: value });
  // The saved value changed (a save, an undo): show it and drop any old message.
  if (state.saved !== value) setState({ draft: shown(value), error: null, saved: value });
  const { draft, error } = state;

  const onChange = (text: string) => {
    const trimmed = text.trim();
    const refusal =
      trimmed === ''
        ? onCommit(null)
        : /^\d+$/.test(trimmed)
          ? onCommit(Number(trimmed))
          : t('drawer.error.wholeNumber');
    // On success the saved value changes and the line above takes over.
    setState((current) => ({ ...current, draft: text, error: refusal }));
  };

  return (
    <div className="kt-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={draft}
        disabled={disabled}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? `${id}-error` : undefined}
        data-field={field}
        onChange={(event) => onChange(event.target.value)}
      />
      {error !== null ? (
        <p id={`${id}-error`} className="kt-field__error" role="alert">
          {t('drawer.error.notSaved', { reason: error })}
        </p>
      ) : null}
    </div>
  );
}

function toInput(condition: Condition): ConditionInput {
  return {
    id: condition.id,
    code: condition.code,
    ageUnknown: condition.ageUnknown,
    confirmed: condition.confirmed,
    ...(condition.ageAtOnset !== undefined && { ageAtOnset: condition.ageAtOnset }),
    ...(condition.subtype !== undefined && { subtype: condition.subtype }),
    ...(condition.laterality !== undefined && { laterality: condition.laterality }),
  };
}

function without(input: ConditionInput, key: 'ageAtOnset' | 'laterality' | 'subtype'): ConditionInput {
  const { ageAtOnset, laterality, subtype, ...rest } = input;
  return {
    ...rest,
    ...(key !== 'ageAtOnset' && ageAtOnset !== undefined && { ageAtOnset }),
    ...(key !== 'laterality' && laterality !== undefined && { laterality }),
    ...(key !== 'subtype' && subtype !== undefined && { subtype }),
  };
}

function ConditionOptions() {
  const option = (code: ConditionCode) => (
    <option key={code} value={code}>
      {capitalise(conditionName({ code }))}
    </option>
  );
  return (
    <>
      <optgroup label={t('drawer.group.cancer')}>{CANCER_CODES.map(option)}</optgroup>
      <optgroup label={t('drawer.group.heart')}>{HEART_AND_METABOLIC_CODES.map(option)}</optgroup>
    </>
  );
}

interface ConditionRowProps {
  condition: Condition;
  index: number;
  focusOnset: boolean;
  save(input: ConditionInput): string | null;
  remove(): void;
}

function ConditionRow({ condition, index, focusOnset, save, remove }: ConditionRowProps) {
  const id = useId();
  const input = toInput(condition);
  const name = capitalise(conditionName(condition));
  return (
    <li className="kt-condition">
      <fieldset>
        <legend>{t('drawer.condition.legend', { number: index + 1, name })}</legend>
        <div className="kt-field">
          <label htmlFor={`${id}-code`}>{t('drawer.condition.type')}</label>
          <select
            id={`${id}-code`}
            value={condition.code}
            onChange={(event) => {
              // A different condition does not keep the old one's details.
              const next = without(without(input, 'subtype'), 'laterality');
              save({ ...next, code: event.target.value as ConditionCode });
            }}
          >
            <ConditionOptions />
          </select>
        </div>
        <NumberField
          label={t('drawer.condition.onset')}
          value={condition.ageAtOnset}
          disabled={condition.ageUnknown}
          {...(focusOnset && { field: 'conditionOnset' as const })}
          onCommit={(value) =>
            save(value === null ? without(input, 'ageAtOnset') : { ...input, ageAtOnset: value })
          }
        />
        <label className="kt-check">
          <input
            type="checkbox"
            checked={condition.ageUnknown}
            onChange={(event) =>
              save(
                event.target.checked
                  ? { ...without(input, 'ageAtOnset'), ageUnknown: true }
                  : { ...input, ageUnknown: false },
              )
            }
          />
          <span>{t('drawer.condition.ageUnknown')}</span>
        </label>
        {condition.code === 'breast' ? (
          <div className="kt-field">
            <label htmlFor={`${id}-side`}>{t('drawer.condition.laterality')}</label>
            <select
              id={`${id}-side`}
              value={condition.laterality ?? 'unknown'}
              onChange={(event) => {
                const value = event.target.value as Laterality;
                save(value === 'unknown' ? without(input, 'laterality') : { ...input, laterality: value });
              }}
            >
              <option value="unknown">{t('drawer.laterality.unknown')}</option>
              {LATERALITY_OPTIONS.map((side) => {
                const key: MessageKey = `drawer.laterality.${side}`;
                return (
                  <option key={side} value={side}>
                    {t(key)}
                  </option>
                );
              })}
            </select>
          </div>
        ) : null}
        {HEART_CODES.includes(condition.code) ? (
          <label className="kt-check">
            <input
              type="checkbox"
              checked={condition.subtype === 'premature'}
              onChange={(event) =>
                save(event.target.checked ? { ...input, subtype: 'premature' } : without(input, 'subtype'))
              }
            />
            <span>{t('drawer.condition.premature')}</span>
          </label>
        ) : null}
        <div className="kt-field">
          <label htmlFor={`${id}-certainty`}>{t('drawer.condition.certainty')}</label>
          <select
            id={`${id}-certainty`}
            value={condition.confirmed}
            onChange={(event) => save({ ...input, confirmed: event.target.value as Confirmation })}
          >
            {CERTAINTY_OPTIONS.map((certainty) => {
              const key: MessageKey = `drawer.certainty.${certainty}`;
              return (
                <option key={certainty} value={certainty}>
                  {t(key)}
                </option>
              );
            })}
          </select>
        </div>
        <Button onClick={remove}>{t('drawer.condition.remove', { name })}</Button>
      </fieldset>
    </li>
  );
}

export function PersonDrawer(props: PersonDrawerProps) {
  const { pedigree, personId, referenceYear, apply } = props;
  const person = pedigree.persons[personId];
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const [newCode, setNewCode] = useState<ConditionCode | ''>('');

  useEffect(() => {
    const target =
      props.focusField === null
        ? null
        : root.current?.querySelector<HTMLElement>(`[data-field="${props.focusField}"]`);
    (target ?? heading.current)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the token decides when focus moves; arrow-key selection must not steal it
  }, [props.focusToken]);

  if (!person) return null;

  /** Saves a change only if it introduces no new validation error; returns the reason otherwise. */
  const commit = (mutate: (ped: Pedigree) => MutationResult): string | null => {
    const result = mutate(pedigree);
    if (!result.ok) return result.error.message;
    // Re-entering the value that is already saved must not add an empty undo step.
    if (serialize(result.pedigree) === serialize(pedigree)) return null;
    const errorsIn = (ped: Pedigree) =>
      validatePedigree(ped, { referenceYear }).filter((issue) => issue.severity === 'error');
    const existing = new Set(errorsIn(pedigree).map(issueKey));
    const introduced = errorsIn(result.pedigree).find((issue) => !existing.has(issueKey(issue)));
    if (introduced) return introduced.message;
    apply(() => result);
    return null;
  };
  const patch = (changes: PersonPatch) => commit((ped) => updatePerson(ped, personId, changes));

  const name = personName(pedigree, personId);
  const vitalStatus =
    person.vitalStatusUnknown === true ? 'unknown' : person.deceased ? 'deceased' : 'living';
  const issues = validatePedigree(pedigree, { referenceYear }).filter((issue) =>
    issue.personIds.includes(personId),
  );
  const firstMissingOnset = person.conditions.findIndex(
    (condition) => condition.ageAtOnset === undefined,
  );

  return (
    <aside ref={root} className="kt-drawer" aria-labelledby={`${id}-title`}>
      <div className="kt-drawer__head">
        <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
          {name}
        </h2>
        <Button onClick={props.onClose}>{t('drawer.close')}</Button>
      </div>
      <p className="muted">
        {t('drawer.relationship', { label: relationshipLabel(pedigree, personId) })}
      </p>
      {relatedTwice(pedigree, personId) ? <p className="muted">{t('rel.consanguinity')}</p> : null}

      {issues.length > 0 ? (
        <ul className="kt-drawer__issues" aria-label={t('drawer.issues')}>
          {issues.map((issue) => (
            <li key={issueKey(issue)}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="kt-field">
        <label htmlFor={`${id}-name`}>{t('drawer.displayName')}</label>
        <input
          id={`${id}-name`}
          type="text"
          maxLength={80}
          autoComplete="off"
          value={person.displayName ?? ''}
          data-field="displayName"
          onChange={(event) =>
            patch({ displayName: event.target.value === '' ? null : event.target.value })
          }
        />
      </div>

      <div className="kt-field">
        <label htmlFor={`${id}-sex`}>{t('drawer.sex')}</label>
        <select
          id={`${id}-sex`}
          value={person.sex}
          data-field="sex"
          onChange={(event) => patch({ sex: event.target.value as Sex })}
        >
          {SEX_OPTIONS.map((sex) => {
            const key: MessageKey = `sex.${sex}`;
            return (
              <option key={sex} value={sex}>
                {t(key)}
              </option>
            );
          })}
        </select>
      </div>

      <div className="kt-field">
        <label htmlFor={`${id}-vital`}>{t('drawer.vitalStatus')}</label>
        <select
          id={`${id}-vital`}
          value={vitalStatus}
          data-field="vitalStatus"
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'living') patch({ deceased: false, vitalStatusUnknown: null, ageAtDeath: null });
            else if (value === 'deceased') patch({ deceased: true, vitalStatusUnknown: null, ageNow: null });
            else patch({ deceased: false, vitalStatusUnknown: true, ageAtDeath: null });
          }}
        >
          <option value="living">{t('drawer.vital.living')}</option>
          <option value="deceased">{t('drawer.vital.deceased')}</option>
          <option value="unknown">{t('drawer.vital.unknown')}</option>
        </select>
      </div>

      {person.deceased ? (
        <NumberField
          key="death"
          label={t('drawer.ageAtDeath')}
          value={person.ageAtDeath}
          field="age"
          onCommit={(value) => patch({ ageAtDeath: value })}
        />
      ) : (
        <NumberField
          key="now"
          label={t('drawer.ageNow')}
          value={person.ageNow}
          field="age"
          onCommit={(value) => patch({ ageNow: value })}
        />
      )}

      <NumberField
        label={t('drawer.birthYear')}
        value={person.birthYear}
        onCommit={(value) =>
          value !== null && (value < 1800 || value > referenceYear)
            ? t('drawer.error.birthYear', { year: referenceYear })
            : patch({ birthYear: value })
        }
      />

      <label className="kt-check">
        <input
          type="checkbox"
          checked={person.healthHistoryUnknown === true}
          data-field="healthHistory"
          onChange={(event) => patch({ healthHistoryUnknown: event.target.checked ? true : null })}
        />
        <span>{t('drawer.healthHistoryUnknown')}</span>
      </label>

      <div className="kt-field">
        <label htmlFor={`${id}-notes`}>{t('drawer.notes')}</label>
        <textarea
          id={`${id}-notes`}
          rows={3}
          maxLength={2000}
          value={person.notes ?? ''}
          onChange={(event) => patch({ notes: event.target.value === '' ? null : event.target.value })}
        />
      </div>

      <h3>{t('drawer.conditions')}</h3>
      {person.conditions.length === 0 ? <p className="muted">{t('drawer.noConditions')}</p> : null}
      <ul className="kt-drawer__conditions">
        {person.conditions.map((condition, index) => (
          <ConditionRow
            key={condition.id}
            condition={condition}
            index={index}
            focusOnset={index === firstMissingOnset}
            save={(input) => commit((ped) => setCondition(ped, personId, input))}
            remove={() => commit((ped) => removeCondition(ped, personId, condition.id))}
          />
        ))}
      </ul>
      <div className="kt-drawer__add">
        <div className="kt-field">
          <label htmlFor={`${id}-new`}>{t('drawer.condition.new')}</label>
          <select
            id={`${id}-new`}
            value={newCode}
            onChange={(event) => setNewCode(event.target.value as ConditionCode | '')}
          >
            <option value="">{t('drawer.condition.choose')}</option>
            <ConditionOptions />
          </select>
        </div>
        <Button
          disabled={newCode === ''}
          onClick={() => {
            if (newCode === '') return;
            commit((ped) => setCondition(ped, personId, { code: newCode }));
            setNewCode('');
          }}
        >
          {t('drawer.condition.add')}
        </Button>
      </div>

      {personId !== pedigree.probandId ? (
        <div className="kt-drawer__danger">
          <Button onClick={() => props.onRequestDelete(personId)}>
            {t('drawer.remove', { name })}
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
