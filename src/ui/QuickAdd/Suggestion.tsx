import { useId } from 'react';
import type { Pedigree } from '../../domain';
import type { Choice, Decision, Preview, ProposedCondition, ProposedEntry } from '../../parser';
import { t } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Button } from '../Button';
import { Sticker } from '../Sticker';
import { capitalise, personName } from '../pedigree/describe';

export interface SuggestionProps {
  entry: ProposedEntry;
  preview: Preview;
  /** The text the suggestion came from, to show the phrase it was read from. */
  source: string;
  fromAi: boolean;
  /** The tree as it is now, and as it would be after the suggestions before this one. */
  current: Pedigree;
  after: Pedigree;
  decision: Decision;
  onDecide(decision: Decision): void;
  onAccept(): void;
  onEdit(): void;
  onReject(): void;
}

const relationLabel = (relation: string) => {
  const key = `quick.rel.${relation}` as MessageKey;
  return key in labelKeys ? t(key) : relation;
};
// The relation keys are a closed list; this guards a label lookup for a value from a choice.
const labelKeys: Record<string, true> = Object.fromEntries(
  ['mother', 'father', 'sister', 'brother', 'half_sister', 'half_brother', 'daughter', 'son',
    'maternal_grandmother', 'maternal_grandfather', 'paternal_grandmother', 'paternal_grandfather',
    'aunt', 'uncle', 'niece', 'nephew', 'cousin', 'grandchild', 'partner', 'self'].map((k) => [`quick.rel.${k}`, true]),
);

const conditionLabel = (code: string) => capitalise(t(`cond.name.${code}` as MessageKey));

function conditionLine(condition: ProposedCondition): string {
  const age =
    condition.ageAtOnset !== undefined
      ? t('quick.age.at', { age: condition.ageAtOnset })
      : condition.ageUnknown
        ? `${t('quick.age.unknown')} ("${condition.ageNote ?? ''}")`
        : t('quick.age.notGiven');
  const certaintyKey: MessageKey = `drawer.certainty.${condition.certainty}`;
  return t('quick.condition', { name: conditionLabel(condition.code), age, certainty: t(certaintyKey) });
}

function optionLabel(choice: Choice, value: string, entry: ProposedEntry, pedigree: Pedigree): string {
  if (value === 'new') return t('quick.choice.new');
  if (value === 'keep') return t('quick.choice.keep');
  if (value === 'replace') return t('quick.choice.replace');
  if (choice.kind === 'side') return value === 'maternal' ? t('quick.side.maternal') : t('quick.side.paternal');
  if (choice.kind === 'option') {
    return entry.ambiguity?.kind === 'condition' ? conditionLabel(value) : relationLabel(value);
  }
  return value in pedigree.persons ? personName(pedigree, value) : value;
}

function choiceQuestion(choice: Choice, entry: ProposedEntry, pedigree: Pedigree): string {
  if (choice.kind === 'conflict' && choice.conflict) {
    const { subject, recorded, proposed, personId } = choice.conflict;
    const name = personId in pedigree.persons ? personName(pedigree, personId) : '';
    const what = subject === 'vital' ? t('drawer.vitalStatus') : capitalise(subject);
    return t('quick.choice.conflict', { subject: what, name, recorded, proposed });
  }
  if (choice.kind === 'option') {
    return entry.ambiguity?.kind === 'condition' ? t('quick.choice.option.condition') : t('quick.choice.option.relation');
  }
  if (choice.kind === 'side') return t('quick.choice.side');
  return choice.kind === 'via' ? t('quick.choice.via') : t('quick.choice.target');
}

/** One proposed entry: the words it came from, what it would change, and the user's controls. */
export function Suggestion(props: SuggestionProps) {
  const { entry, preview, current, after } = props;
  const id = useId();
  const ready = preview.status === 'ready';
  const relation = relationLabel(preview.relation);
  const targetIn = preview.targetId === null ? null : preview.targetIsNew ? after : current;
  const target =
    preview.targetId !== null && targetIn && preview.targetId in targetIn.persons
      ? t(preview.targetIsNew ? 'quick.target.new' : 'quick.target.existing', { name: personName(targetIn, preview.targetId) })
      : t('quick.target.pending', { relation });
  const summary = preview.targetId !== null && targetIn && preview.targetId in targetIn.persons ? personName(targetIn, preview.targetId) : relation;
  const quote = props.source.slice(entry.sourceSpan.start, entry.sourceSpan.end);
  const placeholders = ready ? preview.placeholders.filter((p) => p in after.persons).map((p) => personName(after, p)) : [];
  const statusId = `${id}-status`;

  const setChoice = (choice: Choice, value: string) => {
    const decision: Decision = { ...props.decision };
    if (choice.kind === 'option') decision.option = value;
    else if (choice.kind === 'side') decision.side = value === 'paternal' ? 'paternal' : 'maternal';
    else if (choice.kind === 'target') decision.target = value;
    else if (choice.kind === 'via') decision.via = value;
    else decision.conflicts = { ...decision.conflicts, [choice.key]: value === 'replace' ? 'replace' : 'keep' };
    props.onDecide(decision);
  };

  return (
    <li className="kt-suggestion" data-entry-id={entry.id} data-status={preview.status}>
      <div className="kt-suggestion__head">
        <h3 className="kt-suggestion__title">{target}</h3>
        {props.fromAi ? <Sticker status="neutral">{t('quick.ai.sticker')}</Sticker> : null}
      </div>
      {quote.trim() !== '' ? (
        <p className="kt-suggestion__quote">
          <span className="visually-hidden">{t('quick.from')}: </span>
          <mark>{quote}</mark>
        </p>
      ) : null}

      {entry.conditions.length > 0 && preview.status !== 'ready' && preview.status !== 'nothing_new' ? (
        <ul className="kt-suggestion__facts">
          {entry.conditions.map((condition, index) => (
            <li key={`${condition.code}-${index}`}>{conditionLine(condition)}</li>
          ))}
        </ul>
      ) : null}
      {preview.added.length + preview.filled.length + preview.duplicates.length > 0 ? (
        <ul className="kt-suggestion__facts">
          {preview.added.map((c, i) => (
            <li key={`a${i}`}>
              <strong>{t('quick.condition.added')}:</strong> {conditionLine(c)}
            </li>
          ))}
          {preview.filled.map((c, i) => (
            <li key={`f${i}`}>
              <strong>{t('quick.condition.filled')}:</strong> {conditionLine(c)}
            </li>
          ))}
          {preview.duplicates.map((c, i) => (
            <li key={`d${i}`}>
              <strong>{t('quick.condition.duplicate')}:</strong> {conditionLine(c)}
            </li>
          ))}
        </ul>
      ) : null}
      {preview.markDeceased || (entry.deceased === true && !ready) ? (
        <p>{entry.ageAtDeath !== undefined ? t('quick.deceasedAt', { age: entry.ageAtDeath }) : t('quick.deceased')}</p>
      ) : null}
      {placeholders.length > 0 ? <p className="muted">{t('quick.placeholders', { names: placeholders.join(', ') })}</p> : null}

      {preview.choices.map((choice) => {
        const selectId = `${id}-${choice.key}`;
        return (
          <div key={choice.key} className="kt-field kt-suggestion__choice">
            <label htmlFor={selectId}>{choiceQuestion(choice, entry, current)}</label>
            <select id={selectId} value={choice.value ?? ''} onChange={(event) => setChoice(choice, event.target.value)}>
              {choice.value === undefined ? (
                <option value="" disabled>
                  {t('quick.choice.pick')}
                </option>
              ) : null}
              {choice.options.map((value) => (
                <option key={value} value={value}>
                  {optionLabel(choice, value, entry, current)}
                </option>
              ))}
            </select>
          </div>
        );
      })}

      <p id={statusId} className={preview.status === 'refused' ? 'kt-field__error' : 'muted'}>
        {preview.status === 'refused'
          ? t('quick.refused', { problem: preview.problem ?? t('quick.problem.generic') })
          : preview.status === 'nothing_new'
            ? t('quick.nothingNew')
            : preview.status === 'needs_choice'
              ? t('quick.needsChoice')
              : ''}
      </p>
      <div className="row">
        <Button
          variant="primary"
          disabled={!ready}
          aria-describedby={ready ? undefined : statusId}
          aria-label={t('quick.acceptLabel', { summary })}
          onClick={props.onAccept}
        >
          {t('quick.accept')}
        </Button>
        <Button
          disabled={!ready}
          aria-label={t('quick.editLabel', { summary })}
          title={t('quick.editHint')}
          onClick={props.onEdit}
        >
          {t('quick.edit')}
        </Button>
        <Button aria-label={t('quick.rejectLabel', { summary })} onClick={props.onReject}>
          {t('quick.reject')}
        </Button>
      </div>
    </li>
  );
}
