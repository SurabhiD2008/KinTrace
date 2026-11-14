import { z } from 'zod';

// The parser function's whole configuration, read once from the environment and
// validated. An invalid value stops the function at start-up with a message that
// names the variable (never its value). The AI key is optional: without it the
// function answers "unavailable" and the browser uses the offline parser.

/** The model used when PARSER_MODEL is not set. Checked against NVIDIA's catalogue on 2026-11-12. */
export const DEFAULT_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b';
export const PROVIDER_NAMES = ['nvidia'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema.optional());

export const configSchema = z.object({
  /** NVIDIA API key, from build.nvidia.com. Without it the AI parser is off. */
  NVIDIA_API_KEY: optional(z.string().min(20, 'is set but too short to be an API key')),
  /** Model identifier from NVIDIA's catalogue. */
  PARSER_MODEL: optional(z.string().regex(/^[\w.-]+\/[\w.:-]+$/, 'must look like owner/model')),
  /** Providers to try, in order, separated by commas. */
  PARSER_PROVIDERS: optional(z.string().regex(/^[a-z]+(,[a-z]+)*$/, 'must be names separated by commas')),
  /** Most model calls per provider per day, per instance. */
  PARSER_DAILY_CAP: optional(z.coerce.number().int().min(1).max(10_000)),
});

/** Every variable the function reads; the README and .env.example must list exactly these. */
export const CONFIG_VARIABLES = Object.keys(configSchema.shape);

export interface ParserConfig {
  nvidiaApiKey: string | undefined;
  model: string;
  providers: ProviderName[];
  dailyCap: number;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function loadConfig(env: Record<string, string | undefined>): ParserConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`);
    throw new ConfigError(`Invalid parser configuration: ${problems.join('; ')}`);
  }
  const names = (parsed.data.PARSER_PROVIDERS ?? 'nvidia').split(',');
  const unknown = names.filter((name) => !PROVIDER_NAMES.some((known) => known === name));
  if (unknown.length > 0) throw new ConfigError(`Invalid parser configuration: PARSER_PROVIDERS names an unknown provider`);
  return {
    nvidiaApiKey: parsed.data.NVIDIA_API_KEY,
    model: parsed.data.PARSER_MODEL ?? DEFAULT_MODEL,
    providers: names.filter((name): name is ProviderName => PROVIDER_NAMES.some((known) => known === name)),
    dailyCap: parsed.data.PARSER_DAILY_CAP ?? 300,
  };
}
