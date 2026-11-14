import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`Token --${name} not found`);
  return match[1].trim();
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// The palette is fixed by the design brief (docs/DESIGN.md).
const palette = {
  paper: '#f4ecdc',
  card: '#fffbf2',
  ink: '#17163f',
  blue: '#2b2d8f',
  coral: '#ff7a59',
  mustard: '#f4c542',
  mint: '#9adbc0',
  magenta: '#b0307a',
  muted: '#3c3b66',
  tan: '#cbbf9f',
} as const;

describe('design tokens', () => {
  it.each(Object.entries(palette))('--color-%s is %s', (name, hex) => {
    expect(token(`color-${name}`).toLowerCase()).toBe(hex);
  });

  it('keeps the card and button shape from the brief', () => {
    expect(token('border')).toBe('var(--border-width) solid var(--color-ink)');
    expect(token('border-width')).toBe('2px');
    expect(token('radius')).toBe('4px');
    expect(token('shadow')).toBe('4px 4px 0 var(--color-ink)');
    expect(token('shadow-pressed')).toBe('2px 2px 0 var(--color-ink)');
    expect(token('focus-ring')).toBe('3px solid var(--color-blue)');
    expect(token('focus-offset')).toBe('2px');
    expect(token('touch-target')).toBe('44px');
  });

  it.each([
    ['ink', 'paper'],
    ['ink', 'card'],
    ['ink', 'coral'],
    ['ink', 'mustard'],
    ['ink', 'mint'],
    ['ink', 'tan'],
    ['muted', 'paper'],
    ['muted', 'card'],
    ['card', 'blue'],
    ['blue', 'paper'],
    ['blue', 'card'],
  ] as const)('%s text on %s meets WCAG AA (4.5:1)', (fg, bg) => {
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
