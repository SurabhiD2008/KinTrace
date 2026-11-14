import { useMemo, useState } from 'react';
import { serialize } from '../domain';
import { t } from '../i18n';
import { usePedigreeStore } from '../state/store';
import { Button, Sticker } from '../ui';
import { StaticPedigree } from '../ui/pedigree/StaticPedigree';
import { downloadTextFile } from './build/files';
import { PAPER, STATUS_KEY, buildReport, reportName, reportText, withoutNames } from './report/model';
import type { PaperSize } from './report/model';
import { ReviewGate } from './review/ReviewGate';
import { ReviewHeader } from './review/ReviewHeader';
import './review/review.css';
import './report/report.css';

export function ReportPage() {
  const pedigree = usePedigreeStore((state) => state.pedigree);
  const started = usePedigreeStore((state) => state.started);
  const today = useMemo(() => new Date(), []);
  const referenceYear = today.getFullYear();
  const [paper, setPaper] = useState<PaperSize>('a4');
  const [hideNames, setHideNames] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const model = buildReport(pedigree, { hideNames, referenceYear, today });
  const shown = hideNames ? withoutNames(pedigree) : pedigree;
  const nameFor = (id: string) => reportName(pedigree, id, hideNames);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText(model));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <main className="page kt-review kt-report" data-paper={paper}>
      <div className="kt-report__screen">
        <ReviewHeader title={t('report.pageTitle')} pedigree={started ? pedigree : null} referenceYear={referenceYear} current="report" />
      </div>
      <ReviewGate started={started} pedigree={pedigree} referenceYear={referenceYear}>
        <div className="kt-report__controls kt-report__screen" role="group" aria-label={t('report.controls')}>
          <div className="kt-field">
            <label htmlFor="report-paper">{t('report.paper')}</label>
            <select id="report-paper" value={paper} onChange={(event) => setPaper(event.target.value === 'letter' ? 'letter' : 'a4')}>
              <option value="a4">{t('report.paper.a4')}</option>
              <option value="letter">{t('report.paper.letter')}</option>
            </select>
          </div>
          <label className="kt-check">
            <input type="checkbox" checked={hideNames} aria-describedby="report-hide-help" onChange={(event) => setHideNames(event.target.checked)} />
            {t('report.hideNames')}
          </label>
          <p id="report-hide-help" className="muted kt-report__help">
            {t('report.hideNamesHelp')}
          </p>
          <div className="row">
            <Button variant="primary" onClick={() => window.print()}>
              {t('report.print')}
            </Button>
            <Button onClick={() => downloadTextFile(t('export.fileName'), serialize(shown))}>{t('report.download')}</Button>
            <Button onClick={() => void copy()}>{t('report.copy')}</Button>
          </div>
          <p className="kt-report__status" role="status">
            {copyState === 'copied' ? t('report.copied') : copyState === 'failed' ? t('report.copyFailed') : ''}
          </p>
        </div>

        <div className="kt-report__desk" role="region" aria-label={t('report.preview')} tabIndex={0}>
          <article className={`kt-paper ${PAPER[paper].className}`} data-paper={paper}>
            <header className="kt-paper__head">
              <h1 className="kt-paper__title">{t('report.title')}</h1>
              <p>{model.date}</p>
              <h2>{t('report.sources')}</h2>
              <ul className="kt-paper__sources">
                {model.sources.map((source) => (
                  <li key={source.id}>{source.text}</li>
                ))}
              </ul>
            </header>

            <section className="kt-paper__tree" aria-labelledby="paper-tree">
              <h2 id="paper-tree">{t('report.tree')}</h2>
              <StaticPedigree
                className="kt-paper__svg"
                pedigree={shown}
                highlightIds={model.evidence}
                nameFor={nameFor}
                label={t('report.treeLabel', { count: Object.keys(pedigree.persons).length })}
              />
            </section>

            <section aria-labelledby="paper-findings">
              <h2 id="paper-findings">{t('report.findings')}</h2>
              <table className="kt-paper__table">
                <thead>
                  <tr>
                    <th scope="col">{t('report.col.guideline')}</th>
                    <th scope="col">{t('report.col.result')}</th>
                    <th scope="col">{t('report.col.relatives')}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.findings.map((finding) => (
                    <tr key={finding.guidelineId} data-guideline={finding.guidelineId}>
                      <th scope="row">{finding.name}</th>
                      <td>
                        <Sticker status={finding.status}>{t(STATUS_KEY[finding.status])}</Sticker>
                      </td>
                      <td>
                        {finding.relatives.length === 0
                          ? t('report.none')
                          : finding.relatives.map((relative, index) => (
                              <span key={relative.id}>
                                {index > 0 ? '; ' : ''}
                                {relative.text}
                                {relative.selfReported ? <em className="kt-paper__flag"> {t('report.selfReported')}</em> : null}
                              </span>
                            ))}
                        {finding.more > 0 ? ` ${t('report.more', { count: finding.more })}` : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <div className="kt-paper__columns">
              <section aria-labelledby="paper-unknown">
                <h2 id="paper-unknown">{t('report.unknown')}</h2>
                {model.unknown.length === 0 ? (
                  <p>{t('report.unknownNone')}</p>
                ) : (
                  <ul>
                    {model.unknown.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                    {model.unknownMore > 0 ? <li>{t('gaps.more', { count: model.unknownMore })}</li> : null}
                  </ul>
                )}
              </section>
              <section aria-labelledby="paper-questions">
                <h2 id="paper-questions">{t('report.questions')}</h2>
                <ol>
                  {model.questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ol>
              </section>
            </div>

            <footer className="kt-paper__footer">{t('report.footer')}</footer>
          </article>
        </div>
      </ReviewGate>
    </main>
  );
}
