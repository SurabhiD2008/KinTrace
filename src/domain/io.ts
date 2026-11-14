import { t } from '../i18n';
import { pedigreeSchema } from './schema';
import { LIMITS, PEDIGREE_VERSION } from './types';
import type { Pedigree } from './types';
import { STRUCTURAL_CODES, validatePedigree } from './validate';

export type DeserializeResult =
  | { ok: true; pedigree: Pedigree }
  | { ok: false; errors: string[] };

export type MigrateResult = { ok: true; value: unknown } | { ok: false; errors: string[] };

/** Keys that could reach an object's prototype if copied carelessly. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_REPORTED_ERRORS = 20;

export function serialize(ped: Pedigree): string {
  return JSON.stringify(ped);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Walks the parsed value without recursion, so deep nesting cannot overflow the stack. */
function hasForbiddenKey(root: unknown): boolean {
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      for (const item of value) pending.push(item);
    } else if (isRecord(value)) {
      for (const key of Object.keys(value)) {
        if (FORBIDDEN_KEYS.has(key)) return true;
        pending.push(value[key]);
      }
    }
  }
  return false;
}

/**
 * Brings stored data from an older schema version up to the current one.
 * Version 1 is the first version, so there are no steps yet; data from a
 * newer version of the app is refused instead of being misread.
 */
export function migrate(raw: unknown): MigrateResult {
  if (!isRecord(raw) || typeof raw.version !== 'number') {
    return { ok: false, errors: [t('io.noVersion')] };
  }
  if (raw.version > PEDIGREE_VERSION) return { ok: false, errors: [t('io.newerVersion')] };
  return { ok: true, value: raw };
}

/**
 * Reads a pedigree from JSON text. Never throws: malformed, oversized or
 * structurally broken input comes back as a list of readable errors.
 * Unknown fields are dropped.
 */
export function deserialize(json: unknown): DeserializeResult {
  const reject = (...errors: string[]): DeserializeResult => ({ ok: false, errors });
  if (typeof json !== 'string') return reject(t('io.notText'));
  // A string is never shorter in UTF-8 bytes than in characters, so check the cheap bound first.
  if (json.length > LIMITS.maxBytes || new TextEncoder().encode(json).length > LIMITS.maxBytes) {
    return reject(t('io.tooLarge'));
  }

  let parsed: unknown;
  try {
    // Editors such as Windows Notepad add a byte-order mark, which JSON.parse refuses.
    parsed = JSON.parse(json.startsWith('﻿') ? json.slice(1) : json);
  } catch {
    return reject(t('io.notJson'));
  }
  if (hasForbiddenKey(parsed)) return reject(t('io.forbiddenKey'));

  const migrated = migrate(parsed);
  if (!migrated.ok) return reject(...migrated.errors);
  const raw = migrated.value;
  if (isRecord(raw) && isRecord(raw.persons)) {
    if (Object.keys(raw.persons).length > LIMITS.maxPersons) return reject(t('io.tooManyPeople'));
  }

  const result = pedigreeSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues
      .slice(0, MAX_REPORTED_ERRORS)
      .map((issue) => t('io.field', { path: issue.path.join('.'), message: issue.message }));
    return reject(...errors);
  }

  const structural = validatePedigree(result.data).filter(
    (issue) => issue.severity === 'error' && STRUCTURAL_CODES.has(issue.code),
  );
  if (structural.length > 0) {
    return reject(...structural.slice(0, MAX_REPORTED_ERRORS).map((issue) => issue.message));
  }
  return { ok: true, pedigree: result.data };
}
