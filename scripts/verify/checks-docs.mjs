import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LOG_DIR, run, trackedFiles } from './run.mjs';

// Documentation must match the repository: commands exist, the variable list agrees in
// three places, relative links resolve, and every number in the README comes from code.

const read = (path) => readFileSync(path, 'utf8');
const sameSet = (a, b) => a.length === b.length && a.every((item) => b.includes(item));

/** Numbers the README may quote, each with where its value comes from. */
function verifiedNumbers() {
  const types = read('src/domain/types.ts');
  const parser = read('src/parser/types.ts');
  const limits = read('api/_lib/limits.ts');
  const config = read('api/_lib/config.ts');
  const ai = read('src/parser/ai.ts');
  const providers = read('api/_lib/providers.ts');
  const manifest = JSON.parse(read('package.json'));
  const grab = (text, pattern) => pattern.exec(text)?.[1];
  return [
    ['Node 22', grab(manifest.engines.node, />=(\d+)/) === '22'],
    ['500 people', grab(types, /maxPersons: (\d+)/) === '500'],
    ['2 MB', grab(types, /maxBytes: (\d+) \* 1024 \* 1024/) === '2'],
    ['2000 characters', grab(parser, /MAX_INPUT_LENGTH = (\d+)/) === '2000'],
    ['100 suggestions', grab(parser, /MAX_PARSE_ITEMS = (\d+)/) === '100'],
    ['6 requests per 10 minutes', grab(limits, /limit: (\d+), windowMs: (?:\d+) \* 60_000/) === '6' && grab(limits, /windowMs: (\d+) \* 60_000/) === '10'],
    ['4 model calls at once', grab(limits, /MAX_CONCURRENT_CALLS = (\d+)/) === '4'],
    ['300 calls a day', grab(config, /dailyCap: parsed\.data\.PARSER_DAILY_CAP \?\? (\d+)/) === '300'],
    ['8 seconds', grab(providers, /MODEL_TIMEOUT_MS = (\d+)000/) === '8'],
    ['8.2 seconds', grab(ai, /CLIENT_TIMEOUT_MS = (\d)_(\d)00/) === '8' && grab(ai, /CLIENT_TIMEOUT_MS = \d_(\d)00/) === '2'],
    ['9 seconds', /expectOfflineFallback\(page, 9000\)/.test(read('tests/e2e/edge/network.spec.ts'))],
    ['120', grab(types, /maxAge: (\d+)/) === '120'],
    ['90% of lines', /lines: 90/.test(read('vite.config.ts'))],
    ['85% of branches', /branches: 85/.test(read('vite.config.ts'))],
    ['250 KB', /250 \* 1024/.test(read('scripts/verify/checks-code.mjs'))],
    ['320, 390, 768, 1024 and 1360', /'320,390,768,1024,1360'/.test(read('scripts/verify/checks-code.mjs'))],
    ['44 px', /--touch-target: 44px/.test(read('src/styles/tokens.css'))],
    ['500 generated families', /RUNS = 500;/.test(read('tests/unit/generators.ts'))],
    ['1.3.4', read('docs/RULES.md').includes('1.3.4')],
    ['1.4.4', read('docs/RULES.md').includes('1.4.4')],
    [`${bugCount()} bugs`, true],
  ];
}

const bugCount = () => [...read('docs/BUGS_FOUND.md').matchAll(/^## BUG-\d+/gm)].length;

/** The README with its generated blocks removed; each block is checked as a whole elsewhere. */
const withoutGeneratedBlocks = (text) => text.replace(/<!-- (\w+):start -->[\s\S]*?<!-- \1:end -->/g, '');

function readmeNumbers(problems) {
  const prose = withoutGeneratedBlocks(read('README.md')).replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '').replace(/\]\([^)]*\)/g, ']');
  let rest = prose;
  for (const [phrase, holds] of verifiedNumbers()) {
    if (!rest.includes(phrase)) continue;
    if (!holds) problems.push(`README says "${phrase}" but the code disagrees`);
    rest = rest.split(phrase).join(' ');
  }
  const stray = [...rest.matchAll(/\b\d+(?:[.,]\d+)?\b/g)].map((match) => match[0]);
  if (stray.length > 0) problems.push(`README numbers not checked by a script: ${[...new Set(stray)].slice(0, 6).join(', ')}`);
}

function variables(problems) {
  const config = read('api/_lib/config.ts');
  const schema = /configSchema = z\.object\(\{([\s\S]*?)\n\}\);/.exec(config)?.[1] ?? '';
  const fromConfig = [...schema.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]);
  const fromExample = [...read('.env.example').matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]);
  const envSection = /#{2,3} Environment variables([\s\S]*?)\n#{2,3} /.exec(read('README.md'))?.[1] ?? '';
  const fromReadme = [...envSection.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|/gm)].map((match) => match[1]);
  if (fromConfig.length === 0) problems.push('no variables found in api/_lib/config.ts');
  if (!sameSet(fromConfig, fromExample)) problems.push(`.env.example lists ${fromExample.join(', ')}; config has ${fromConfig.join(', ')}`);
  if (!sameSet(fromConfig, fromReadme)) problems.push(`README lists ${fromReadme.join(', ') || 'none'}; config has ${fromConfig.join(', ')}`);
}

function commands(problems) {
  const scripts = JSON.parse(read('package.json')).scripts;
  for (const file of ['README.md', 'CLAUDE.md']) {
    for (const match of read(file).matchAll(/npm run ([\w:-]+)/g)) {
      if (!(match[1] in scripts)) problems.push(`${file} mentions npm run ${match[1]}, which is not a script`);
    }
  }
}

function links(problems) {
  const docs = trackedFiles().filter((file) => file.endsWith('.md') && !['Builds_skills.md', 'Fable.md'].includes(file));
  for (const file of docs) {
    for (const match of read(file).matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const path = join(dirname(file), target.split('#')[0].replace(/:\d+$/, ''));
      if (!existsSync(path)) problems.push(`${file} links to ${target}, which does not exist`);
    }
  }
}

/** Browser tests per Playwright project, every browser and width, listed without running. */
function browserCounts() {
  const env = { E2E_BROWSERS: 'chromium,firefox,webkit', E2E_WIDTHS: '320,390,768,1024,1360' };
  const { code, output } = run('npx playwright test --list --reporter=json', null, env);
  if (code !== 0) throw new Error('playwright --list failed');
  const counts = {};
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) counts[test.projectName] = (counts[test.projectName] ?? 0) + 1;
    for (const child of suite.suites ?? []) walk(child);
  };
  JSON.parse(output.slice(output.indexOf('{'))).suites.forEach(walk);
  return counts;
}

/** Unit-suite counts by kind, from the report of the unit run that verify has just made. */
function unitCounts() {
  const report = JSON.parse(read(join(LOG_DIR, 'vitest.json')));
  const counts = { unit: 0, component: 0, property: 0, fuzz: 0, api: 0 };
  for (const file of report.testResults) {
    const name = file.name.split('\\').join('/').replace(/^.*?tests\/unit\//, '');
    const kind = name.startsWith('properties/') ? 'property' : name.startsWith('fuzz/') ? 'fuzz' : name.startsWith('api/') ? 'api' : name.endsWith('.tsx') ? 'component' : 'unit';
    counts[kind] += file.assertionResults.length;
  }
  return { ...counts, total: report.numTotalTests };
}

/** The README's test table, generated from the runs, the coverage summary and the mutation record. */
function testTable() {
  const unit = unitCounts();
  const browsers = browserCounts();
  const widths = Object.entries(browsers).filter(([name]) => name.startsWith('chromium@'));
  const coverage = JSON.parse(read('coverage/coverage-summary.json')).total;
  const mutation = JSON.parse(read('docs/mutation-score.json'));
  const rows = [
    ['Unit (domain, guidelines, parser, state, i18n, docs)', unit.unit, 'Vitest; pure functions, guideline rules at and either side of their age thresholds'],
    ['Component', unit.component, 'React Testing Library in jsdom; pages, dialogs, Quick add, the report'],
    ['Property-based', unit.property, 'fast-check, 500 generated families per property, fixed seed'],
    ['Fuzz', unit.fuzz, 'hostile imports and hostile free text against the parser and the loader'],
    ['Serverless function', unit.api, 'the parse function with scripted providers: timeouts, 429, 500, bad JSON, invented quotes, injected instructions'],
    ['Browser, Chromium', browsers.chromium, 'Playwright with the guard; every flow, edge cases, the guard self-test, the PDF page count'],
    ['Browser, Firefox', browsers.firefox, 'the smoke, findings and report flows and the cross-browser edge tests'],
    ['Browser, WebKit', browsers.webkit, 'the same set as Firefox'],
    [`Browser, Chromium at ${widths.map(([name]) => name.split('@')[1]).join(', ')} px`, widths.reduce((sum, [, n]) => sum + n, 0), `the main flows at each width (${widths[0]?.[1] ?? 0} per width), in verify:final`],
  ];
  return [
    '| Suite | Tests | What it covers |',
    '| --- | --- | --- |',
    ...rows.map(([suite, count, covers]) => `| ${suite} | ${count} | ${covers} |`),
    '',
    `Unit-suite total: ${unit.total}. Line coverage ${coverage.lines.pct}% and branch coverage ${coverage.branches.pct}% over src/domain, src/guidelines and src/parser. Mutation score ${mutation.score}% (${mutation.killed} of ${mutation.scored} scored mutants killed, Stryker on the guideline rules and the relationship engine, run ${mutation.date}).`,
  ].join('\n');
}

function generatedTests(problems) {
  const readme = read('README.md');
  const block = /<!-- tests:start -->\n([\s\S]*?)\n<!-- tests:end -->/.exec(readme)?.[1];
  const expected = testTable();
  writeFileSync(join(LOG_DIR, 'readme-tests.md'), `${expected}\n`);
  if (block === undefined) problems.push('README has no tests:start/tests:end block');
  else if (block !== expected) problems.push(`README test table differs from the runs; expected table in ${LOG_DIR}/readme-tests.md`);
}

export function docs() {
  const problems = [];
  const required = ['What it does', 'Architecture', 'Guidelines', 'How unknown data is handled', 'Testing', 'Privacy and security', 'How to run', 'Limitations and caveats', 'Roadmap'];
  const headings = [...read('README.md').matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
  if (headings.join('|') !== required.join('|')) problems.push(`README sections are ${headings.join(', ')}; expected ${required.join(', ')}`);
  commands(problems);
  variables(problems);
  links(problems);
  readmeNumbers(problems);
  generatedTests(problems);
  return { ok: problems.length === 0, summary: problems.length === 0 ? 'README sections, commands, variables, links and numbers all match' : problems.slice(0, 3).join('; ') };
}
