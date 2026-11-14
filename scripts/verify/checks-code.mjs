import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { LOG_DIR, lastLine, run } from './run.mjs';

// Checks on the code itself: lint, types, tests, build, browsers, bundle size, samples.

/** Initial JS budget, gzipped. */
const JS_BUDGET_BYTES = 250 * 1024;
const WIDTHS = '320,390,768,1024,1360';

export function lint() {
  const { code, output } = run('npx eslint . --max-warnings 0', 'lint');
  return { ok: code === 0, summary: code === 0 ? 'no errors, no warnings' : lastLine(output, /problem/) || 'eslint failed' };
}

export function types() {
  const { code, output } = run('npx tsc --noEmit', 'types');
  const errors = (output.match(/error TS\d+/g) ?? []).length;
  return { ok: code === 0, summary: code === 0 ? 'strict type check clean' : `${errors} type errors` };
}

/** Unit, component, property and fuzz tests, with the coverage thresholds. */
export function unit(counts) {
  const json = join(LOG_DIR, 'vitest.json');
  const { code } = run(`npx vitest run --coverage --reporter=default --reporter=json --outputFile=${json}`, 'unit');
  if (!existsSync(json)) return { ok: false, summary: 'vitest produced no report' };
  const report = JSON.parse(readFileSync(json, 'utf8'));
  counts.unit = report.numTotalTests;
  const skipped = report.numPendingTests + report.numTodoTests;
  const ok = code === 0 && report.numFailedTests === 0 && skipped === 0;
  const summary = `${report.numPassedTests}/${report.numTotalTests} passed, ${skipped} skipped, coverage thresholds ${code === 0 ? 'met' : 'not met or failures'}`;
  return { ok, summary };
}

export function build() {
  const { code, output } = run('npx vite build', 'build');
  return { ok: code === 0, summary: code === 0 ? 'production build succeeded' : lastLine(output, /error/i) || 'build failed' };
}

/** The browser suite with the guard; `widths` adds the five main-flow widths. */
export function browsers(counts, { widths = false, logName = 'browsers' } = {}) {
  const json = join(LOG_DIR, `${logName}.json`);
  const env = { CI: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: json, ...(widths && { E2E_WIDTHS: WIDTHS }) };
  const { code } = run('npx playwright test --reporter=list,json', logName, env);
  if (!existsSync(json)) return { ok: false, summary: 'playwright produced no report' };
  const { stats, config } = JSON.parse(readFileSync(json, 'utf8'));
  const total = stats.expected + stats.unexpected + stats.flaky + stats.skipped;
  if (counts) counts.e2e = total;
  const projects = config.projects.map((project) => project.name).join(', ');
  const ok = code === 0 && stats.unexpected === 0 && stats.flaky === 0 && stats.skipped === 0;
  return { ok, summary: `${stats.expected}/${total} passed, ${stats.flaky} flaky, ${stats.skipped} skipped; projects: ${projects}` };
}

/** Initial JS: the entry script and every module it preloads, gzipped. */
export function bundleSize() {
  if (!existsSync('dist/index.html')) return { ok: false, summary: 'no build output' };
  const html = readFileSync('dist/index.html', 'utf8');
  const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((match) => join('dist', match[1]));
  const bytes = files.reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0);
  const kb = (bytes / 1024).toFixed(1);
  return { ok: bytes <= JS_BUDGET_BYTES, summary: `${kb} KB gzipped across ${files.length} file(s); budget 250 KB` };
}

/** Bundled samples and fixtures satisfy the schemas and their invariants. */
export function samples() {
  const { code, output } = run('npx vitest run tests/unit/samples.test.ts', 'samples');
  return { ok: code === 0, summary: code === 0 ? lastLine(output, /Tests/) : lastLine(output, /fail/i) || 'samples check failed' };
}

/** Three consecutive runs of the unit and browser suites, nothing else changed between them. */
export function threeRuns() {
  const outcomes = [];
  for (let n = 1; n <= 3; n += 1) {
    const unitRun = run('npx vitest run', `three-runs-unit-${n}`);
    const browser = browsers(null, { logName: `three-runs-browsers-${n}` });
    outcomes.push(unitRun.code === 0 && browser.ok);
  }
  const passed = outcomes.filter(Boolean).length;
  return { ok: passed === 3, summary: `${passed} of 3 consecutive runs green (${outcomes.map((o) => (o ? 'pass' : 'fail')).join(', ')})` };
}

/** Writes the counts the method page shows, from the runs just made. */
export function recordCounts(counts) {
  if (!Number.isInteger(counts.unit) || !Number.isInteger(counts.e2e)) return;
  writeFileSync('src/pages/method/test-counts.json', `${JSON.stringify({ unit: counts.unit, e2e: counts.e2e }, null, 2)}\n`);
}
