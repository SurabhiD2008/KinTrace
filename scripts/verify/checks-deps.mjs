import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { allowed, run, trackedFiles } from './run.mjs';

// Dependencies: no high or critical audit findings in production dependencies, exact
// versions only, and the manifest matches what the code imports.

const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+|require\(\s*|url\(\s*)['"]([^'"./][^'"]*)['"]/g;

function packageOf(specifier) {
  if (specifier.startsWith('node:') || builtinModules.includes(specifier.split('/')[0])) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

function importsBy(files) {
  const used = new Set();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const name = packageOf(match[1]);
      if (name) used.add(name);
    }
  }
  return used;
}

function audit(final) {
  const { code, output } = run('npm audit --omit=dev --json', 'audit');
  let report;
  try {
    report = JSON.parse(output.slice(output.indexOf('{')));
  } catch {
    report = null;
  }
  const offline = !report || report.error !== undefined || /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network/i.test(output);
  if (offline) return final ? 'audit could not reach the registry' : null;
  const counts = report.metadata?.vulnerabilities ?? {};
  const serious = (counts.high ?? 0) + (counts.critical ?? 0);
  return serious > 0 || (code !== 0 && serious > 0) ? `${serious} high or critical production findings` : null;
}

export function dependencies({ final = false } = {}) {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  const declared = { ...manifest.dependencies, ...manifest.devDependencies };
  const problems = [];
  for (const [name, version] of Object.entries(declared)) {
    if (!EXACT.test(version)) problems.push(`${name} is not an exact version (${version})`);
  }
  const files = trackedFiles().filter((file) => /\.(ts|tsx|js|mjs|css)$/.test(file) && !file.startsWith('node_modules'));
  const used = importsBy(files);
  const toolOnly = new Set(allowed('dependency').map((entry) => entry.name));
  for (const name of Object.keys(declared)) {
    if (!used.has(name) && !toolOnly.has(name)) problems.push(`${name} is declared but never imported`);
  }
  for (const name of used) if (!(name in declared)) problems.push(`${name} is imported but not declared`);
  const runtime = importsBy(files.filter((file) => file.startsWith('src/') || file.startsWith('api/')));
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (!runtime.has(name)) problems.push(`${name} is a production dependency but only tests or tools use it`);
  }
  const auditProblem = audit(final);
  if (auditProblem) problems.push(auditProblem);
  const auditNote = auditProblem === null ? 'audit clean (or offline outside verify:final)' : '';
  return {
    ok: problems.length === 0,
    summary: problems.length === 0 ? `${Object.keys(declared).length} packages, all exact, all used; ${auditNote}` : problems.slice(0, 4).join('; '),
  };
}
