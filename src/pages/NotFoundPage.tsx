import { Link } from 'react-router-dom';
import { t } from '../i18n';
import { Card } from '../ui';

export function NotFoundPage() {
  return (
    <main className="page stack">
      <Link to="/" className="logo heading kt-wordmark" aria-label={t('notFound.brandLabel')}>
        {t('app.name')}
      </Link>
      <Card>
        <h1>{t('notFound.title')}</h1>
        <p>{t('notFound.body')}</p>
        <Link to="/" className="kt-button kt-button--primary">
          {t('notFound.home')}
        </Link>
      </Card>
    </main>
  );
}
