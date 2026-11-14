// Structured log lines for the parser function: one JSON object per line on
// standard output. Only codes, counts and timings: never the user's text, the
// model's answer, a key or anything else about a family.

export interface CallLog {
  event: 'model_call';
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  outcome: string;
  totalTokens?: number;
  /** Entries dropped because their quote was not in the text. */
  droppedUngrounded?: number;
}

export type Logger = (line: CallLog) => void;

export const writeLog: Logger = (line) => {
  process.stdout.write(`${JSON.stringify({ level: 'info', ...line })}\n`);
};
