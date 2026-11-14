import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPedigree, createSamplePedigree, deserialize } from '../../../src/domain';
import type { Pedigree } from '../../../src/domain';
import { setLocale } from '../../../src/i18n';
import { buildReport, reportText, withoutNames } from '../../../src/pages/report/model';
import { renderAt } from './reviewHelpers';

/** The sample family with real-looking names, so hiding them is visible. */
function named(): Pedigree {
  const sample = createSamplePedigree();
  const names: Record<string, string> = { mother: 'Asha Rao', father: 'Vikram Rao', maunt: 'Leela Iyer', mgm: 'Kamala Iyer', proband: 'Priya Rao' };
  const persons = Object.fromEntries(
    Object.entries(sample.persons).map(([id, person]) => [id, names[id] ? { ...person, displayName: names[id], notes: `Note about ${names[id]}` } : person]),
  );
  return { ...sample, persons };
}
const NAMES = ['Asha Rao', 'Vikram Rao', 'Leela Iyer', 'Kamala Iyer', 'Priya Rao'];
const options = { hideNames: false, referenceYear: 2026, today: new Date('2026-11-12T12:00:00Z') };

describe('report model', () => {
  it('builds the sample family questions from templates, naming relatives by relationship', () => {
    const model = buildReport(createSamplePedigree(), options);
    expect(model.questions).toEqual([
      'My mother had breast cancer at 38, my maternal grandmother had breast cancer at 52 and my maternal aunt had ovarian cancer at 44. Do these meet criteria for genetic counselling?',
      'My father had a heart attack at 57. Should my cholesterol be checked for familial hypercholesterolaemia, and should my family history be part of my heart health check?',
      'Some details are missing (my mother). Is it worth finding them out before deciding about a referral?',
    ]);
    expect(model.date).toBe('Prepared on 12 November 2026.');
    expect(model.sources).toHaveLength(5);
    expect(model.sources[0]?.text).toBe('NICE CG164. Published June 2013, last updated November 2023. Rules last checked against the source on 11 November 2026.');
  });

  it('lists each guideline with its result, the relatives and ages, and self-reported flags', () => {
    const model = buildReport(createSamplePedigree(), options);
    const cg164 = model.findings.find((f) => f.guidelineId === 'nice-cg164');
    expect(cg164?.status).toBe('meets');
    expect(cg164?.relatives.map((r) => [r.text, r.selfReported])).toEqual([
      ['Mother (38)', true],
      ['Maternal grandmother (52)', true],
      ['Maternal aunt (44)', true],
    ]);
    expect(model.findings.map((f) => [f.name, f.status])).toEqual([
      ['NICE CG164', 'meets'],
      ['Amsterdam II', 'none'],
      ['NICE CG71', 'discuss'],
      ['DLCN family-history item', 'none'],
      ['NICE NG238', 'discuss'],
    ]);
  });

  it('plain text has the three headline findings, the questions and the footer', () => {
    const text = reportText(buildReport(createSamplePedigree(), options));
    expect(text).toContain('- NICE CG164: Meets criteria. Relatives: Mother (38), self-reported;');
    expect(text).toContain('- Amsterdam II: No criteria met.');
    expect(text).toContain('- NICE CG71: Worth discussing. Relatives: Father (57), self-reported.');
    expect(text).toContain('1. My mother had breast cancer at 38');
    expect(text.endsWith('Generated on this device by KinTrace. Not a diagnosis. Compares your entries with published criteria only.')).toBe(true);
  });

  it('with names hidden, no typed name appears anywhere, including the gaps', () => {
    const ped = named();
    const shown = JSON.stringify(buildReport(ped, options));
    expect(shown).toContain('Asha Rao');
    const hidden = JSON.stringify(buildReport(ped, { ...options, hideNames: true })) + reportText(buildReport(ped, { ...options, hideNames: true }));
    for (const name of NAMES) expect(hidden).not.toContain(name);
    const stripped = withoutNames(ped);
    expect(Object.values(stripped.persons).some((p) => p.displayName !== undefined || p.notes !== undefined)).toBe(false);
  });

  it('caps long lists so the sheet stays one page', () => {
    let ped = createPedigree({ sex: 'female' });
    const model = buildReport(ped, options);
    expect(model.unknown.length).toBeLessThanOrEqual(5);
    ped = createSamplePedigree();
    expect(buildReport(ped, options).unknown).toHaveLength(5);
    expect(buildReport(ped, options).unknownMore).toBe(4);
  });
});

describe('/report page', () => {
  afterEach(() => setLocale('en'));

  it('switches paper size, and the printer gets the same size', async () => {
    renderAt('/report', createSamplePedigree());
    const paper = () => document.querySelector('.kt-paper');
    // The printer size comes from named @page rules in report.css, chosen by data-paper on the
    // page (an inline <style> would break the Content-Security-Policy). The printed size itself
    // is checked in tests/e2e/report.spec.ts from the PDF width.
    const sheet = () => document.querySelector('.kt-report');
    expect(paper()).toHaveAttribute('data-paper', 'a4');
    expect(sheet()).toHaveAttribute('data-paper', 'a4');
    expect(document.querySelector('style')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Paper size'), 'US Letter');
    expect(paper()).toHaveAttribute('data-paper', 'letter');
    expect(paper()).toHaveClass('kt-paper--letter');
    expect(sheet()).toHaveAttribute('data-paper', 'letter');
  });

  it('Hide names removes every typed name from the page, the tree included', async () => {
    renderAt('/report', named());
    const paper = () => document.querySelector('.kt-paper')?.textContent ?? '';
    expect(paper()).toContain('Asha Rao');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Hide names' }));
    for (const name of NAMES) expect(document.body.textContent).not.toContain(name);
    expect(paper()).toContain('Mother (38)');
  });

  it('copies the report as plain text', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAt('/report', createSamplePedigree());
    await userEvent.click(screen.getByRole('button', { name: 'Copy as plain text' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('NICE CG164: Meets criteria'));
    expect(document.querySelector('.kt-report__status')).toHaveTextContent('Copied.');
  });

  it('says so when the browser blocks copying', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new Error('denied'); }) }, configurable: true });
    renderAt('/report', createSamplePedigree());
    await userEvent.click(screen.getByRole('button', { name: 'Copy as plain text' }));
    expect(document.querySelector('.kt-report__status')).toHaveTextContent('Copying was blocked by the browser.');
  });

  it('downloads JSON that loads back, without names when they are hidden', async () => {
    let saved = '';
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      void blob.text().then((text) => (saved = text));
      return 'blob:report';
    });
    URL.revokeObjectURL = vi.fn();
    renderAt('/report', named());
    await userEvent.click(screen.getByRole('checkbox', { name: 'Hide names' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }));
    await waitFor(() => expect(saved).not.toBe(''));
    const loaded = deserialize(saved);
    expect(loaded.ok).toBe(true);
    for (const name of NAMES) expect(saved).not.toContain(name);
    URL.createObjectURL = realCreate;
  });

  it('prints with the browser print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderAt('/report', createSamplePedigree());
    await userEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('rings the evidence people on the static tree and shows the disclaimer footer', () => {
    renderAt('/report', createSamplePedigree());
    const ringed = [...document.querySelectorAll('[data-static-person][data-evidence="true"]')].map((n) => n.getAttribute('data-static-person')).sort();
    expect(ringed).toEqual(['father', 'maunt', 'mgm', 'mother']);
    expect(within(document.querySelector('.kt-paper') as HTMLElement).getByText(/^Generated on this device by KinTrace/)).toBeInTheDocument();
  });

  it('never shows a blank report: no tree, or a tree that contradicts itself', () => {
    renderAt('/report', null);
    expect(screen.getByRole('link', { name: 'Go to the builder' })).toBeInTheDocument();
    expect(document.querySelector('.kt-paper')).toBeNull();
    const sample = createSamplePedigree();
    const mother = sample.persons.mother;
    if (!mother) throw new Error('no mother');
    renderAt('/report', { ...sample, persons: { ...sample.persons, mother: { ...mother, conditions: mother.conditions.map((c) => ({ ...c, ageAtOnset: 90 })) } } });
    expect(screen.getAllByRole('heading', { name: 'Fix these first' }).length).toBeGreaterThan(0);
  });

  it('shows report headings in Hindi, with the English-fallback note', () => {
    setLocale('hi');
    renderAt('/report', createSamplePedigree());
    expect(screen.getByRole('heading', { level: 1, name: 'पारिवारिक स्वास्थ्य इतिहास सारांश' })).toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'अनुवाद संबंधी सूचना' })).toHaveTextContent('कुछ पाठ अंग्रेज़ी में है।');
  });
});
