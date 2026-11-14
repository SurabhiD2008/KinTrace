import { MAX_PARSE_ITEMS as MAX_ITEMS, UNPARSED_REASONS, aiResponseSchema, proposedEntrySchema } from '../../src/parser/types';
import type { AiResponse, ProposedEntry, SourceSpan } from '../../src/parser/types';

/** Where a quote sits in the text, or null when the model did not copy it exactly. */
function spanOf(text: string, quote: unknown): SourceSpan | null {
  if (typeof quote !== 'string' || quote.trim() === '') return null;
  const start = text.indexOf(quote);
  return start === -1 ? null : { start, end: start + quote.length };
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The checked answer, and how many otherwise valid entries quoted text that is not in the input. */
export interface Grounded {
  response: AiResponse;
  /** Valid entries whose quote was not found in the text: dropped, never shown. */
  ungrounded: number;
  /** Valid entries checked against the text. */
  checked: number;
}

/**
 * Keeps only what passes the shared schema and is grounded in the text. A
 * hostile or malformed item is dropped on its own; so is an entry whose quote is
 * not in the user's text, because a quote the model made up may come with a
 * relative it made up too. The rest of the answer is still used.
 */
export function toGroundedResponse(text: string, output: unknown): Grounded {
  const entries: ProposedEntry[] = [];
  const unparsed: AiResponse['unparsed'] = [];
  let ungrounded = 0;
  let checked = 0;
  if (!isRecord(output)) return { response: { entries, unparsed, engine: 'ai' }, ungrounded, checked };
  const rawEntries = Array.isArray(output.entries) ? output.entries.slice(0, MAX_ITEMS) : [];
  for (const raw of rawEntries) {
    if (!isRecord(raw)) continue;
    const { quote, ...fields } = raw;
    const candidate = proposedEntrySchema.safeParse({ ...fields, id: `ai${entries.length + 1}`, sourceSpan: { start: 0, end: 0 } });
    if (!candidate.success) continue;
    checked += 1;
    const span = spanOf(text, quote);
    if (span === null) {
      ungrounded += 1;
      continue;
    }
    entries.push({ ...candidate.data, sourceSpan: span });
  }
  const rawUnparsed = Array.isArray(output.unparsed) ? output.unparsed.slice(0, MAX_ITEMS) : [];
  for (const raw of rawUnparsed) {
    if (!isRecord(raw)) continue;
    const span = spanOf(text, raw.quote);
    const reason = UNPARSED_REASONS.find((r) => r === raw.reason);
    if (span && reason) unparsed.push({ span, reason });
  }
  return { response: aiResponseSchema.parse({ entries, unparsed, engine: 'ai' }), ungrounded, checked };
}

export function toResponse(text: string, output: unknown): AiResponse {
  return toGroundedResponse(text, output).response;
}
