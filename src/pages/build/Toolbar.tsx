import { useId } from 'react';
import { Link } from 'react-router-dom';
import { listGuidelines } from '../../guidelines';
import { t } from '../../i18n';
import { Button } from '../../ui';

export interface ToolbarProps {
  guidelineId: string;
  onGuidelineChange(id: string): void;
  started: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  onExport(): void;
  onImport(): void;
}

export function Toolbar(props: ToolbarProps) {
  const id = useId();
  const guidelines = listGuidelines();
  const current = guidelines.find((guideline) => guideline.id === props.guidelineId);

  return (
    <div className="kt-toolbar">
      <div className="kt-field kt-toolbar__guideline">
        <label htmlFor={`${id}-guideline`}>{t('toolbar.guideline')}</label>
        <select
          id={`${id}-guideline`}
          value={props.guidelineId}
          onChange={(event) => props.onGuidelineChange(event.target.value)}
        >
          {guidelines.map((guideline) => (
            <option key={guideline.id} value={guideline.id}>
              {guideline.name}
            </option>
          ))}
        </select>
        {current ? (
          <p className="kt-toolbar__source muted">
            {t('toolbar.source', { publisher: current.publisher, scope: current.countryOrScope })}
          </p>
        ) : null}
      </div>
      <div className="kt-toolbar__buttons" role="group" aria-label={t('toolbar.actions')}>
        <Button disabled={!props.canUndo} onClick={props.onUndo}>
          {t('toolbar.undo')}
        </Button>
        <Button disabled={!props.canRedo} onClick={props.onRedo}>
          {t('toolbar.redo')}
        </Button>
        <Button disabled={!props.started} onClick={props.onExport}>
          {t('toolbar.export')}
        </Button>
        <Button onClick={props.onImport}>{t('toolbar.import')}</Button>
        {props.started ? (
          <Link className="kt-button kt-button--primary" to="/findings">
            {t('toolbar.findings')}
          </Link>
        ) : (
          <Button
            variant="primary"
            aria-disabled="true"
            aria-describedby={`${id}-findings-hint`}
            title={t('toolbar.findingsDisabled')}
          >
            {t('toolbar.findings')}
          </Button>
        )}
      </div>
      {props.started ? null : (
        <p id={`${id}-findings-hint`} className="kt-toolbar__hint muted">
          {t('toolbar.findingsDisabled')}
        </p>
      )}
    </div>
  );
}
