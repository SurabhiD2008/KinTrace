import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createSamplePedigree } from '../domain';
import { compareGuidelines, evaluateAll } from '../guidelines';
import { t } from '../i18n';
import type { MessageKey } from '../i18n';
import { usePedigreeStore } from '../state/store';
import { Button, Dialog, ROUTES, Sticker } from '../ui';
import { LanguageSelect } from '../ui/LanguageSelect';
import { StaticPedigree } from '../ui/pedigree/StaticPedigree';
import { personName } from '../ui/pedigree/describe';
import './landing/landing.css';

const STATUS_KEY = { meets: 'status.meets', discuss: 'status.discuss', none: 'status.none' } as const;

function SectionLabel({ number }: { number: string }) {
  return <p className="kt-landing__label">{t('landing.section', { number })}</p>;
}

const HOW: { number: string; title: MessageKey; body: MessageKey }[] = [
  { number: '1', title: 'landing.how.draw.title', body: 'landing.how.draw.body' },
  { number: '2', title: 'landing.how.check.title', body: 'landing.how.check.body' },
  { number: '3', title: 'landing.how.share.title', body: 'landing.how.share.body' },
];
const PROMISES: { title: MessageKey; body: MessageKey }[] = [
  { title: 'landing.promise.risk.title', body: 'landing.promise.risk.body' },
  { title: 'landing.promise.ai.title', body: 'landing.promise.ai.body' },
  { title: 'landing.promise.gaps.title', body: 'landing.promise.gaps.body' },
];
const FAQ: { q: MessageKey; a: MessageKey }[] = [
  { q: 'landing.faq.diagnosis.q', a: 'landing.faq.diagnosis.a' },
  { q: 'landing.faq.data.q', a: 'landing.faq.data.a' },
  { q: 'landing.faq.unknown.q', a: 'landing.faq.unknown.a' },
  { q: 'landing.faq.countries.q', a: 'landing.faq.countries.a' },
  { q: 'landing.faq.trust.q', a: 'landing.faq.trust.a' },
];

export function LandingPage() {
  const navigate = useNavigate();
  const started = usePedigreeStore((state) => state.started);
  const replace = usePedigreeStore((state) => state.replace);
  const [confirming, setConfirming] = useState(false);
  // The sample family drives the figure and the comparison band, computed by the real engine.
  const sample = useMemo(() => createSamplePedigree(), []);
  const cancerEvidence = useMemo(
    () => evaluateAll(sample).find((result) => result.guidelineId === 'nice-cg164')?.evidence ?? [],
    [sample],
  );
  const heart = useMemo(() => compareGuidelines(sample, 'cardio'), [sample]);

  const loadSample = () => {
    replace(createSamplePedigree());
    setConfirming(false);
    navigate(ROUTES.findings);
  };

  return (
    <div className="kt-landing">
      <div className="kt-ticker" aria-label={t('landing.ticker')} role="marquee">
        <div className="kt-ticker__track" aria-hidden="true">
          {[0, 1, 2, 3].map((copy) => (
            <span key={copy} className="kt-ticker__item">
              {t('landing.ticker')}
            </span>
          ))}
        </div>
      </div>

      <header className="kt-landing__nav">
        <Link to={ROUTES.home} className="kt-landing__logo heading">
          {t('app.name')}
        </Link>
        <nav aria-label={t('landing.nav')} className="kt-landing__links">
          <a href="#how" className="link-target">{t('landing.nav.how')}</a>
          <a href="#checks" className="link-target">{t('landing.nav.checks')}</a>
          <Link to={ROUTES.method} className="link-target">{t('landing.nav.method')}</Link>
          <a href="#faq" className="link-target">{t('landing.nav.faq')}</a>
        </nav>
        <div className="kt-landing__actions">
          <LanguageSelect />
          <Link to={ROUTES.build} className="kt-button kt-button--primary">
            {t('landing.start')}
          </Link>
        </div>
      </header>

      <main>
        <section className="kt-hero" aria-labelledby="hero-title">
          <div className="kt-hero__copy">
            <h1 id="hero-title" className="kt-hero__title">
              {t('landing.hero.before')}
              <mark className="kt-hero__mark">{t('landing.hero.highlight')}</mark>
              {t('landing.hero.after')}
            </h1>
            <p className="kt-hero__sub">{t('landing.hero.sub')}</p>
            <div className="row">
              <Link to={ROUTES.build} className="kt-button kt-button--primary">
                {t('landing.start')}
              </Link>
              <Button onClick={() => (started ? setConfirming(true) : loadSample())}>{t('landing.trySample')}</Button>
            </div>
          </div>
          <figure className="kt-hero__plate">
            <p className="kt-hero__fig heading" aria-hidden="true">{t('landing.fig')}</p>
            <StaticPedigree className="kt-hero__tree" pedigree={sample} highlightIds={cancerEvidence} label={t('landing.figLabel')} />
            <figcaption>{t('landing.figCaption')}</figcaption>
            <p className="kt-hero__sticker heading">{t('landing.sticker')}</p>
          </figure>
        </section>

        <section className="kt-trust" aria-label={t('landing.trust')}>
          {(['rules', 'private', 'unknown'] as const).map((item) => (
            <div key={item} className="kt-trust__item">
              <h2 className="kt-trust__title">{t(`landing.trust.${item}.title`)}</h2>
              <p>{t(`landing.trust.${item}.body`)}</p>
            </div>
          ))}
        </section>

        <section id="how" className="kt-section" aria-labelledby="how-title">
          <SectionLabel number="01" />
          <h2 id="how-title">{t('landing.how.title')}</h2>
          <ol className="kt-how">
            {HOW.map((step) => (
              <li key={step.number} className="kt-card kt-how__card">
                <span className="kt-how__number heading" aria-hidden="true">{step.number}</span>
                <h3>{t(step.title)}</h3>
                <p>{t(step.body)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="checks" className="kt-section" aria-labelledby="checks-title">
          <SectionLabel number="02" />
          <h2 id="checks-title">{t('landing.checks.title')}</h2>
          <div className="kt-checks">
            <div className="kt-card">
              <h3>{t('landing.checks.cancer.title')}</h3>
              <ul>
                <li>{t('landing.checks.cancer.breast')}</li>
                <li>{t('landing.checks.cancer.lynch')}</li>
              </ul>
            </div>
            <div className="kt-card">
              <h3>{t('landing.checks.heart.title')}</h3>
              <p>{t('landing.checks.heart.body')}</p>
            </div>
            <div className="kt-checks__next">
              <h3>{t('landing.checks.next.title')}</h3>
              <p>{t('landing.checks.next.body')}</p>
            </div>
          </div>
        </section>

        <section className="kt-band" aria-labelledby="band-title">
          <div className="kt-band__inner">
            <div>
              <SectionLabel number="03" />
              <h2 id="band-title">{t('landing.band.title')}</h2>
              <p>{t('landing.band.body')}</p>
            </div>
            <div className="kt-band__card">
              <table className="kt-band__table">
                <caption>{t('landing.band.caption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('compare.col.guideline')}</th>
                    <th scope="col">{t('compare.col.result')}</th>
                    <th scope="col">{t('compare.col.counted')}</th>
                  </tr>
                </thead>
                <tbody>
                  {heart.rows.map((row) => (
                    <tr key={row.guideline.id}>
                      <th scope="row">{row.guideline.shortName}</th>
                      <td>
                        <Sticker status={row.status}>{t(STATUS_KEY[row.status])}</Sticker>
                      </td>
                      <td>{row.counted.length === 0 ? t('compare.nobody') : row.counted.map((id) => personName(sample, id)).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Link to={ROUTES.compare} className="link-target">{t('landing.band.link')}</Link>
            </div>
          </div>
        </section>

        <section className="kt-section" aria-labelledby="promises-title">
          <SectionLabel number="04" />
          <h2 id="promises-title">{t('landing.promises.title')}</h2>
          <ul className="kt-promises">
            {PROMISES.map((promise) => (
              <li key={promise.title}>
                <h3 className="kt-promises__title">
                  <s>{t(promise.title)}</s>
                </h3>
                <p>{t(promise.body)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" className="kt-section" aria-labelledby="faq-title">
          <SectionLabel number="05" />
          <h2 id="faq-title">{t('landing.faq.title')}</h2>
          <div className="kt-faq">
            {FAQ.map((item) => (
              <details key={item.q} className="kt-faq__item">
                <summary>{t(item.q)}</summary>
                <p>{t(item.a)}</p>
                {item.q === 'landing.faq.trust.q' ? (
                  <Link to={ROUTES.method} className="link-target">{t('landing.faq.trust.link')}</Link>
                ) : null}
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="kt-landing__footer">
        <p className="kt-landing__wordmark heading" aria-hidden="true">{t('landing.wordmark')}</p>
        <p>{t('landing.footer.privacy')}</p>
        <p className="muted-on-ink">{t('landing.footer.disclaimer')}</p>
        <p className="kt-landing__credit heading">{t('landing.footer.credit')}</p>
      </footer>

      {confirming ? (
        <Dialog title={t('landing.replace.title')} onClose={() => setConfirming(false)}>
          <p>{t('landing.replace.body')}</p>
          <div className="kt-dialog__actions">
            <Button variant="primary" onClick={loadSample}>{t('landing.replace.confirm')}</Button>
            <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
