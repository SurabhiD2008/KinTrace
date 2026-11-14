import { NODE_SIZE } from './layout';

export const HALF = NODE_SIZE / 2;
/** A 3px gap, then the centre of a 3px line. */
export const RING_OFFSET = 4.5;

/** Splits a long name over two lines so neighbours' labels do not collide. */
export function nameLines(name: string): string[] {
  const LIMIT = 16;
  if (name.length <= LIMIT) return [name];
  const words = name.split(' ');
  let first = '';
  while (words[0] !== undefined && (first === '' || first.length + words[0].length < LIMIT)) {
    first = first === '' ? (words.shift() ?? '') : `${first} ${words.shift() ?? ''}`;
  }
  const rest = words.join(' ');
  const second = rest.length > LIMIT + 2 ? `${rest.slice(0, LIMIT)}…` : rest;
  return second === '' ? [first] : [first, second];
}
