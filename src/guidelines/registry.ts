import type { Pedigree } from '../domain';
import { summarise } from './engine';
import { amsterdam2 } from './profiles/amsterdam2';
import { cg71, dlcn, ng238 } from './profiles/cardio';
import { cg164 } from './profiles/cg164';
import type { EvaluateOptions, GuidelineProfile, GuidelineResult } from './types';

const GUIDELINES: readonly GuidelineProfile[] = [cg164, amsterdam2, cg71, dlcn, ng238];

export function listGuidelines(): GuidelineProfile[] {
  return [...GUIDELINES];
}

export function getGuideline(id: string): GuidelineProfile | undefined {
  return GUIDELINES.find((guideline) => guideline.id === id);
}

/** Evaluates every guideline; each result carries the strongest status among its rules. */
export function evaluateAll(ped: Pedigree, opts: EvaluateOptions = {}): GuidelineResult[] {
  return GUIDELINES.map((guideline) => summarise(guideline.id, guideline.evaluate(ped, opts)));
}
