// `npm run smoke -- <url> [--full] [--static]`: checks a running instance, local or deployed.
// Health (the parser function's status-only GET), the main page and one of its assets,
// and one read-only route. With --full, one real parse request, which costs one model
// call when a key is configured. --static skips the function checks, for `vite preview`, which
// serves the site without the serverless function. Prints timings; exits 1 on any failure.

const args = process.argv.slice(2);
const base = args.find((arg) => !arg.startsWith('--'));
const full = args.includes('--full');
const staticOnly = args.includes('--static');
if (!base) {
  process.stderr.write('Usage: npm run smoke -- <url> [--full] [--static]\n');
  process.exit(2);
}

let failed = 0;
async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    process.stdout.write(`PASS  ${name}: ${detail} (${Date.now() - started} ms)\n`);
  } catch (error) {
    failed += 1;
    process.stdout.write(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)} (${Date.now() - started} ms)\n`);
  }
}

async function get(path, init) {
  const response = await fetch(new URL(path, base), { redirect: 'follow', ...init, signal: AbortSignal.timeout(15_000) });
  return { response, body: await response.text() };
}

let html = '';
await step('main page', async () => {
  const { response, body } = await get('/');
  if (!response.ok) throw new Error(`status ${response.status}`);
  if (!response.headers.get('content-security-policy')) throw new Error('no Content-Security-Policy header');
  html = body;
  return `status ${response.status}, CSP present`;
});
await step('main page asset', async () => {
  const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  if (!asset) throw new Error('no script asset in the page');
  const { response, body } = await get(asset);
  if (!response.ok) throw new Error(`status ${response.status}`);
  return `${asset}, ${Math.round(body.length / 1024)} KB`;
});
await step('read-only route', async () => {
  const { response, body } = await get('/method');
  if (!response.ok || !body.includes('<div id="root">')) throw new Error(`status ${response.status}`);
  return 'the method page is served';
});
if (!staticOnly) {
  await step('health', async () => {
    const { response, body } = await get('/api/parse');
    if (!(response.headers.get('content-type') ?? '').includes('json')) throw new Error('no parser function answers at /api/parse');
    if (!response.ok || JSON.parse(body).status !== 'ok') throw new Error(`status ${response.status}`);
    return 'status ok';
  });
}
if (full && !staticOnly) {
  await step('one real parse', async () => {
    const { response, body } = await get('/api/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'My mum had breast cancer at 38.', locale: 'en' }),
    });
    if (response.status === 503) return 'no key configured: answered 503, the browser will use the offline parser';
    if (!response.ok) throw new Error(`status ${response.status}`);
    return `${JSON.parse(body).entries.length} entries`;
  });
}
process.exitCode = failed === 0 ? 0 : 1;
