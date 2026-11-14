import type { ParserConfig, ProviderName } from './config';
import { OUTPUT_SCHEMA, SYSTEM_PROMPT } from './prompt';
import { isRecord } from './response';

// A provider turns text into the model's raw JSON answer. The function tries the
// configured providers in order; a provider that fails hands over to the next.
// Nothing here validates entries: response.ts does that for every provider.

export const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const MODEL_TIMEOUT_MS = 8000;
/** Room for the schema's 100 entries at roughly 50 tokens each. */
const MAX_OUTPUT_TOKENS = 6000;

export type ProviderFailure = 'timeout' | 'rate_limited' | 'upstream_error';

export type ProviderOutcome =
  | { ok: true; output: unknown; totalTokens?: number }
  | { ok: false; code: ProviderFailure };

export interface ParserProvider {
  name: string;
  model: string;
  /** False when the provider has no key, so it is never called. */
  available: boolean;
  parse(input: { text: string; locale: string; timeoutMs: number }): Promise<ProviderOutcome>;
}

function nvidiaProvider(config: ParserConfig, fetchImpl: typeof fetch): ParserProvider {
  const key = config.nvidiaApiKey;
  return {
    name: 'nvidia',
    model: config.model,
    available: key !== undefined,
    async parse({ text, locale, timeoutMs }) {
      let upstream: Response;
      try {
        upstream = await fetchImpl(NVIDIA_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key ?? ''}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            model: config.model,
            max_tokens: MAX_OUTPUT_TOKENS,
            temperature: 0,
            // The default model reasons before answering unless told not to; the answer must fit the timeout.
            chat_template_kwargs: { enable_thinking: false },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Locale: ${locale}\n\n${text}` },
            ],
            response_format: { type: 'json_schema', json_schema: { name: 'family_entries', strict: true, schema: OUTPUT_SCHEMA } },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        return { ok: false, code: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'upstream_error' };
      }
      if (upstream.status === 429) return { ok: false, code: 'rate_limited' };
      if (!upstream.ok) return { ok: false, code: 'upstream_error' };
      try {
        const payload: unknown = await upstream.json();
        const choice = isRecord(payload) && Array.isArray(payload.choices) ? payload.choices[0] : undefined;
        const message = isRecord(choice) ? choice.message : undefined;
        const content = isRecord(message) ? message.content : undefined;
        // An empty answer, a refusal in prose or a truncated JSON string all fail here.
        if (typeof content !== 'string') return { ok: false, code: 'upstream_error' };
        const usage = isRecord(payload) && isRecord(payload.usage) ? payload.usage.total_tokens : undefined;
        return { ok: true, output: JSON.parse(content), ...(typeof usage === 'number' && { totalTokens: usage }) };
      } catch {
        return { ok: false, code: 'upstream_error' };
      }
    },
  };
}

const FACTORIES: Record<ProviderName, (config: ParserConfig, fetchImpl: typeof fetch) => ParserProvider> = {
  nvidia: nvidiaProvider,
};

/** The configured providers, in the configured order. */
export function providersFrom(config: ParserConfig, fetchImpl: typeof fetch): ParserProvider[] {
  return config.providers.map((name) => FACTORIES[name](config, fetchImpl));
}
