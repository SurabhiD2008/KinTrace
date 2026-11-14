import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSamplePedigree } from '../../../src/domain';
import { renderAt } from './reviewHelpers';

// Hard rule 1, checked on what a person actually sees. The disclaimer is the
// one sentence allowed to say "diagnose" and "chances"; the completeness
// measure is the one place allowed a percent sign.
const FORBIDDEN = /risk of|chance|likely|probability|diagnos/i;

function visibleText(...remove: string[]): string {
  const copy = document.body.cloneNode(true) as HTMLElement;
  for (const selector of remove) copy.querySelectorAll(selector).forEach((node) => node.remove());
  copy.querySelectorAll('[data-testid="address"]').forEach((node) => node.remove());
  return copy.textContent ?? '';
}

function check() {
  expect(visibleText('[data-disclaimer]')).not.toMatch(FORBIDDEN);
  expect(visibleText('[data-completeness]')).not.toContain('%');
  // The checks are not vacuous: both exceptions are on the page.
  expect(document.querySelector('[data-disclaimer]')?.textContent).toMatch(/diagnose/);
  expect(document.querySelector('[data-completeness]')?.textContent).toMatch(/%/);
}

describe('copy lint on the sample family', () => {
  it('/findings with every card, every other criterion and the legend open', async () => {
    renderAt('/findings', createSamplePedigree());
    for (const toggle of screen.getAllByRole('button', { expanded: false })) {
      if (toggle.closest('section[data-guideline]')) await userEvent.click(toggle);
    }
    document.querySelectorAll('details').forEach((details) => {
      details.open = true;
    });
    await userEvent.click(screen.getByRole('button', { name: 'Show what the symbols mean' }));
    expect(document.querySelectorAll('[aria-expanded="true"]').length).toBeGreaterThanOrEqual(5);
    await userEvent.click(screen.getAllByRole('button', { name: 'Show Mother on the family tree' })[0] as HTMLElement);
    check();
  });

  it.each(['heart', 'cancer'])('/compare on %s', async (domain) => {
    renderAt(`/compare?domain=${domain}`, createSamplePedigree());
    fireEvent.click(screen.getByRole('button', { name: 'Show what the symbols mean' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    check();
  });
});
