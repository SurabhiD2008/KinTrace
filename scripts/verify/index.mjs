import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { browsers, build, bundleSize, lint, recordCounts, samples, threeRuns, types, unit } from './checks-code.mjs';
import { dependencies } from './checks-deps.mjs';
import { docs } from './checks-docs.mjs';
import { hygiene } from './checks-hygiene.mjs';
import { secrets } from './checks-secrets.mjs';
import { GIT, LOG_DIR, run } from './run.mjs';

// `npm run verify` (fast gate) and `npm run verify:final` (delivery gate). Every check
// runs even when an earlier one fails; each prints one PASS or FAIL line; the table goes
// to .planning/VERIFY.md and full logs to .planning/logs. Exit code 1 if anything failed.

const FINAL = process.argv.includes('--final');
const results = [];
const counts = {};

async function check(number, name, fn) {
  const started = Date.now();
  let result;
  try {
    result = await fn();
  } catch (error) {
    result = { ok: false, summary: `check crashed: ${String(error instanceof Error ? error.message : error).split('\n')[0]}` };
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const status = result.na ? 'N/A' : result.ok ? 'PASS' : 'FAIL';
  results.push({ number, name, status, summary: result.summary, seconds, details: result.details });
  process.stdout.write(`${status.padEnd(4)}  ${String(number).padStart(2)}  ${name}: ${result.summary} (${seconds} s)\n`);
}

/** Clones the committed state into a temporary folder and runs `verify` there, with nothing else running. */
function freshClone() {
  const dir = mkdtempSync(join(tmpdir(), 'kintrace-clone-'));
  try {
    const clone = run(`"${GIT}" clone --quiet "${resolve('.')}" "${dir}"`, 'fresh-clone-git');
    if (clone.code !== 0) return { ok: false, summary: 'git clone failed' };
    const install = run(`cd "${dir}" && npm ci --no-audit --no-fund --prefer-offline`, 'fresh-clone-install');
    if (install.code !== 0) return { ok: false, summary: 'npm ci failed in the clone' };
    const verify = run(`cd "${dir}" && node scripts/verify/index.mjs`, 'fresh-clone-verify', { E2E_PORT: '4174' });
    const failed = verify.output.split('\n').filter((line) => line.startsWith('FAIL'));
    return { ok: verify.code === 0, summary: verify.code === 0 ? 'clean clone: npm ci, then verify, all green' : `in the clone: ${failed.join(' | ').slice(0, 200)}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeReport(startedAt) {
  const commit = run(`"${GIT}" rev-parse --short HEAD`).output.trim();
  const dirty = run(`"${GIT}" status --porcelain`).output.trim() !== '';
  const lines = [
    `# Verify report (${FINAL ? 'verify:final' : 'verify'})`,
    '',
    `Started ${startedAt.toISOString()}, finished ${new Date().toISOString()}. Commit ${commit}${dirty ? ' with uncommitted changes' : ''}. Node ${process.version}. Browsers: ${process.env.E2E_BROWSERS ?? 'chromium,firefox,webkit'}.`,
    '',
    '| # | Check | Result | Summary | Seconds |',
    '| --- | --- | --- | --- | --- |',
    ...results.map((r) => `| ${r.number} | ${r.name} | ${r.status} | ${String(r.summary).replace(/\|/g, '/')} | ${r.seconds} |`),
    '',
    `Full logs: ${LOG_DIR}/.`,
  ];
  const open = results.flatMap((r) => (r.details ?? []).map((d) => `- ${r.name}: ${d.rule} ${d.file}${d.at ? `:${d.at}` : ''} ${d.name ?? ''}`));
  if (open.length > 0) lines.push('', '## Open findings', '', ...open);
  writeFileSync('.planning/VERIFY.md', `${lines.join('\n')}\n`);
}

const startedAt = new Date();
await check(1, 'Format and lint', lint);
await check(2, 'Types', types);
await check(3, 'Unit and API tests', () => unit(counts));
await check(4, 'Build', build);
await check(5, 'Browser tests with the guard', () => browsers(counts, { widths: FINAL }));
await check(6, 'Secret scan', secrets);
await check(7, 'Dependencies', () => dependencies({ final: FINAL }));
await check(8, 'Hygiene scan', hygiene);
await check(9, 'Docs consistency', docs);
await check(10, 'Size budget', bundleSize);
await check(11, 'Provided files', () => ({ na: true, summary: 'N/A: hackathon build, not an assignment with provided files' }));
await check(12, 'Results check', samples);
if (FINAL) {
  await check(13, 'Three consecutive runs', threeRuns);
  await check(14, 'Fresh clone', freshClone);
}
recordCounts(counts);
writeReport(startedAt);
const failed = results.filter((r) => r.status === 'FAIL').length;
process.stdout.write(`\n${failed === 0 ? 'verify: all checks passed' : `verify: ${failed} check(s) failed`}. Report: .planning/VERIFY.md\n`);
process.exitCode = failed === 0 ? 0 : 1;
