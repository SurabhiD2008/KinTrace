import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPedigree, createSamplePedigree } from '../../../src/domain';
import { setLocale } from '../../../src/i18n';
import { parseCounts } from '../../../src/pages/method/counts';
import { listGuidelines } from '../../../src/guidelines';
import { pedigreeStore } from '../../../src/state/store';
import { address, renderAt } from './reviewHelpers';

afterEach(() => setLocale('en'));

describe('landing page', () => {
  it('renders every section with the final copy', () => {
    renderAt('/', null);
    expect(screen.getByRole('marquee')).toHaveAccessibleName('FREE / PRIVATE / NO ACCOUNT / NOT A DIAGNOSIS / RUNS ON YOUR DEVICE');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const name of ['How it works', 'What it checks', 'Method', 'FAQ']) expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your family history is your cheapest genetic test.');
    expect(document.querySelector('.kt-hero__mark')).toHaveTextContent('cheapest genetic test');
    expect(screen.getByText('Draw your family tree. Pick a published guideline. See exactly which referral criteria your history meets, and who triggered them.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Start your tree' })[0]).toHaveAttribute('href', '/build');
    expect(screen.getByText('NOT A DIAGNOSIS')).toBeInTheDocument();
    for (const name of ['Rules, not guesses', 'Private by design', 'Shows what it doesn’t know', 'How it works', 'What it checks', 'Guidelines disagree. KinTrace shows how.', 'What KinTrace refuses to do', 'Questions']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    for (const label of ['Section 01', 'Section 02', 'Section 03', 'Section 04', 'Section 05']) expect(screen.getByText(label)).toBeInTheDocument();
    for (const struck of ['Risk percentages', 'AI verdicts', 'Hidden gaps']) expect(screen.getByText(struck).tagName).toBe('S');
    expect(screen.getByText('KinTrace.')).toBeInTheDocument();
  });

  it('draws the live sample family with the cancer evidence ringed', () => {
    renderAt('/', null);
    const figure = screen.getByRole('img', { name: /sample family/ });
    const ringed = [...figure.querySelectorAll('[data-evidence="true"]')].map((n) => n.getAttribute('data-static-person')).sort();
    expect(ringed).toEqual(['maunt', 'mgm', 'mother']);
  });

  it('shows the live heart comparison for the sample family', () => {
    renderAt('/', null);
    const table = screen.getByRole('table', { name: 'Live comparison for the sample family' });
    const rows = within(table).getAllByRole('row').slice(1).map((row) => row.textContent);
    expect(rows).toEqual(['NICE CG71Worth discussingFather', 'DLCN family-history itemNo criteria metNobody', 'NICE NG238Worth discussingFather']);
  });

  it('FAQ answers are honest and open from the keyboard-focusable summaries', async () => {
    renderAt('/', null);
    const question = screen.getByText('Where does my data go?');
    expect(question.tagName).toBe('SUMMARY');
    const details = question.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    question.focus();
    expect(question).toHaveFocus();
    await userEvent.click(question);
    expect(details.open).toBe(true);
    expect(details).toHaveTextContent('Nothing is sent anywhere unless you turn on the optional "Use AI" switch');
    expect(screen.getByText(/Unknown is never treated as healthy/)).toBeInTheDocument();
    expect(screen.getByText(/Show the report to a clinician where you live/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read the method' })).toHaveAttribute('href', '/method');
  });

  it('Try the sample family loads it and opens the findings', async () => {
    renderAt('/', null);
    await userEvent.click(screen.getByRole('button', { name: 'Try the sample family' }));
    expect(address()).toBe('/findings');
    expect(pedigreeStore.getState().pedigree).toEqual(createSamplePedigree());
  });

  it('asks before replacing a tree the user already has', async () => {
    renderAt('/', createPedigree({ sex: 'female' }));
    await userEvent.click(screen.getByRole('button', { name: 'Try the sample family' }));
    const dialog = screen.getByRole('dialog', { name: 'Replace your family tree?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(address()).toBe('/');
    expect(Object.keys(pedigreeStore.getState().pedigree.persons)).toHaveLength(1);
  });

  it('switches language from the selector, everywhere, and notes the English that remains', async () => {
    renderAt('/', null);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'es' } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tu historia familiar es tu prueba genética más barata.');
    expect(screen.getByRole('note')).toHaveTextContent('Parte del texto está en inglés.');
    expect(document.documentElement.lang).toBe('es');
    fireEvent.change(screen.getByRole('combobox', { name: 'Idioma' }), { target: { value: 'en' } });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('method page', () => {
  it('lists every guideline and every rule from the registry', () => {
    renderAt('/method', null);
    for (const guideline of listGuidelines()) {
      expect(screen.getByRole('heading', { name: guideline.name })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: guideline.sourceTitle })).toHaveAttribute('href', guideline.sourceUrl);
    }
    const rules = listGuidelines().flatMap((g) => g.rules);
    expect(document.querySelectorAll('[data-rule]')).toHaveLength(rules.length);
    expect(screen.getAllByText('11 November 2026').length).toBe(5);
  });

  it('says what KinTrace does not do and how unknown data is handled', () => {
    renderAt('/method', null);
    expect(screen.getByRole('heading', { name: 'What KinTrace does not do' })).toBeInTheDocument();
    expect(screen.getByText(/No model-based findings/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How unknown data is handled' })).toBeInTheDocument();
  });

  it('shows the recorded test counts and the golden results from the running engine', () => {
    renderAt('/method', createSamplePedigree());
    expect(screen.getByText(/Latest full test run: [\d,]+ unit and component tests and [\d,]+ end-to-end tests, all passing\./)).toBeInTheDocument();
    const golden = screen.getByRole('table', { name: 'The sample family, evaluated by the code running in this page' });
    expect(within(golden).getAllByRole('row').slice(1).map((r) => r.textContent)).toEqual([
      'NICE CG164Meets criteriaMother, Maternal grandmother, Maternal aunt',
      'Amsterdam IINo criteria metNobody',
      'NICE CG71Worth discussingFather',
      'DLCN family-history itemNo criteria metNobody',
      'NICE NG238Worth discussingFather',
    ]);
  });

  it('reads the recorded counts, or none when the file is malformed', () => {
    expect(parseCounts({ unit: 20, e2e: 4 })).toEqual({ unit: 20, e2e: 4 });
    for (const bad of [null, 'x', {}, { unit: -1, e2e: 4 }, { unit: 2.5, e2e: 4 }, { unit: 20 }]) expect(parseCounts(bad)).toBeNull();
  });
});

describe('landing footer', () => {
  it('ends with the credit line, right-aligned, in every language', () => {
    renderAt('/', null);
    const footer = screen.getByRole('contentinfo');
    const credit = within(footer).getByText('Made by Surabhi Datta');
    expect(credit).toHaveClass('kt-landing__credit', 'heading');
    expect(footer.lastElementChild).toBe(credit);
    for (const [locale, text] of [['es', 'Hecho por Surabhi Datta'], ['hi', 'सुरभि दत्ता द्वारा बनाया गया']] as const) {
      act(() => setLocale(locale));
      expect(within(screen.getByRole('contentinfo')).getByText(text)).toBeInTheDocument();
    }
  });
});
