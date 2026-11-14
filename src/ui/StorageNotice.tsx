import { t } from '../i18n';
import { usePedigreeStore } from '../state/store';
import { Button } from './Button';

/**
 * What every page says about saving on this device: a tree that could not be
 * opened, storage that is blocked or full, and a change made in another tab.
 */
export function StorageNotice() {
  const loadErrors = usePedigreeStore((state) => state.loadErrors);
  const saveFailed = usePedigreeStore((state) => state.saveFailed);
  const storageBlocked = usePedigreeStore((state) => state.storageBlocked);
  const otherTabChanged = usePedigreeStore((state) => state.otherTabChanged);
  const reloadFromStorage = usePedigreeStore((state) => state.reloadFromStorage);
  const keepThisTab = usePedigreeStore((state) => state.keepThisTab);

  return (
    <div className="page kt-storage-notices" aria-label={t('storage.label')} role="region">
      {loadErrors.length > 0 ? (
        <div className="kt-notice kt-notice--error" role="alert">
          <p>{t('build.loadFailed')}</p>
          <ul>
            {loadErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <p>{t('storage.loadFailedNext')}</p>
        </div>
      ) : null}
      {storageBlocked ? (
        <p className="kt-notice kt-notice--error" role="alert">
          {t('storage.blocked')}
        </p>
      ) : saveFailed ? (
        <p className="kt-notice kt-notice--error" role="alert">
          {t('build.saveFailed')}
        </p>
      ) : null}
      {otherTabChanged ? (
        <div className="kt-notice kt-notice--error" role="alert">
          <p>{t('storage.otherTab')}</p>
          <p>{t('storage.otherTabBody')}</p>
          <div className="row">
            <Button variant="primary" onClick={reloadFromStorage}>
              {t('storage.reload')}
            </Button>
            <Button onClick={keepThisTab}>{t('storage.keepThis')}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
