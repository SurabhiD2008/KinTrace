import { parseOffline } from './offline';
import { MAX_INPUT_LENGTH, aiResponseSchema } from './types';
import type { ParseResult } from './types';

// The browser side of the optional AI parser. Nothing is sent unless the user
// has turned AI on. Any failure (no network, an error, a timeout, a missing
// key on the server, an answer that does not match the contract) falls back
// to the offline parser, and the caller is told so it can say which was used.

export const AI_ENDPOINT = '/api/parse';
export const AI_PREFERENCE_KEY = 'kintrace.parser.useAi.v1';
/**
 * A little longer than the server's own 8-second model timeout, so the server can
 * answer first, with enough room left that a hung request falls back well within
 * 9 seconds even on a busy device.
 */
export const CLIENT_TIMEOUT_MS = 8_200;

export interface ParseOutcome {
  result: ParseResult;
  /** AI was asked for but could not be used, so the offline parser answered. */
  fellBack: boolean;
}

export interface ParseTextOptions {
  useAi: boolean;
  locale: string;
  fetchImpl?: typeof fetch;
  online?: boolean;
  timeoutMs?: number;
  /** Aborts the request when the user cancels. */
  signal?: AbortSignal;
}

/** Rebuilds the full result from the server's answer, cutting unparsed words out of the user's own text. */
export function fromAiResponse(text: string, body: unknown): ParseResult | null {
  const parsed = aiResponseSchema.safeParse(body);
  if (!parsed.success) return null;
  const within = (end: number) => Math.min(end, text.length);
  return {
    engine: 'ai',
    entries: parsed.data.entries.map((entry) => ({
      ...entry,
      sourceSpan: { start: within(entry.sourceSpan.start), end: within(entry.sourceSpan.end) },
    })),
    unparsed: parsed.data.unparsed.map((item) => ({
      text: text.slice(item.span.start, within(item.span.end)),
      reason: item.reason,
    })),
  };
}

export async function parseText(text: string, options: ParseTextOptions): Promise<ParseOutcome> {
  const offline = (fellBack: boolean): ParseOutcome => ({ result: parseOffline(text), fellBack });
  if (!options.useAi || text.length > MAX_INPUT_LENGTH || text.trim() === '') return offline(false);
  const online = options.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine);
  if (!online) return offline(true);
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, locale: options.locale }),
      signal: withTimeout(options.signal, options.timeoutMs ?? CLIENT_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) return offline(true);
    const result = fromAiResponse(text, await response.json());
    return result ? { result, fellBack: false } : offline(true);
  } catch {
    // Network failure, timeout or a body that is not JSON: the offline parser answers instead.
    return offline(true);
  }
}

/** The timeout, plus the caller's own signal when there is one. */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** The user's choice is remembered on this device only. It holds no family data. */
export function loadAiPreference(storage: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  try {
    return storage?.getItem(AI_PREFERENCE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveAiPreference(on: boolean, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(AI_PREFERENCE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked or full: the choice simply is not remembered.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
