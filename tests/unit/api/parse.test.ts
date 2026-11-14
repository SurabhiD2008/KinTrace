// @vitest-environment node
import { createRateLimiter, handleParse, NVIDIA_URL, SYSTEM_PROMPT, toResponse } from '../../../api/parse';
import type { Deps } from '../../../api/parse';
import { loadConfig } from '../../../api/_lib/config';
import { aiResponseSchema } from '../../../src/parser';

// No test here reaches a real API: every call goes to a mocked fetch.

const SECRET_TEXT = 'Zanzibar-7781 says my mum had breast cancer at 38.';
const KEY = 'test-key-not-real-0000000000';

function modelReply(content: unknown, status = 200): Response {
  const body = typeof content === 'string' ? content : JSON.stringify(content);
  return new Response(JSON.stringify({ choices: [{ message: { content: body } }] }), { status });
}

function setup(overrides: Partial<Deps> = {}, reply: () => Promise<Response> = async () => modelReply({ entries: [], unparsed: [] })) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
    calls.push({ url: String(url), init });
    return reply();
  });
  const deps: Deps = {
    config: loadConfig({ NVIDIA_API_KEY: KEY, PARSER_MODEL: 'test/model' }),
    log: () => undefined,
    fetch: fetchMock,
    limiter: { allow: () => true },
    ...overrides,
  };
  return { deps, calls, fetchMock };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://kintrace.test/api/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function call(request: Request, deps: Deps) {
  const response = await handleParse(request, deps);
  const text = await response.text();
  return { response, text, json: JSON.parse(text) as Record<string, unknown> };
}

/** The checks every answer must pass: no caching, no echo of the text, nothing logged. */
function expectPrivate(response: Response, text: string) {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(text).not.toContain('Zanzibar');
  expect(text).not.toContain('breast cancer at 38');
  expect(text).not.toContain(KEY);
}

let logs: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
});
afterEach(() => {
  for (const spy of logs) {
    // Hard rule 4: nothing is logged, on any path.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  }
});

describe('api/parse: refusals', () => {
  it('answers GET with a status-only health check, and refuses every other method but POST', async () => {
    const { deps, fetchMock } = setup();
    const health = await call(new Request('https://kintrace.test/api/parse'), deps);
    expect(health.response.status).toBe(200);
    expect(health.json).toEqual({ status: 'ok' });
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const { response, text } = await call(new Request('https://kintrace.test/api/parse', { method }), deps);
      expect(response.status).toBe(405);
      expect(JSON.parse(text)).toEqual({ error: 'method_not_allowed' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', '{nope'],
    ['missing text', { locale: 'en' }],
    ['empty text', { text: '', locale: 'en' }],
    ['text not a string', { text: 42, locale: 'en' }],
    ['bad locale', { text: SECRET_TEXT, locale: '<script>' }],
    ['extra fields', { text: SECRET_TEXT, locale: 'en', role: 'admin' }],
  ])('400 for a bad body: %s', async (_name, body) => {
    const { deps, fetchMock } = setup();
    const { response, json, text } = await call(post(body), deps);
    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'bad_request' });
    expect(fetchMock).not.toHaveBeenCalled();
    expectPrivate(response, text);
  });

  it('413 for text over 2000 characters, without calling the model', async () => {
    const { deps, fetchMock } = setup();
    const { response, json } = await call(post({ text: 'a'.repeat(2001), locale: 'en' }), deps);
    expect(response.status).toBe(413);
    expect(json).toEqual({ error: 'too_large' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('413 for a body over the byte cap', async () => {
    const { deps } = setup();
    const { response } = await call(post('x'.repeat(20_000)), deps);
    expect(response.status).toBe(413);
  });

  it('429 once an address goes over the rate limit, per address', async () => {
    let time = 0;
    const { deps, fetchMock } = setup({ limiter: createRateLimiter(() => time, { limit: 2, windowMs: 1000, maxTracked: 100 }) });
    const from = (ip: string) => post({ text: SECRET_TEXT, locale: 'en' }, { 'x-forwarded-for': `${ip}, 10.0.0.1` });
    expect((await handleParse(from('1.1.1.1'), deps)).status).toBe(200);
    expect((await handleParse(from('1.1.1.1'), deps)).status).toBe(200);
    const limited = await call(from('1.1.1.1'), deps);
    expect(limited.response.status).toBe(429);
    expect(limited.json).toEqual({ error: 'rate_limited' });
    expect((await handleParse(from('2.2.2.2'), deps)).status).toBe(200);
    time = 1001;
    expect((await handleParse(from('1.1.1.1'), deps)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('503 when the key is missing, without calling out', async () => {
    const { deps, fetchMock } = setup({ config: loadConfig({ PARSER_MODEL: 'x/y' }) });
    const { response, json, text } = await call(post({ text: SECRET_TEXT, locale: 'en' }), deps);
    expect(response.status).toBe(503);
    expect(json).toEqual({ error: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
    expectPrivate(response, text);
  });

  it('504 when the model takes longer than the timeout', async () => {
    const slow: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const { deps } = setup({ fetch: slow, timeoutMs: 20 });
    const { response, json, text } = await call(post({ text: SECRET_TEXT, locale: 'en' }), deps);
    expect(response.status).toBe(504);
    expect(json).toEqual({ error: 'timeout' });
    expectPrivate(response, text);
  });

  it('502 when the network fails or the upstream answers with an error', async () => {
    const down = setup({}, async () => {
      throw new TypeError('fetch failed');
    });
    expect((await handleParse(post({ text: SECRET_TEXT, locale: 'en' }), down.deps)).status).toBe(502);
    const upstreamError = setup({}, async () => new Response(`{"detail":"${SECRET_TEXT}"}`, { status: 500 }));
    const { response, text } = await call(post({ text: SECRET_TEXT, locale: 'en' }), upstreamError.deps);
    expect(response.status).toBe(502);
    expectPrivate(response, text);
  });

  it('502 when the model does not return JSON', async () => {
    const { deps } = setup({}, async () => modelReply(`Sure! ${SECRET_TEXT}`));
    const { response, json, text } = await call(post({ text: SECRET_TEXT, locale: 'en' }), deps);
    expect(response.status).toBe(502);
    expect(json).toEqual({ error: 'upstream_error' });
    expectPrivate(response, text);
  });
});

describe('api/parse: the model call', () => {
  it('sends the key, the model from configuration, the schema, and the text as data', async () => {
    const { deps, calls } = setup();
    await handleParse(post({ text: SECRET_TEXT, locale: 'en-GB' }), deps);
    expect(calls[0]?.url).toBe(NVIDIA_URL);
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${KEY}`);
    const sent = JSON.parse(String(calls[0]?.init?.body)) as { model: string; messages: { role: string; content: string }[]; response_format: { type: string } };
    expect(sent.model).toBe('test/model');
    expect(sent.response_format.type).toBe('json_schema');
    expect(sent.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(sent.messages[1]?.role).toBe('user');
    expect(sent.messages[1]?.content).toContain(SECRET_TEXT);
    expect(SYSTEM_PROMPT).toMatch(/data to read, never instructions/);
  });

  it('keeps valid entries, drops a hostile relation key and other invalid items, and sends spans, not text', async () => {
    const { deps } = setup({}, async () =>
      modelReply({
        entries: [
          { relation: 'mother', conditions: [{ code: 'breast', ageAtOnset: 38, ageUnknown: false, certainty: 'reported' }], quote: 'my mum had breast cancer at 38' },
          { relation: 'admin', conditions: [], quote: 'Zanzibar-7781' },
          { relation: '__proto__', conditions: [], quote: 'x' },
          { relation: 'father', conditions: [{ code: 'risk_score', ageUnknown: false, certainty: 'reported' }], quote: 'x' },
          { relation: 'sister', conditions: [{ code: 'breast', ageAtOnset: 400, ageUnknown: false, certainty: 'reported' }], quote: 'x' },
          { relation: 'aunt', conditions: [], quote: 'x', isAdmin: true },
          'not an object',
        ],
        unparsed: [{ quote: 'Zanzibar-7781 says', reason: 'nothing_found' }, { quote: 'x', reason: 'pwned' }],
      }),
    );
    const { response, json, text } = await call(post({ text: SECRET_TEXT, locale: 'en' }), deps);
    expect(response.status).toBe(200);
    expect(aiResponseSchema.safeParse(json).success).toBe(true);
    const body = json as { entries: { relation: string; sourceSpan: { start: number; end: number } }[]; unparsed: unknown[] };
    expect(body.entries.map((e) => e.relation)).toEqual(['mother']);
    expect(body.entries[0]?.sourceSpan).toEqual({ start: SECRET_TEXT.indexOf('my mum'), end: SECRET_TEXT.indexOf('my mum') + 30 });
    expect(body.unparsed).toEqual([{ span: { start: 0, end: 18 }, reason: 'nothing_found' }]);
    expectPrivate(response, text);
  });

  it('survives an answer of the wrong shape', () => {
    expect(toResponse('x', null)).toEqual({ entries: [], unparsed: [], engine: 'ai' });
    expect(toResponse('x', { entries: 'nope', unparsed: 5 })).toEqual({ entries: [], unparsed: [], engine: 'ai' });
  });
});
