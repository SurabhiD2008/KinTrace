import type { PersonId } from '../domain';

/** The app's addresses, in one place. */
export const ROUTES = {
  home: '/',
  build: '/build',
  findings: '/findings',
  compare: '/compare',
  report: '/report',
  method: '/method',
} as const;

/** Query names read by the builder to open a person, optionally at one field. */
export const BUILD_PARAMS = { person: 'person', field: 'field' } as const;

/**
 * The builder with one person opened and, when given, one of their fields
 * focused. Only the tree's internal identifier goes in the address, never a
 * name or any health detail.
 */
export function buildLink(personId?: PersonId, field?: string): string {
  if (personId === undefined) return ROUTES.build;
  const params = new URLSearchParams({ [BUILD_PARAMS.person]: personId });
  if (field !== undefined) params.set(BUILD_PARAMS.field, field);
  return `${ROUTES.build}?${params.toString()}`;
}
