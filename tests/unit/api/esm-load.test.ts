import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';

// Vercel compiles each TypeScript file of a function to JavaScript on its own, without
// bundling, and this package is an ES module, so Node resolves every import exactly as
// written: an import without its file extension fails and the function answers
// FUNCTION_INVOCATION_FAILED on every request. This test does the same per-file compile
// into a temporary folder and loads the function with plain Node.

const ROOT = resolve('.');
const work = mkdtempSync(join(tmpdir(), 'kintrace-esm-'));

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });
}

function compileEachFile() {
  for (const file of [...sources(join(ROOT, 'api')), ...sources(join(ROOT, 'src'))]) {
    const output = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true },
      fileName: file,
    }).outputText;
    const target = join(work, relative(ROOT, file)).replace(/\.ts$/, '.js');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, output);
  }
  writeFileSync(join(work, 'package.json'), JSON.stringify({ type: 'module' }));
  symlinkSync(join(ROOT, 'node_modules'), join(work, 'node_modules'), 'dir');
}

describe('the parse function as Vercel runs it', () => {
  it('loads as plain ES modules and exports its GET and POST handlers', () => {
    compileEachFile();
    const script = "const m = await import('./api/parse.js'); process.stdout.write(typeof m.GET + ' ' + typeof m.POST);";
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: work, encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('function function');
  }, 30_000);
});
