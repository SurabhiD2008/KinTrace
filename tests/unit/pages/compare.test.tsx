import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSamplePedigree } from '../../../src/domain';
import { family } from '../../fixtures/guidelineFamily';
import { DISCLAIMER, address, renderAt, ringed } from './reviewHelpers';

const row = (name: string) => {
  const header = screen.getByRole('rowheader', { name });
  const tr = header.closest('tr');
  if (!tr) throw new Error('no row');
  return tr;
};
const cell = (name: string, kind: string) => {
  const found = row(name).querySelector(`[data-cell="${kind}"]`);
  if (!found) throw new Error(`no ${kind} cell`);
  return found as HTMLElement;
};

describe('compare: sample family', () => {
  beforeEach(() => renderAt('/compare', createSamplePedigree()));

  it('opens on Heart because the family has a heart condition, with the banner', () => {
    expect(screen.getByRole('heading', { level: 1, name: 'Compare guidelines' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Important' })).toHaveTextContent(DISCLAIMER);
    expect(screen.getByRole('button', { name: 'Heart' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('table', { name: 'Heart guidelines compared for your family' })).toBeInTheDocument();
  });

  it('shows the golden heart table, all driven by the father at 57', () => {
    expect(within(cell('NICE CG71', 'result')).getByText('Worth discussing')).toBeInTheDocument();
    expect(cell('NICE CG71', 'threshold')).toHaveTextContent('You or a first-degree relative, event before age 60');
    expect(within(cell('NICE CG71', 'counted')).getByRole('button', { name: 'Show Father on the family tree' })).toBeInTheDocument();

    expect(within(cell('DLCN family-history item', 'result')).getByText('No criteria met')).toBeInTheDocument();
    expect(cell('DLCN family-history item', 'counted')).toHaveTextContent('Nobody');
    expect(cell('DLCN family-history item', 'not-counted')).toHaveTextContent(
      'Your father, 57: above the under-55 threshold for men',
    );

    // NG238 has no under-55 threshold for men (docs/RULES.md), so the father at 57 is counted.
    expect(within(cell('NICE NG238', 'result')).getByText('Worth discussing')).toBeInTheDocument();
    expect(cell('NICE NG238', 'counted')).toHaveTextContent('Father');
  });

  it('explains why they differ from the thresholds', () => {
    const why = screen.getByRole('region', { name: 'Why they differ' });
    expect(why).toHaveTextContent('under 55 for men and under 60 for women');
    expect(why).toHaveTextContent('That is why this relative is not counted by DLCN family-history item');
  });

  it('rings everyone counted by at least one guideline, with a count badge', () => {
    expect(ringed()).toEqual(['father']);
    expect(document.querySelector('[data-count-for="father"]')).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /^Father, 63.*counted by 2 guidelines$/ })).toBeInTheDocument();
  });

  it('switches to cancer and keeps the choice in the address', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Cancer' }));
    expect(address()).toBe('/compare?domain=cancer');
    expect(screen.getByRole('table', { name: 'Cancer guidelines compared for your family' })).toBeInTheDocument();
    expect(within(cell('NICE CG164', 'result')).getByText('Meets criteria')).toBeInTheDocument();
    expect(ringed()).toEqual(['maunt', 'mgm', 'mother']);
    for (const id of ['maunt', 'mgm', 'mother']) {
      expect(document.querySelector(`[data-count-for="${id}"]`)).toHaveTextContent('1');
    }
  });

  it('opens a counted relative’s details from the table', async () => {
    await userEvent.click(within(cell('NICE CG71', 'counted')).getByRole('button', { name: 'Show Father on the family tree' }));
    expect(screen.getByRole('region', { name: 'Details for Father' })).toHaveTextContent('Heart attack, angina, bypass or stent, started at 57.');
  });
});

describe('compare: other families and states', () => {
  it('opens on Cancer when nobody has a heart condition', () => {
    renderAt('/compare', family({ mom: [['breast', 38]] }));
    expect(screen.getByRole('button', { name: 'Cancer' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reads the domain from the address', () => {
    renderAt('/compare?domain=cancer', createSamplePedigree());
    expect(screen.getByRole('button', { name: 'Cancer' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('with no tree yet, links to the builder', () => {
    renderAt('/compare', null);
    expect(screen.getByRole('link', { name: 'Go to the builder' })).toHaveAttribute('href', '/build');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
