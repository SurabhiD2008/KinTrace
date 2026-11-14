import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Shared helpers for the verify checks: running commands, logging, the allow-list.

export const LOG_DIR = '.planning/logs';
mkdirSync(LOG_DIR, { recursive: true });

/** The git command; GIT may name another binary when the default one is unusable. */
export const GIT = process.env.GIT || 'git';

/** Runs a command through the shell (PowerShell or bash alike) and saves its output to a log. */
export function run(command, logName, env = {}) {
  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 1024 * 1024 * 512,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (logName) writeFileSync(join(LOG_DIR, `${logName}.log`), `$ ${command}\n\n${output}`);
  return { code: result.status ?? 1, output };
}

/** Tracked files, from git. */
export function trackedFiles() {
  const { code, output } = run(`"${GIT}" ls-files -z`);
  if (code !== 0) throw new Error('git ls-files failed; set GIT to a working git binary');
  return output.split('\0').filter(Boolean);
}

const allowlist = JSON.parse(readFileSync('verify.allowlist.json', 'utf8'));

/** Allow-list entries for one check. Each entry has a reason; a reason-less entry is an error. */
export function allowed(check) {
  const entries = allowlist.entries.filter((entry) => entry.check === check);
  for (const entry of entries) {
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 10) {
      throw new Error(`allow-list entry for ${check} (${entry.file ?? entry.name ?? ''}) has no reason`);
    }
  }
  return entries;
}

export const read = (path) => readFileSync(path, 'utf8');

export const CODE = /\.(ts|tsx|js|mjs|cjs)$/;
export const TEXT = /\.(ts|tsx|js|mjs|cjs|css|html|json|md|yml|yaml|txt|example)$|^\.[\w]+$|LICENSE$/;

/** The last N lines of a log, for a one-line failure summary. */
export function lastLine(output, pattern) {
  const lines = output.split('\n').filter((line) => pattern.test(line));
  return (lines.at(-1) ?? '').trim().replace(/\s+/g, ' ').slice(0, 160);
}
