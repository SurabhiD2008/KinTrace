import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPedigree, createSamplePedigree } from '../../../src/domain';
import type { Pedigree } from '../../../src/domain';
import { DISCLAIMER, address, renderAt, ringed } from './reviewHelpers';

const card = (name: RegExp) => {
  const toggle = screen.getByRole('button', { name });
  const section = toggle.closest('section');
  if (!section) throw new Error('card has no section');
  return { toggle, section };
};
const CG164 = /Familial breast cancer/;
const CG71 = /Familial hypercholesterolaemia/;
const AMSTERDAM = /Lynch syndrome/;
const DLCN = /Dutch Lipid Clinic Network/;
const NG238 = /Cardiovascular disease/;

const cardOrder = () =>
  [...document.querySelectorAll('section[data-guideline]')].map((s) => s.getAttribute('data-guideline'));

describe('findings: sample family', () => {
  beforeEach(() => renderAt('/findings', createSamplePedigree()));

  it('shows the title, the family summary and the banner', () => {
    expect(screen.getByRole('heading', { level: 1, name: 'Findings' })).toBeInTheDocument();
    expect(screen.getByText('9 relatives in your family tree.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Data completeness \d+%$/ })).toHaveAttribute('href', '#completeness');
    expect(screen.getByRole('complementary', { name: 'Important' })).toHaveTextContent(DISCLAIMER);
  });

  it('banner cannot be dismissed: it has no control and stays after interaction', async () => {
    const banner = screen.getByRole('complementary', { name: 'Important' });
    expect(within(banner).queryByRole('button')).not.toBeInTheDocument();
    expect(within(banner).queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Heart' }));
    await userEvent.click(card(CG71).toggle);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByRole('complementary', { name: 'Important' })).toHaveTextContent(DISCLAIMER);
  });

  it('sorts cards strongest first, then cancer before heart, and gives each a status sticker', () => {
    expect(cardOrder()).toEqual(['nice-cg164', 'nice-cg71', 'nice-ng238', 'amsterdam-ii', 'dlcn-family-history']);
    expect(within(card(CG164).toggle).getByText('Meets criteria')).toHaveAttribute('data-status', 'meets');
    expect(within(card(CG71).toggle).getByText('Worth discussing')).toHaveAttribute('data-status', 'discuss');
    expect(within(card(AMSTERDAM).toggle).getByText('No criteria met')).toHaveAttribute('data-status', 'none');
    expect(card(CG164).section).toHaveTextContent(
      'National Institute for Health and Care Excellence (NICE). Published for England',
    );
  });

  it('expands only the strongest finding at first, and rings exactly its evidence people', () => {
    expect(card(CG164).toggle).toHaveAttribute('aria-expanded', 'true');
    for (const name of [CG71, NG238, AMSTERDAM, DLCN]) {
      expect(card(name).toggle).toHaveAttribute('aria-expanded', 'false');
    }
    expect(ringed()).toEqual(['maunt', 'mgm', 'mother']);
    expect(document.querySelector('[data-person-id="father"]')).toHaveClass('kt-node--dim');
    expect(document.querySelector('[data-person-id="mother"]')).not.toHaveClass('kt-node--dim');
  });

  it('expands and collapses a card, moving the highlight to the card opened last', async () => {
    const cg71 = card(CG71);
    await userEvent.click(cg71.toggle);
    expect(cg71.toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(cg71.section).getByText(/^Worth discussing: a personal or first-degree family history/)).toBeInTheDocument();
    expect(ringed()).toEqual(['father']);

    await userEvent.click(cg71.toggle);
    expect(cg71.toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(cg71.section).queryByRole('list', { name: 'Steps of this criterion' })).not.toBeInTheDocument();
    expect(ringed()).toEqual(['maunt', 'mgm', 'mother']);

    await userEvent.click(card(CG164).toggle);
    expect(ringed()).toEqual([]);
    expect(document.querySelector('.kt-node--dim')).toBeNull();
  });

  it('labels every step result with text and an icon: Met, Not met, Unknown', async () => {
    const steps = within(card(CG164).section).getAllByRole('list', { name: 'Steps of this criterion' })[0];
    if (!steps) throw new Error('no steps');
    expect(within(steps).getAllByText('Met')).toHaveLength(3);

    await userEvent.click(card(AMSTERDAM).toggle);
    const amsterdam = card(AMSTERDAM).section;
    expect(within(amsterdam).getAllByText('Not met').length).toBeGreaterThan(0);
    expect(within(amsterdam).getAllByText('Unknown')).toHaveLength(2);
    expect(within(amsterdam).getAllByText('Clinician confirms')).toHaveLength(2);
    for (const badge of document.querySelectorAll('[data-step-result]')) {
      expect(badge.querySelector('[aria-hidden="true"]')?.textContent).toMatch(/^[✓✕?]$/);
      expect(badge.textContent).toMatch(/(Met|Not met|Unknown)$/);
    }
  });

  it('tags self-reported evidence', () => {
    const steps = within(card(CG164).section).getAllByRole('list', { name: 'Steps of this criterion' })[0];
    if (!steps) throw new Error('no steps');
    expect(within(steps).getAllByText('Self-reported').length).toBeGreaterThan(0);
  });

  it('uses the no-criteria wording and never reassures', async () => {
    await userEvent.click(card(DLCN).toggle);
    expect(within(card(DLCN).section).getByText(
      "Your recorded history does not meet this guideline's criteria. This is not a clearance: the guideline only covers the relatives and details you entered.",
    )).toBeInTheDocument();
    expect(within(card(CG164).section).queryByText(/does not meet this guideline/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/reassur|\bsafe\b|nothing to worry|all clear|low risk|you are fine/i);
  });

  it('lists what would change a could-be-met finding, each linking to the builder at that field', () => {
    const change = within(card(CG164).section).getByRole('heading', { name: 'What would change this' }).parentElement;
    if (!change) throw new Error('no section');
    expect(within(change).getByRole('link', {
      name: 'It is not recorded whether one or both breasts were affected for your mother.',
    })).toHaveAttribute('href', '/build?person=mother&field=conditionLaterality');
  });

  it('shows a relative from a chip: read-only details, and focus goes back on close', async () => {
    const chip = within(card(CG164).section).getAllByRole('button', { name: 'Show Mother on the family tree' })[0];
    if (!chip) throw new Error('no chip');
    await userEvent.click(chip);
    const details = screen.getByRole('region', { name: 'Details for Mother' });
    expect(within(details).getByRole('heading', { name: 'Mother' })).toHaveFocus();
    expect(details).toHaveTextContent('Breast cancer, started at 38. Reported (told by family).');
    expect(within(details).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(details).getByRole('link', { name: 'Open in the builder' })).toHaveAttribute('href', '/build?person=mother');
    expect(document.querySelector('[data-person-id="mother"]')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(details, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Details for Mother' })).not.toBeInTheDocument();
    expect(chip).toHaveFocus();
  });

  it('has no way to change the tree', () => {
    expect(screen.queryByRole('button', { name: /^Add / })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the completeness panel with its note', () => {
    expect(screen.getByRole('progressbar', { name: /^Data completeness \d+%$/ })).toBeInTheDocument();
    expect(screen.getByText(/Missing information is never treated as healthy\./)).toBeInTheDocument();
  });
});

describe('findings: filter chips and the address', () => {
  it('filters by domain and keeps the choice in the query string', async () => {
    renderAt('/findings', createSamplePedigree());
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Heart' }));
    expect(address()).toBe('/findings?show=heart');
    expect(cardOrder()).toEqual(['nice-cg71', 'nice-ng238', 'dlcn-family-history']);
    expect(screen.getByRole('button', { name: 'Heart' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Cancer' }));
    expect(address()).toBe('/findings?show=cancer');
    expect(cardOrder()).toEqual(['nice-cg164', 'amsterdam-ii']);

    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(address()).toBe('/findings');
    expect(cardOrder()).toHaveLength(5);
  });

  it('reads the filter from the address, and treats an unknown value as All', () => {
    renderAt('/findings?show=cancer', createSamplePedigree());
    expect(screen.getByRole('button', { name: 'Cancer' })).toHaveAttribute('aria-pressed', 'true');
    expect(cardOrder()).toEqual(['nice-cg164', 'amsterdam-ii']);
  });

  it('treats an unknown filter value as All', () => {
    renderAt('/findings?show=%3Cscript%3E', createSamplePedigree());
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(cardOrder()).toHaveLength(5);
  });
});

describe('findings: empty and edge states', () => {
  it('with no tree yet, links to the builder and shows no findings', () => {
    renderAt('/findings', null);
    expect(screen.getByRole('heading', { name: 'No family tree yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the builder' })).toHaveAttribute('href', '/build');
    expect(document.querySelector('section[data-guideline]')).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Important' })).toBeInTheDocument();
  });

  it('with only the user, explains that nothing can be checked and shows the top gaps', () => {
    renderAt('/findings', createPedigree({ sex: 'female', ageNow: 30 }));
    expect(screen.getByRole('heading', { name: 'Nothing can be checked yet' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    const fixes = screen.getAllByRole('link', { name: /^Fix: / });
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0]).toHaveAttribute('href', expect.stringMatching(/^\/build\?person=/));
    expect(document.querySelector('section[data-guideline]')).toBeNull();
  });

  it('with a tree that contradicts itself, shows the problems with links to fix them instead of findings', () => {
    const sample = createSamplePedigree();
    const mother = sample.persons.mother;
    if (!mother) throw new Error('no mother');
    const broken: Pedigree = {
      ...sample,
      persons: {
        ...sample.persons,
        mother: { ...mother, conditions: mother.conditions.map((c) => ({ ...c, ageAtOnset: 70 })) },
      },
    };
    renderAt('/findings', broken);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { name: 'Fix these first' })).toBeInTheDocument();
    expect(alert).toHaveTextContent('A condition is recorded as starting at an age the person has not reached yet. (Mother)');
    expect(within(alert).getByRole('link', { name: /^Fix in the builder: / })).toHaveAttribute('href', '/build?person=mother');
    expect(document.querySelector('section[data-guideline]')).toBeNull();
  });
});
