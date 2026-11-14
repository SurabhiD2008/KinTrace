import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { ESLint } from 'eslint';
import { CODE, TEXT, allowed, trackedFiles } from './run.mjs';

// The forbidden list. Each hit fails unless verify.allowlist.json has an entry for that
// exact line (or file, for size limits) with a reason.

const MAX_FILE_LINES = 300;
const MAX_FUNCTION_LINES = 60;
const MEDIA = /\.(png|jpe?g|gif|webp|svg|mp4|mov|webm|mp3|wav|ogg)$/i;
const isTest = (file) => file.startsWith('tests/');
const isCode = (file) => CODE.test(file);
const inProduct = (file) => /^(src|api|scripts)\//.test(file) && isCode(file);
const isConfig = (file) => /(^|\/)[\w.-]*\.config\.(ts|js|mjs)$|^eslint\.config\.js$/.test(file);

/** Line rules: [id, which files, pattern]. */
const LINE_RULES = [
  ['secret-fallback', isCode, /\b\w*(SECRET|KEY|TOKEN|PASSWORD)\w*\b[^\n]*(\?\?|\|\|)\s*['"`][^'"`]+['"`]/],
  ['cors-wildcard', isCode, /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*['"]|\bcors\(\s*\)/],
  ['focused-or-skipped-test', isTest, /\b(it|test|describe)\.(only|skip|fixme)\b|\b(xit|xdescribe|fit|fdescribe)\(/],
  ['print-debugging', inProduct, /\bconsole\.(log|debug|info|trace)\(|\bdebugger\b/],
  ['todo', (file) => isCode(file) || file.endsWith('.md'), /\b(TODO|FIXME|HACK|XXX)\b/],
  ['suppression-without-reason', isCode, /eslint-disable(-next-line|-line)?\s+[\w/@-]+(?!.*\s--\s)|@ts-(ignore|expect-error|nocheck)\s*$/],
  ['unchecked-cast', isCode, /\bas unknown as\b|\bas any\b/],
  ['raw-html-or-eval', isCode, /dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(/],
  ['placeholder', (file) => file.startsWith('src/'), /lorem ipsum|coming soon|href=["']#?["']/i],
  ['hardcoded-host-or-path', (file) => inProduct(file) && !isConfig(file), /localhost|127\.0\.0\.1|\/Users\/[A-Za-z]|[A-Z]:\\\\/],
  ['model-id-literal', (file) => isCode(file) && file !== 'api/_lib/config.ts', /['"`](nvidia|meta|google|openai|anthropic|mistralai|qwen|deepseek)\/[\w.:-]+['"`]|claude-(opus|sonnet|haiku|fable)|gpt-\d/],
  ['comment-reference', isCode, /(\/\/|\/\*|^\s*\*).*\b(prompt\s+\d+|step\s+\d+|scenario\s+\d+|section\s+\d+(\.\d+)?|A-\d{2}|R-\d{2}|BUG-\d{3})\b/i],
  ['emoji', (file) => file === 'README.md' || file.startsWith('src/i18n/'), /\p{Extended_Pictographic}/u],
];

function lineHits(files) {
  const hits = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const [rule, applies, pattern] of LINE_RULES) {
      if (!applies(file)) continue;
      lines.forEach((line, index) => {
        if (pattern.test(line)) hits.push({ rule, file, line: line.trim(), at: index + 1 });
      });
    }
  }
  return hits;
}

function fileHits(files) {
  const hits = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n').length;
    if (/\.(ts|tsx|js|mjs|css)$/.test(file) && lines > MAX_FILE_LINES) hits.push({ rule: 'file-size', file, line: `${lines} lines` });
    if (isTest(file) && /\.(test|spec)\.tsx?$/.test(file) && !/expect\(|fc\.assert\(/.test(readFileSync(file, 'utf8'))) {
      hits.push({ rule: 'test-without-assertion', file, line: 'no expect() in the file' });
    }
    if (/^\.planning\//.test(file) || /^(PLAN|DESIGN|DECISIONS|VERIFY|PROGRESS|TRACEABILITY|CHECKLIST[\w-]*)\.md$/i.test(basename(file))) {
      hits.push({ rule: 'planning-document-tracked', file, line: file });
    }
    if (MEDIA.test(file) && !/^(media|public|src\/assets)\//.test(file)) hits.push({ rule: 'media-outside-media', file, line: file });
    if (/thumbnail|thumb|gallery|cover|submission/i.test(file)) hits.push({ rule: 'media-name', file, line: file });
  }
  if (!existsSync('LICENSE')) hits.push({ rule: 'missing-license', file: 'LICENSE', line: 'missing' });
  const seen = new Map();
  for (const file of files) {
    const body = readFileSync(file);
    if (body.length === 0) continue;
    const hash = createHash('sha256').update(body).digest('hex');
    if (seen.has(hash)) hits.push({ rule: 'duplicate-file', file, line: `same content as ${seen.get(hash)}` });
    else seen.set(hash, file);
  }
  return hits;
}

async function functionHits() {
  const eslint = new ESLint({
    overrideConfig: { rules: { 'max-lines-per-function': ['error', { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true }] } },
  });
  const results = await eslint.lintFiles(['src', 'api', 'scripts']);
  return results.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId === 'max-lines-per-function')
      .map((message) => ({
        rule: 'function-size',
        file: result.filePath.slice(process.cwd().length + 1).split('\\').join('/'),
        name: /'([^']+)'/.exec(message.message)?.[1] ?? 'Arrow function',
        line: message.message,
      })),
  );
}

function isAllowed(hit) {
  return allowed(hit.rule).some((entry) =>
    entry.file === hit.file &&
    (entry.line === undefined || entry.line === hit.line) &&
    (entry.name === undefined || entry.name === hit.name));
}

export async function hygiene() {
  const files = trackedFiles().filter((file) => existsSync(file) && (TEXT.test(file) || MEDIA.test(file)));
  const scanned = files.filter((file) => !['Builds_skills.md', 'Fable.md', 'package-lock.json'].includes(file) && TEXT.test(file));
  const hits = [...lineHits(scanned), ...fileHits(files), ...(await functionHits())];
  const open = hits.filter((hit) => !isAllowed(hit));
  const excepted = hits.length - open.length;
  return {
    ok: open.length === 0,
    summary: open.length === 0
      ? `forbidden list clean over ${scanned.length} files (${excepted} allow-listed exceptions, each with a reason)`
      : open.slice(0, 3).map((hit) => `${hit.rule} ${hit.file}${hit.at ? `:${hit.at}` : ''}${hit.name ? ` ${hit.name}` : ''}`).join('; ') + (open.length > 3 ? `; and ${open.length - 3} more` : ''),
    details: open,
  };
}
