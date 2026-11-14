import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/App';
import { en } from '../../src/i18n/en';
import { t } from '../../src/i18n';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App shell', () => {
  it('opens on the landing page with the product name and the hero headline', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'KinTrace' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your family history is your cheapest genetic test.');
  });

  it('shows a not-found page with a way home for unknown addresses', () => {
    renderAt('/no-such-page');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the start' })).toHaveAttribute('href', '/');
  });
});

describe('t()', () => {
  it('returns the string for a key', () => {
    expect(t('status.meets')).toBe('Meets criteria');
  });

  // Hard rule 1: the UI never shows a risk percentage or probability.
  it('has no percentage or probability wording in any string', () => {
    for (const value of Object.values(en)) {
      expect(value).not.toMatch(/\d\s*%|probab|likelihood|chance of/i);
    }
  });
});
