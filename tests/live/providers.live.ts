import { readFileSync, existsSync } from 'node:fs';
import { loadConfig } from '../../api/_lib/config';
import { providersFrom } from '../../api/_lib/providers';

// `npm run check:providers`: one tiny real call per configured provider, to prove
// the keys work. Manual only; never part of verify. Prints status and latency,
// never the key or the answer.

function readEnvFile(): Record<string, string> {
  if (!existsSync('.env')) return {};
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#') && line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
}

it('each configured provider answers one tiny request', async () => {
  const config = loadConfig({ ...readEnvFile(), ...process.env });
  for (const provider of providersFrom(config, fetch)) {
    if (!provider.available) {
      process.stdout.write(`${provider.name}: no key configured, not called\n`);
      continue;
    }
    const started = Date.now();
    const outcome = await provider.parse({ text: 'My mum had breast cancer at 38.', locale: 'en', timeoutMs: 15_000 });
    process.stdout.write(`${provider.name} (${provider.model}): ${outcome.ok ? 'ok' : outcome.code} in ${Date.now() - started} ms\n`);
    expect(outcome.ok).toBe(true);
  }
}, 60_000);
