import { aiRequestSchema, MAX_INPUT_LENGTH } from '../src/parser/types.js';
import type { AiErrorCode } from '../src/parser/types.js';
import { loadConfig } from './_lib/config.js';
import type { ParserConfig } from './_lib/config.js';
import { createDailyBudget, createGate, createRateLimiter } from './_lib/limits.js';
import type { DailyBudget, Gate, RateLimiter } from './_lib/limits.js';
import { writeLog } from './_lib/log.js';
import type { Logger } from './_lib/log.js';
import { PROMPT_VERSION } from './_lib/prompt.js';
import { MODEL_TIMEOUT_MS, providersFrom } from './_lib/providers.js';
import type { ParserProvider, ProviderFailure } from './_lib/providers.js';
import { isRecord, toGroundedResponse } from './_lib/response.js';

// The one optional serverless function. It turns free text into proposed
// family-tree entries with a hosted model, validates every entry against the
// shared schema, and answers. It never stores the request, never logs or sends
// back the user's text, and every refusal is generic. The browser falls back to
// the offline parser on any error. GET answers a status-only health check.

export { createRateLimiter } from './_lib/limits.js';
export { MODEL_TIMEOUT_MS, NVIDIA_URL } from './_lib/providers.js';
export { SYSTEM_PROMPT } from './_lib/prompt.js';
export { toResponse } from './_lib/response.js';

export const config = { runtime: 'nodejs', maxDuration: 15 };

const MAX_BODY_BYTES = 16 * 1024;

export interface Deps {
  config: ParserConfig;
  fetch: typeof fetch;
  limiter: RateLimiter;
  /** Defaults to the configured providers; tests pass scripted ones. */
  providers?: ParserProvider[];
  /** One daily budget per provider name. */
  budgets?: Map<string, DailyBudget>;
  gate?: Gate;
  log?: Logger;
  timeoutMs?: number;
}

const STATUS: Record<AiErrorCode, number> = {
  bad_request: 400,
  method_not_allowed: 405,
  too_large: 413,
  rate_limited: 429,
  upstream_error: 502,
  unavailable: 503,
  timeout: 504,
};

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function fail(code: AiErrorCode): Response {
  return new Response(JSON.stringify({ error: code }), { status: STATUS[code], headers: HEADERS });
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

/** The request's text and locale, or the refusal for a request that cannot be read. */
async function readRequest(request: Request): Promise<{ text: string; locale: string } | AiErrorCode> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return 'too_large';
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return 'bad_request';
  }
  if (raw.length > MAX_BODY_BYTES) return 'too_large';
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return 'bad_request';
  }
  if (isRecord(body) && typeof body.text === 'string' && body.text.length > MAX_INPUT_LENGTH) return 'too_large';
  const parsed = aiRequestSchema.safeParse(body);
  return parsed.success ? parsed.data : 'bad_request';
}

export async function handleParse(request: Request, deps: Deps): Promise<Response> {
  if (request.method === 'GET') return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: HEADERS });
  if (request.method !== 'POST') return fail('method_not_allowed');
  if (!deps.limiter.allow(clientKey(request))) return fail('rate_limited');
  const input = await readRequest(request);
  if (typeof input === 'string') return fail(input);

  const providers = (deps.providers ?? providersFrom(deps.config, deps.fetch)).filter((provider) => provider.available);
  if (providers.length === 0) return fail('unavailable');
  const gate = deps.gate ?? sharedGate;
  if (!gate.tryEnter()) return fail('unavailable');
  const log = deps.log ?? writeLog;
  const budgets = deps.budgets ?? sharedBudgets;
  let last: ProviderFailure | 'unavailable' = 'unavailable';
  try {
    for (const provider of providers) {
      let budget = budgets.get(provider.name);
      if (!budget) budgets.set(provider.name, (budget = createDailyBudget(deps.config.dailyCap)));
      if (!budget.take()) {
        last = 'rate_limited';
        continue;
      }
      const started = Date.now();
      const outcome = await provider.parse({ ...input, timeoutMs: deps.timeoutMs ?? MODEL_TIMEOUT_MS });
      const grounded = outcome.ok ? toGroundedResponse(input.text, outcome.output) : null;
      // More than half of the valid entries quoting text that is not there: the answer is not trusted at all.
      const untrusted = grounded !== null && grounded.ungrounded * 2 > grounded.checked;
      const totalTokens = outcome.ok ? outcome.totalTokens : undefined;
      log({
        event: 'model_call',
        provider: provider.name,
        model: provider.model,
        promptVersion: PROMPT_VERSION,
        latencyMs: Date.now() - started,
        outcome: outcome.ok ? (untrusted ? 'ungrounded' : 'ok') : outcome.code,
        ...(grounded !== null && { droppedUngrounded: grounded.ungrounded }),
        ...(totalTokens !== undefined && { totalTokens }),
      });
      if (grounded !== null && !untrusted) {
        return new Response(JSON.stringify(grounded.response), { status: 200, headers: HEADERS });
      }
      last = outcome.ok ? 'upstream_error' : outcome.code;
    }
  } finally {
    gate.leave();
  }
  return fail(last === 'rate_limited' ? 'unavailable' : last);
}

// Read once at start-up: an invalid setting stops the function with a clear message.
const settings = loadConfig(process.env);
const limiter = createRateLimiter();
const sharedGate = createGate();
const sharedBudgets = new Map<string, DailyBudget>();

export function GET(request: Request): Promise<Response> {
  return handleParse(request, { config: settings, fetch, limiter });
}

export function POST(request: Request): Promise<Response> {
  return handleParse(request, { config: settings, fetch, limiter });
}
