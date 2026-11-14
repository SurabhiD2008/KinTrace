import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GIT, TEXT, run, trackedFiles } from './run.mjs';

// The secret scan: source, build output and git history, against key patterns and the
// values in the owner's local secret files. Values are never printed, only counted.

const PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /nvapi-[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{30,}/,
  /xox[abpr]-[A-Za-z0-9-]{20,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /Bearer\s+[A-Za-z0-9._-]{30,}/,
];

/** Local files that hold real secrets; never tracked (see .gitignore). */
const SECRET_FILES = ['.env', '.env.local', 'API Keys.txt'];

/** Long values from the local secret files: these must appear nowhere else. */
function localSecretValues() {
  const values = [];
  for (const file of SECRET_FILES) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      // NAME=value lines: only names that say they are secret (a model name is not).
      const assignment = /^\s*([A-Za-z_][\w]*)\s*=(.*)$/.exec(line);
      if (assignment && !/KEY|TOKEN|SECRET|PASSWORD/i.test(assignment[1] ?? '')) continue;
      const value = assignment ? (assignment[2] ?? '').trim() : line.trim();
      for (const token of value.split(/\s+/)) if (token.length >= 16 && /[0-9]/.test(token)) values.push(token);
    }
  }
  return values;
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** Counts of pattern hits and local-value hits in a body of text. */
function scan(text, values) {
  return {
    patterns: PATTERNS.filter((pattern) => pattern.test(text)).length,
    values: values.filter((value) => text.includes(value)).length,
  };
}

/** Proves the scanner works: a planted fake key and a planted local value must both be found. */
function canaryDetected() {
  const dir = mkdtempSync(join(tmpdir(), 'kt-canary-'));
  try {
    const fakeKey = `nvapi-${randomBytes(24).toString('hex')}`;
    const fakeValue = `canary${randomBytes(12).toString('hex')}9`;
    writeFileSync(join(dir, 'planted.ts'), `const a = '${fakeKey}';\nconst b = '${fakeValue}';\n`);
    const text = filesUnder(dir).map((file) => readFileSync(file, 'utf8')).join('\n');
    const found = scan(text, [fakeValue]);
    return found.patterns > 0 && found.values > 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function secrets() {
  if (!canaryDetected()) return { ok: false, summary: 'the planted canary was not detected: the scanner is broken' };
  const values = localSecretValues();
  const source = trackedFiles().filter((file) => TEXT.test(file) && existsSync(file)).map((file) => readFileSync(file, 'utf8')).join('\n');
  const built = filesUnder('dist').filter((file) => /\.(js|css|html|json|map|txt)$/.test(file)).map((file) => readFileSync(file, 'utf8')).join('\n');
  const history = run(`"${GIT}" log -p --all --no-color`, null).output;
  const hits = { source: scan(source, values), build: scan(built, values), history: scan(history, values) };
  const total = Object.values(hits).reduce((sum, hit) => sum + hit.patterns + hit.values, 0);
  const where = Object.entries(hits)
    .filter(([, hit]) => hit.patterns + hit.values > 0)
    .map(([name]) => name);
  return {
    ok: total === 0,
    summary: total === 0
      ? `canary detected; no key pattern or local secret value (${values.length} checked) in source, build or history`
      : `secret material found in: ${where.join(', ')} (values not printed)`,
  };
}
