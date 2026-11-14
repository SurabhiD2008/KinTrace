import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from '../../../src/App';
import type { Pedigree } from '../../../src/domain';
import { pedigreeStore } from '../../../src/state/store';

/** Shows the current address so tests can check what the page put in the query string. */
function Address() {
  const location = useLocation();
  return <output data-testid="address">{`${location.pathname}${location.search}`}</output>;
}

export function renderAt(path: string, pedigree: Pedigree | null) {
  pedigreeStore.getState().clearAll();
  localStorage.clear();
  if (pedigree) pedigreeStore.getState().replace(pedigree);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Address />
    </MemoryRouter>,
  );
}

export const address = () => document.querySelector('[data-testid="address"]')?.textContent ?? '';

/** Ids of the people drawn with the evidence ring. */
export const ringed = () =>
  [...document.querySelectorAll('[data-evidence="true"]')]
    .map((node) => node.getAttribute('data-person-id') ?? '')
    .sort();

export const DISCLAIMER =
  'KinTrace compares your family history with published referral criteria. It does not diagnose or estimate your chances of anything. Share the report with a doctor or genetic counsellor.';
