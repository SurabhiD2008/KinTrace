import { useId, useState } from 'react';
import type { Sex } from '../../domain';
import { t } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { Button, Card } from '../../ui';

export interface StartCardProps {
  onStart(details: { sex: Sex; ageNow?: number }): void;
  onLoadSample(): void;
  onImport(): void;
}

const SEXES: readonly Sex[] = ['female', 'male', 'intersex', 'unknown'];

/** Shown when nothing is saved: three ways to begin. */
export function StartCard({ onStart, onLoadSample, onImport }: StartCardProps) {
  const id = useId();
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex>('unknown');
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    const trimmed = age.trim();
    if (trimmed === '') {
      onStart({ sex });
    } else if (!/^\d+$/.test(trimmed) || Number(trimmed) > 120) {
      setError(t('start.ageError'));
    } else {
      onStart({ sex, ageNow: Number(trimmed) });
    }
  };

  return (
    <Card title={t('start.title')}>
      <p>{t('start.privacy')}</p>
      <div className="kt-start">
        <form
          className="kt-start__option"
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          <h3>{t('start.me.title')}</h3>
          <div className="kt-field">
            <label htmlFor={`${id}-age`}>{t('start.me.age')}</label>
            <input
              id={`${id}-age`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={age}
              aria-invalid={error !== null}
              aria-describedby={error !== null ? `${id}-error` : undefined}
              onChange={(event) => {
                setAge(event.target.value);
                setError(null);
              }}
            />
            {error !== null ? (
              <p id={`${id}-error`} className="kt-field__error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="kt-field">
            <label htmlFor={`${id}-sex`}>{t('start.me.sex')}</label>
            <select id={`${id}-sex`} value={sex} onChange={(event) => setSex(event.target.value as Sex)}>
              {SEXES.map((option) => {
                const key: MessageKey = `sex.${option}`;
                return (
                  <option key={option} value={option}>
                    {t(key)}
                  </option>
                );
              })}
            </select>
          </div>
          <Button type="submit" variant="primary">
            {t('start.me.button')}
          </Button>
        </form>
        <div className="kt-start__option">
          <h3>{t('start.sample.title')}</h3>
          <p>{t('start.sample.body')}</p>
          <Button onClick={onLoadSample}>{t('start.sample.button')}</Button>
        </div>
        <div className="kt-start__option">
          <h3>{t('start.import.title')}</h3>
          <p>{t('start.import.body')}</p>
          <Button onClick={onImport}>{t('start.import.button')}</Button>
        </div>
      </div>
    </Card>
  );
}
