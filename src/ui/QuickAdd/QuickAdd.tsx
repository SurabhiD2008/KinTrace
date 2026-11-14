import { useId, useMemo, useRef, useState } from 'react';
import type { Pedigree, PersonId } from '../../domain';
import { MAX_INPUT_LENGTH, loadAiPreference, parseText, planEntry, resolveEntries, saveAiPreference } from '../../parser';
import type { Decision, ParseOutcome, UnparsedReason } from '../../parser';
import { t } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Button } from '../Button';
import { Card } from '../Card';
import { Suggestion } from './Suggestion';
import './QuickAdd.css';

export interface QuickAddProps {
  pedigree: Pedigree;
  /** Saves a new tree as one undoable step. */
  onApply(next: Pedigree): void;
  /** Opens a person's details so the user can change what was added. */
  onEdit(personId: PersonId): void;
  /** Injected in tests; the real one asks the AI service only when the user has turned it on. */
  parse?: typeof parseText;
}

const EXAMPLES: MessageKey[] = ['quick.example.1', 'quick.example.2', 'quick.example.3'];

/**
 * Free text in, suggestions out. Nothing changes the tree until the user
 * accepts a suggestion; each Accept, and each Accept all, is one undo step.
 */
export function QuickAdd({ pedigree, onApply, onEdit, parse = parseText }: QuickAddProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [useAi, setUseAi] = useState(() => loadAiPreference());
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<(ParseOutcome & { source: string }) | null>(null);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [announcement, setAnnouncement] = useState('');
  const [emptyHint, setEmptyHint] = useState(false);
  // Each run gets a number; an answer for anything but the latest run is stale and dropped.
  const runId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const tooLong = text.length > MAX_INPUT_LENGTH;
  const pending = useMemo(
    () => (outcome ? outcome.result.entries.filter((entry) => !done.has(entry.id)) : []),
    [outcome, done],
  );
  const resolution = useMemo(() => resolveEntries(pedigree, pending, decisions), [pedigree, pending, decisions]);

  const run = async () => {
    if (busy || tooLong) return;
    if (text.trim() === '') {
      setEmptyHint(true);
      return;
    }
    setEmptyHint(false);
    setBusy(true);
    runId.current += 1;
    const mine = runId.current;
    controller.current = new AbortController();
    try {
      const result = await parse(text, { useAi, locale: navigator.language || 'en', signal: controller.current.signal });
      if (mine !== runId.current) return;
      setOutcome({ ...result, source: text });
      setDone(new Set());
      setDecisions({});
      const count = result.result.entries.length;
      setAnnouncement(
        count === 0 ? t('quick.announce.none') : count === 1 ? t('quick.announce.one') : t('quick.announce.many', { count }),
      );
    } finally {
      if (mine === runId.current) {
        setBusy(false);
        controller.current = null;
      }
    }
  };

  /** Stops waiting for the AI service; whatever it answers later is dropped. */
  const cancel = () => {
    runId.current += 1;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setAnnouncement(t('quick.cancelled'));
  };

  const finish = (ids: string[]) => setDone((current) => new Set([...current, ...ids]));

  const acceptOne = (entryId: string, thenEdit: boolean) => {
    const entry = pending.find((e) => e.id === entryId);
    if (!entry) return;
    const { preview, pedigree: next } = planEntry(pedigree, entry, decisions[entryId] ?? {});
    if (preview.status !== 'ready') return;
    onApply(next);
    finish([entryId]);
    if (thenEdit && preview.targetId !== null) onEdit(preview.targetId);
  };

  const acceptAll = () => {
    const ready = resolution.previews.filter((p) => p.status === 'ready').map((p) => p.entryId);
    if (ready.length === 0) return;
    // One save, so one undo takes the whole batch back.
    onApply(resolution.pedigree);
    finish(ready);
  };

  const toggleAi = (on: boolean) => {
    setUseAi(on);
    saveAiPreference(on);
  };

  const unparsed = outcome?.result.unparsed ?? [];
  const reason = (code: UnparsedReason) => t(`quick.reason.${code}` as MessageKey);
  const readyCount = resolution.previews.filter((p) => p.status === 'ready').length;

  return (
    <Card title={t('quick.title')}>
      <div className="kt-quick">
        <div className="kt-field">
          <label htmlFor={`${id}-text`}>{t('quick.label')}</label>
          <p id={`${id}-help`} className="muted kt-quick__help">
            {t('quick.help')}
          </p>
          <textarea
            id={`${id}-text`}
            rows={4}
            value={text}
            aria-describedby={`${id}-help ${id}-count`}
            aria-invalid={tooLong}
            onChange={(event) => setText(event.target.value)}
          />
          <p id={`${id}-count`} className={tooLong ? 'kt-field__error' : 'muted kt-quick__count'}>
            {tooLong ? t('quick.tooLong', { max: MAX_INPUT_LENGTH }) : t('quick.count', { count: text.length, max: MAX_INPUT_LENGTH })}
          </p>
        </div>

        <div className="kt-quick__examples" role="group" aria-label={t('quick.examples')}>
          <span className="muted">{t('quick.examples')}:</span>
          {EXAMPLES.map((key) => (
            <button key={key} type="button" className="kt-chip" onClick={() => setText(t(key))}>
              {t(key)}
            </button>
          ))}
        </div>

        <label className="kt-check">
          <input
            type="checkbox"
            checked={useAi}
            aria-describedby={`${id}-ai`}
            onChange={(event) => toggleAi(event.target.checked)}
          />
          {t('quick.ai.label')}
        </label>
        <p id={`${id}-ai`} className="muted kt-quick__help">
          {t('quick.ai.explain')}
        </p>

        <div className="row">
          <Button variant="primary" aria-disabled={busy || tooLong} onClick={() => void run()}>
            {busy ? t('quick.parsing') : t('quick.parse')}
          </Button>
          {busy ? <Button onClick={cancel}>{t('quick.cancel')}</Button> : null}
        </div>
        {emptyHint ? <p className="kt-field__error">{t('quick.empty')}</p> : null}

        <p className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </p>

        {outcome?.fellBack ? <p className="kt-notice">{t('quick.ai.fallback')}</p> : null}

        {outcome && pending.length > 0 ? (
          <section className="kt-quick__results" aria-labelledby={`${id}-results`}>
            <div className="kt-quick__results-head">
              <h3 id={`${id}-results`}>{t('quick.suggestions')}</h3>
              <div className="row">
                <Button variant="primary" disabled={readyCount === 0} onClick={acceptAll}>
                  {t('quick.acceptAll')}
                </Button>
                <Button onClick={() => finish(pending.map((e) => e.id))}>{t('quick.rejectAll')}</Button>
              </div>
            </div>
            <ul className="kt-quick__list">
              {pending.map((entry, index) => {
                const preview = resolution.previews[index];
                if (!preview) return null;
                return (
                  <Suggestion
                    key={entry.id}
                    entry={entry}
                    preview={preview}
                    source={outcome.source}
                    fromAi={outcome.result.engine === 'ai'}
                    current={pedigree}
                    after={resolution.pedigree}
                    decision={decisions[entry.id] ?? {}}
                    onDecide={(decision) => setDecisions((current) => ({ ...current, [entry.id]: decision }))}
                    onAccept={() => acceptOne(entry.id, false)}
                    onEdit={() => acceptOne(entry.id, true)}
                    onReject={() => finish([entry.id])}
                  />
                );
              })}
            </ul>
          </section>
        ) : null}

        {unparsed.length > 0 ? (
          <section className="kt-quick__unparsed" aria-labelledby={`${id}-unparsed`}>
            <h3 id={`${id}-unparsed`}>{t('quick.unparsed.title')}</h3>
            <p>{t('quick.unparsed.intro')}</p>
            <ul>
              {unparsed.map((item, index) => (
                <li key={`${item.reason}-${index}`}>
                  {item.text.trim() === '' ? reason(item.reason) : t('quick.unparsed.item', { text: item.text, reason: reason(item.reason) })}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Card>
  );
}
