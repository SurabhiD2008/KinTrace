// Generated inputs per property take longer than the 5-second default.
vi.setConfig({ testTimeout: 120_000 });
import fc from 'fast-check';
import { STRUCTURAL_CODES, createSamplePedigree, deserialize, pedigreeSchema, serialize, validatePedigree } from '../../../src/domain';
import { decodeText, readTextFile } from '../../../src/pages/build/files';
import { fcOptions, pedigreeArb } from '../generators';

// Hostile import files. deserialize must always return a readable error or a
// clean pedigree: no exception, no hang, no change to Object.prototype.

const BUDGET_MS = 200;
const protoKeys = () => Object.getOwnPropertyNames(Object.prototype).sort().join(',');
const PROTO_BEFORE = protoKeys();

function expectSafe(text: string) {
  const start = performance.now();
  let result: ReturnType<typeof deserialize> | undefined;
  expect(() => {
    result = deserialize(text);
  }).not.toThrow();
  const ms = performance.now() - start;
  expect(ms, `took ${ms.toFixed(0)} ms`).toBeLessThan(BUDGET_MS);
  expect(protoKeys()).toBe(PROTO_BEFORE);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  if (!result) throw new Error('no result');
  if (result.ok) {
    expect(pedigreeSchema.safeParse(result.pedigree).success).toBe(true);
    const structural = validatePedigree(result.pedigree).filter((i) => i.severity === 'error' && STRUCTURAL_CODES.has(i.code));
    expect(structural).toEqual([]);
    expect(Object.getPrototypeOf(result.pedigree.persons)).toBe(Object.prototype);
  } else {
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.length).toBeLessThanOrEqual(20);
    for (const error of result.errors) {
      expect(typeof error).toBe('string');
      expect(error.length).toBeGreaterThan(0);
      expect(error.length).toBeLessThan(400);
    }
  }
  return result;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Every path to a value inside a JSON document. */
function paths(value: Json, prefix: (string | number)[] = [], out: (string | number)[][] = []): (string | number)[][] {
  out.push(prefix);
  if (Array.isArray(value)) value.forEach((item, i) => paths(item, [...prefix, i], out));
  else if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) paths(v, [...prefix, k], out);
  return out;
}

function parentAt(root: Json, path: (string | number)[]): { parent: Json; key: string | number } | null {
  if (path.length === 0) return null;
  let node: Json = root;
  for (const step of path.slice(0, -1)) node = (node as Record<string | number, Json>)[step] as Json;
  return { parent: node, key: path[path.length - 1] as string | number };
}

const STRANGE: Json[] = [null, true, 0, -1, 121, 12.5, '', 'NaN', 'Infinity', '1e999', '-0', [], {}, 'x'.repeat(5000), ['p1'], { id: 'p1' }];
const mutationArb = fc.record({ op: fc.constantFrom('delete', 'swap', 'dupId', 'dangle', 'selfParent', 'cycle', 'proto', 'constructor'), at: fc.nat(), value: fc.constantFrom(...STRANGE) });

function mutate(text: string, m: { op: string; at: number; value: Json }): string {
  const doc = JSON.parse(text) as { [key: string]: Json };
  const all = paths(doc).filter((p) => p.length > 0);
  const target = all[m.at % all.length] ?? ['version'];
  const where = parentAt(doc, target);
  const persons = doc.persons as Record<string, Json>;
  const ids = Object.keys(persons);
  const someone = ids[m.at % ids.length] ?? 'p1';
  const links = doc.parentLinks as Json[];
  switch (m.op) {
    case 'delete':
      if (where && Array.isArray(where.parent)) where.parent.splice(Number(where.key), 1);
      else if (where && where.parent && typeof where.parent === 'object') Reflect.deleteProperty(where.parent, where.key);
      break;
    case 'swap':
      if (where && where.parent && typeof where.parent === 'object') (where.parent as Record<string | number, Json>)[where.key] = m.value;
      break;
    case 'dupId':
      persons.zz = { ...(persons[someone] as object) };
      break;
    case 'dangle':
      links.push({ childId: someone, parentId: 'ghost', kind: 'biological' });
      break;
    case 'selfParent':
      links.push({ childId: someone, parentId: someone, kind: 'biological' });
      break;
    case 'cycle': {
      const link = links[m.at % Math.max(links.length, 1)] as { childId: string; parentId: string } | undefined;
      if (link) links.push({ childId: link.parentId, parentId: link.childId, kind: 'step' });
      break;
    }
    case 'proto':
      // JSON.stringify would drop a real __proto__ key, so it is written into the text.
      return JSON.stringify(doc).replace('{', '{"__proto__":{"polluted":true},');
    case 'constructor':
      return JSON.stringify(doc).replace('"persons":{', '"persons":{"constructor":{"prototype":{"polluted":true}},');
  }
  return JSON.stringify(doc);
}

describe('import fuzzing', () => {
  it('a valid export, mutated at random, is either refused with readable errors or loads cleanly', () => {
    fc.assert(
      fc.property(pedigreeArb, fc.array(mutationArb, { minLength: 1, maxLength: 4 }), (ped, mutations) => {
        let text = serialize(ped);
        for (const m of mutations) {
          try {
            text = mutate(text, m);
          } catch {
            // A mutation that made the text unparseable for the next mutation: keep the text as it is.
          }
        }
        expectSafe(text);
      }),
      fcOptions,
    );
  });

  it('random text and random JSON never throw', () => {
    fc.assert(fc.property(fc.oneof(fc.string(), fc.json(), fc.jsonValue().map((v) => JSON.stringify(v))), (text) => void expectSafe(text)), fcOptions);
  });

  const sample = serialize(createSamplePedigree());
  const doc = () => JSON.parse(sample) as Record<string, unknown>;
  const cases: [string, () => string][] = [
    ['1e999 as an age', () => sample.replace('"ageNow":34', '"ageNow":1e999')],
    ['"NaN" as an age', () => sample.replace('"ageNow":34', '"ageNow":"NaN"')],
    ['100000-element parent links', () => JSON.stringify({ ...doc(), parentLinks: new Array(100_000).fill(0) })],
    ['100000 people', () => JSON.stringify({ ...doc(), persons: Object.fromEntries(Array.from({ length: 100_000 }, (_, i) => [`p${i}`, 0])) })],
    ['JSON nested 10000 levels deep', () => `${'['.repeat(10_000)}${']'.repeat(10_000)}`],
    ['nesting 10000 deep inside a person', () => sample.replace('"conditions":[]', `"conditions":${'['.repeat(10_000)}${']'.repeat(10_000)}`)],
    ['a 5 MB file', () => sample + ' '.repeat(5 * 1024 * 1024)],
    ['__proto__ at the top', () => sample.replace('{', '{"__proto__":{"polluted":true},')],
    ['__proto__ as a person id', () => sample.replace('"persons":{', '"persons":{"__proto__":{"id":"__proto__","sex":"female","deceased":false,"conditions":[]},')],
    ['constructor.prototype', () => sample.replace('{', '{"constructor":{"prototype":{"polluted":true}},')],
    ['a future schema version', () => sample.replace('"version":1', '"version":2')],
    ['version as a string', () => sample.replace('"version":1', '"version":"1"')],
    ['an empty file', () => ''],
    ['the word null', () => 'null'],
    ['an array', () => '[]'],
    ['a self-parent', () => JSON.stringify({ ...doc(), parentLinks: [{ childId: 'mother', parentId: 'mother', kind: 'biological' }] })],
    ['a cycle', () => JSON.stringify({ ...doc(), parentLinks: [...(doc().parentLinks as unknown[]), { childId: 'mgm', parentId: 'proband', kind: 'adoptive' }] })],
    ['duplicate ids under two keys', () => sample.replace('"persons":{', '"persons":{"copy":{"id":"mother","sex":"female","deceased":false,"conditions":[]},')],
  ];
  it.each(cases)('%s', (_name, make) => {
    const result = expectSafe(make());
    expect(result.ok).toBe(false);
  });

  it('negative zero as an age loads as a clean 0', () => {
    const result = expectSafe(sample.replace('"ageNow":34', '"ageNow":-0'));
    expect(result.ok && serialize(result.pedigree)).toContain('"ageNow":0');
  });

  it('a file with a byte-order mark loads', () => {
    expect(expectSafe(`\uFEFF${sample}`).ok).toBe(true);
  });

  it('UTF-16 files, little and big endian, and UTF-8 with a BOM decode to the same tree', async () => {
    const utf16le = new Uint8Array([0xff, 0xfe, ...[...sample].flatMap((ch) => [ch.charCodeAt(0) & 0xff, ch.charCodeAt(0) >> 8])]);
    const utf16be = new Uint8Array([0xfe, 0xff, ...[...sample].flatMap((ch) => [ch.charCodeAt(0) >> 8, ch.charCodeAt(0) & 0xff])]);
    const utf8bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(sample)]);
    for (const bytes of [utf16le, utf16be, utf8bom]) {
      expect(decodeText(bytes)).toBe(sample);
      expect(deserialize(await readTextFile(new File([bytes], 'family.json'))).ok).toBe(true);
    }
  });

  it('a binary file is refused with a readable error', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0xff, 0xd8]);
    const result = expectSafe(await readTextFile(new File([png], 'photo.png')));
    expect(result.ok).toBe(false);
  });
});
