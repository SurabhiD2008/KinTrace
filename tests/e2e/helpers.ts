import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { addChild, addParent, addSibling, createPedigree, createSamplePedigree, serialize, setCondition } from '../../src/domain';
import type { MutationResult, Pedigree } from '../../src/domain';

export const STORAGE_KEY = 'kintrace.pedigree.v1';

/** Puts a family tree on the device before the page loads, as if the user had built it. */
export async function seed(page: Page, ped: Pedigree): Promise<void> {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, serialize(ped)] as const);
}

export async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
}

function must(result: MutationResult): { ped: Pedigree; id: string } {
  if (!result.ok || result.createdId === null) throw new Error(result.ok ? 'nothing created' : result.error.message);
  return { ped: result.pedigree, id: result.createdId };
}

/** The proband and 25 blood relatives over four generations, several with conditions. */
export function familyOf25(): Pedigree {
  let ped = createPedigree({ sex: 'female', ageNow: 40, displayName: 'Proband Person' });
  const me = ped.probandId;
  let step = must(addParent(ped, me, { sex: 'female', ageNow: 68 }));
  ped = step.ped;
  const mum = step.id;
  step = must(addParent(ped, me, { sex: 'male', ageNow: 70 }));
  ped = step.ped;
  const dad = step.id;
  const grand: string[] = [];
  for (const parent of [mum, dad]) {
    for (const sex of ['female', 'male'] as const) {
      step = must(addParent(ped, parent, { sex, deceased: true }));
      ped = step.ped;
      grand.push(step.id);
    }
  }
  const sibs: string[] = [];
  for (const sex of ['female', 'male', 'female', 'male'] as const) {
    step = must(addSibling(ped, me, { sex, ageNow: 35 }));
    ped = step.ped;
    sibs.push(step.id);
  }
  const auntsUncles: string[] = [];
  for (const [parent, sex] of [[mum, 'female'], [mum, 'male'], [mum, 'female'], [dad, 'male'], [dad, 'female'], [dad, 'male']] as const) {
    step = must(addSibling(ped, parent, { sex, ageNow: 65 }));
    ped = step.ped;
    auntsUncles.push(step.id);
  }
  for (const parent of auntsUncles) {
    step = must(addChild(ped, parent, { sex: 'female', ageNow: 38 }));
    ped = step.ped;
  }
  for (const sex of ['female', 'male', 'female'] as const) {
    step = must(addChild(ped, me, { sex, ageNow: 12 }));
    ped = step.ped;
  }
  const conditions: [string, Parameters<typeof setCondition>[2]][] = [
    [mum, { code: 'breast', ageAtOnset: 42 }],
    [dad, { code: 'coronary_event', ageAtOnset: 52 }],
    [grand[0] as string, { code: 'ovarian', ageAtOnset: 60 }],
    [sibs[0] as string, { code: 'breast', ageAtOnset: 33 }],
    [auntsUncles[0] as string, { code: 'colorectal', ageAtOnset: 48 }],
  ];
  for (const [id, condition] of conditions) {
    const result = setCondition(ped, id, condition);
    if (!result.ok) throw new Error(result.error.message);
    ped = result.pedigree;
  }
  return ped;
}

/** The sample family with real-looking names, so hiding them can be checked. */
export function namedSample(): { ped: Pedigree; names: string[] } {
  const sample = createSamplePedigree();
  const names: Record<string, string> = { mother: 'Asha Rao', father: 'Vikram Rao', maunt: 'Leela Iyer', mgm: 'Kamala Iyer', sister: 'Meera Rao' };
  const persons = Object.fromEntries(
    Object.entries(sample.persons).map(([id, person]) => [id, names[id] ? { ...person, displayName: names[id] } : person]),
  );
  return { ped: { ...sample, persons }, names: Object.values(names) };
}
