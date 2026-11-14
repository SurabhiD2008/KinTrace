# Bugs found

Found during the bug hunt of 2026-11-13 (coverage, property-based and metamorphic tests, fuzzing,
browser edge cases, privacy audit). Each entry: what broke, how it was found, the fix, and the
regression test that fails without the fix.

## BUG-001: an edit could save a family tree that would not load again (silent data loss)

- **What broke.** `updatePerson`, `addPerson` and `setCondition` did not check values. An age of
  121, -1, 12.5 or NaN, a name over 80 characters, notes over 2000 characters, a birth year
  outside 1800 to 2200, an onset age over 120 or a subtype over 40 characters were all accepted
  and autosaved. On the next reload `deserialize` refused the stored tree, the app started empty,
  and the next edit overwrote the stored copy: the whole tree was gone. The person drawer and the
  start card guarded their own inputs, but any other caller (Quick add, the resolver, a future
  feature) could reach the unguarded mutation.
- **How found.** Reading `src/domain/mutations.ts` next to `src/domain/schema.ts`, then confirmed
  by the mutation-sequence property (random valid and invalid mutations must leave a pedigree
  that `deserialize(serialize(...))` accepts).
- **Fix.** Every mutation now checks the person or condition it produces against the same zod
  schema the loader uses (`personProblem` in `src/domain/mutations.ts`) and refuses with the new
  typed error `invalid_value` (ages keep the specific messages the drawer already showed).
  `createPedigree` drops proband values that could not be stored.
- **Regression tests.** `tests/unit/domain/storable.test.ts` (17 cases, all fail on the old code);
  `tests/unit/properties/mutations.property.test.ts` › "each step returns a typed error or a
  pedigree that validates structurally and loads again" (fails on the old code with a
  counterexample).

## BUG-002: a hostile or confused AI answer could write an unknown condition into the tree

- **What broke.** The shared parser contract accepted any string as an ambiguity option. An AI
  answer such as `ambiguity: { kind: "condition", options: ["breast", "admin"] }` passed the
  schema; choosing "admin" made the resolver call `setCondition` with code `admin`, which was
  stored with no domain. The tree then failed to load on the next visit (the same data loss as
  BUG-001).
- **How found.** Reading `src/parser/resolve.ts` (`decision.option as ProposedCondition['code']`)
  while writing resolver coverage tests.
- **Fix.** `proposedEntrySchema` refuses an option that is not a known value for its kind
  (condition codes, relation keys, sides), so the browser falls back to the offline parser.
  `setCondition` refuses an unknown code as a second line of defence.
- **Regression tests.** `tests/unit/domain/storable.test.ts` › "the shared schema refuses an
  ambiguity option that is not a known value" and "even if such an entry reached the resolver,
  choosing the bad option is refused, not saved".

## BUG-003: a half-aunt was named, but her half-niece was "relative (3rd degree)"

- **What broke.** The relationship engine named a half-aunt or half-uncle, but the inverse
  relationship fell through to the generic label "relative (3rd degree)", so the two labels of
  one pair did not mirror each other and the report showed a vague label for a known relative.
- **How found.** Property "labels are inverses (mother <-> daughter or son)" in
  `tests/unit/properties/relationships.property.test.ts`; fast-check shrank it to a six-person
  counterexample.
- **Fix.** New relationship kind `halfNibling` ("half-niece", "half-nephew", "half-niece or
  half-nephew") in `src/domain/relationships.ts` and `src/i18n/en.ts`. The earlier unit test that
  pinned the old fallback label was corrected, with a comment pointing here.
- **Regression tests.** The inverse-label property above, and the `hniece` row of
  `tests/unit/domain/relationships.test.ts`.

## BUG-004: the order of relatives in a finding's sentence depended on internal ids

- **What broke.** A step sentence such as "A first-degree relative has had angina or a heart
  attack (your brother at 65; your brother at 0)" listed people in the order of their internal
  ids, that is, the order they happened to be added. The same family entered in a different order
  produced a differently worded finding and report.
- **How found.** Property "renaming every id consistently changes nothing except the ids" in
  `tests/unit/properties/engine.property.test.ts`.
- **Fix.** `outcome()` in `src/guidelines/candidates.ts` lists people by degree, then by their
  description with a fixed numeric collation (`Intl.Collator('en', { numeric: true })`), so ages
  read in number order and the device locale cannot change the order.
- **Regression test.** The rename-invariance property above (fails on the old code).

## BUG-005: the offline parser could break the shared parser contract

- **What broke.** The contract allows at most 100 entries and 100 unparsed pieces (the AI path
  enforces it). The offline parser returned 150 entries for "Mum: breast." repeated, 220 for a
  chain of "my mum's", and 600 unparsed pieces for "x. " repeated, so its output failed
  `parseResultSchema` and the UI received an unbounded list.
- **How found.** Parser fuzzing (`tests/unit/fuzz/parser.fuzz.test.ts`, the named pathological
  inputs).
- **Fix.** `withinContract` in `src/parser/offline.ts` keeps the first 100 entries and hands
  everything that did not fit back as one "too long" piece, never dropping text silently. The cap
  is one constant, `MAX_PARSE_ITEMS`, used by the schemas too.
- **Regression tests.** "keeps to the contract cap of 100 entries and hands the rest back as
  'too long' ", and the "many short sentences", "many relatives in one sentence" and
  "'my mum's ' chain" cases in the same file.

## BUG-006: an exported file re-saved by a text editor could not be imported

- **What broke.** A JSON export opened and saved in Windows Notepad gains a byte-order mark, and
  some editors save UTF-16. `JSON.parse` refuses a leading BOM and the file reader decoded UTF-16
  as UTF-8, so a valid export was refused as "not valid JSON". A huge file was also read fully
  into memory before the size check.
- **How found.** Import fuzzing (BOM and UTF-16 inputs in `tests/unit/fuzz/import.fuzz.test.ts`).
- **Fix.** `deserialize` strips a leading BOM; `decodeText` in `src/pages/build/files.ts` reads
  UTF-8 (with or without BOM) and UTF-16 LE/BE from the bytes; the builder refuses a file over
  `MAX_IMPORT_BYTES` before reading it.
- **Regression tests.** "a file with a byte-order mark loads " and "UTF-16 files, little
  and big endian, and UTF-8 with a BOM decode to the same tree " (both fail on the old
  code); e2e `12. imports: ... 5 MB ...`.

## BUG-007: the report could be dated the wrong day, even the wrong year

- **What broke.** `formatDate` formatted a `Date` in UTC, while the page took the year for ages
  from the local clock. In Kiritimati (UTC+14) on the morning of 1 January the report was dated
  31 December of the previous year; in Pago Pago (UTC-11) on the evening of 31 December it was
  dated 1 January of the next year, next to ages computed for the other year.
- **How found.** Reading `src/i18n/index.ts` while planning the clock and time-zone scenario.
- **Fix.** A `Date` is formatted on the user's own clock; ISO calendar dates (source review
  dates) still read the same in every zone.
- **Regression tests.** `tests/unit/i18n/dates.test.ts` (Kiritimati and Pago Pago cases fail on
  the old code); e2e `tests/e2e/edge/clock.spec.ts` (`18a`, `18b`).

## BUG-008: two tabs silently overwrote each other's family tree

- **What broke.** With the builder open in two tabs, an edit in tab B saved B's stale tree over
  the change just made in tab A, with no warning.
- **How found.** Reading `src/state/store.ts` (no `storage` event handling) for scenario 11.
- **Fix.** `watchOtherTabs` passes browser `storage` events to the store; when another tab saves
  a different tree (compared by content, not key order), saving pauses and every page shows
  "Another tab changed this tree" with Reload and Keep this tab's version. A tab with nothing
  started takes the other tab's tree straight away.
- **Regression tests.** `tests/unit/state/tabs.test.tsx`; e2e `11. two tabs: ...`.

## BUG-009: blocked storage was silent, and the page claimed the tree was saved

- **What broke.** When the browser blocks `localStorage`, the store ran with no storage and no
  error, while the builder still said "Your family tree is saved on this device only." Notices
  for a tree that could not be opened, or a save that failed, appeared only on `/build`.
- **How found.** Reading `defaultStorage()` and the notice placement for scenario 10.
- **Fix.** The store reports `storageBlocked`; a `StorageNotice` in the app shell shows the
  blocked, save-failed, could-not-open and other-tab notices on every page; the "saved on this
  device" line is hidden while storage is blocked.
- **Regression tests.** `tests/unit/state/tabs.test.tsx` › "storage that cannot be used"; e2e
  `10b`, `10c`, `10d`, `10e`.

## BUG-010: double-clicking an add button added two people

- **What broke.** The "Add mother" and "Add father" buttons in the first-visit prompt stayed on
  screen after one press, so a double-click added two mothers (the second as another female
  biological parent). "Add partner" moved the selection to the new partner, so a double-click
  added a partner and then that partner's partner.
- **How found.** E2e `9a. double-clicking Add mother, Add father, Add partner or a dialog's Add
  adds exactly one person each` failed (3 people instead of 2, then 5 instead of 4).
- **Fix.** Each prompt button disappears once that parent exists, and the add buttons use
  `singleClick` (`src/ui/events.ts`), which ignores the second click of a double-click.
- **Regression test.** E2e `9a` (fails on the old code at both steps).

## BUG-011: a hung AI service kept the user waiting 10 seconds

- **What broke.** The browser's AI timeout was 10 seconds, so a hung `/api/parse` delayed the
  offline fallback past the 9-second budget.
- **How found.** E2e `13c. the API hangs for 10 seconds: falls back within 9 seconds` failed.
- **Fix.** `CLIENT_TIMEOUT_MS` is 8.2 seconds (first 8.5, see BUG-015): still longer than the
  server's 8-second model timeout, so the server can answer first.
- **Regression tests.** E2e `13c`; unit `client timeout` in
  `tests/unit/parser/ai.test.ts`.

## BUG-012: an adopted user with unknown birth parents was told to "add your parents"

- **What broke.** For a proband with adoptive parents and no biological parents, the findings and
  report said the tree "has no blood relatives yet. Add your parents", and nothing said that
  their biological history is unknown (scenario 5 requires that it is said, and that unknown is
  never treated as healthy).
- **How found.** E2e scenario 5 written against the page text.
- **Fix.** `ReviewGate` shows "Your biological family history is not known" (nothing about the
  biological family is counted or assumed healthy; adoptive relatives never count) on findings,
  compare and report, and an adoption-specific empty-state sentence.
- **Regression test.** E2e `5. an adopted-in proband with unknown biological parents is told
  their biological history is unknown`.

## BUG-013: consanguinity was computed but never shown

- **What broke.** The relationship engine flags people related through more than one line, but
  no page showed it, so first-cousin parents went unmentioned.
- **How found.** E2e scenario 3 ("flagged") had nothing to find.
- **Fix.** The person drawer and the read-only popover say "Related to you through more than one
  line of the family"; findings, compare and report say "Your parents are blood relatives" when
  the proband's biological parents share an ancestor (with a note that the guidelines do not
  account for it).
- **Regression test.** E2e `3. consanguineous parents (first cousins) are flagged and degrees
  are right`.

## BUG-014: test runs left the repository changed; the 404 page was unbranded

- **What broke.** `npm run test:e2e` overwrote the six PNGs in `docs/screenshots` on every run,
  so a clean checkout was dirty after testing (and three runs in a row could never be compared).
  Separately, the not-found page had no KinTrace name or brand, only a card.
- **How found.** `git status` after the baseline e2e run; e2e `14b`.
- **Fix.** The screenshot generator moved to `tests/screenshots` with its own config and
  `npm run screenshots`; the 404 page shows the KinTrace wordmark linking home and a primary
  "Back to the start" button.
- **Regression tests.** The e2e suite leaves `git status` clean (checked in the three-run loop);
  e2e `14b`.

## BUG-015: the hung-API test was flaky (9042 ms against a 9000 ms budget)

- **What broke.** In the second of three consecutive `test:all` runs, e2e `13c` failed: the fallback
  notice appeared 9042 ms after the click. The 8.5-second client timeout left about 0.5 s for the
  offline parse and the render, and the test measured with Playwright's own clock, so its polling
  interval and the load from parallel workers counted against the app.
- **How found.** The three-runs-in-a-row loop (pass, fail, pass).
- **Fix.** Both causes: the client timeout is 8.2 s (still above the server's 8 s model timeout),
  and the test times the fallback inside the page (click to notice, with `performance.now` and a
  `MutationObserver`), so only the app's own time is measured. No retry or sleep was added.
- **Regression test.** e2e `13c`, repeated 3 × 3 times green, then in the final three `test:all` runs.

## BUG-016: the deployed parse function crashed on every request

- **What broke.** On the first Vercel deployment, `/api/parse` answered HTTP 500
  (`FUNCTION_INVOCATION_FAILED`) to every request, including the health check, so Quick add with
  AI on always fell back to the offline parser. Vercel compiles each file of a function to
  JavaScript on its own, and the package is an ES module, so Node resolves imports exactly as
  written; the function's imports had no file extensions (`./_lib/config`), which only a bundler
  resolves. Every local test imported the TypeScript through Vite, which hid it.
- **How found.** The production smoke check (`npm run smoke -- <live url>`) after the first deploy.
- **Fix.** Every relative import in the function and the two shared files it uses
  (`src/parser/types.ts`, `src/domain/types.ts`) names its `.js` file, which TypeScript and Vite
  map back to the `.ts` source.
- **Regression test.** `tests/unit/api/esm-load.test.ts` compiles each file the way Vercel does and
  loads the function with plain Node; without the fix it fails with `ERR_MODULE_NOT_FOUND`.

## Not bugs (investigated, behaviour kept)

- `-0` as an age loads as `0`: JSON has no distinct negative zero, and the stored copy is clean.
- The comparison table scrolls sideways inside its own labelled, focusable region on phones:
  WCAG 1.4.10 allows two-dimensional scrolling for data tables; the page itself never scrolls
  sideways.
- A mother with breast cancer before 50 and no side recorded makes CG164 "Worth discussing":
  the documented reading that missing laterality is unknown (`docs/RULES.md`).
- The `<style>` element on the report was replaced by CSS named pages because the new
  Content-Security-Policy (`style-src 'self'`) would block it; PDF widths are still A4 595 pt
  and Letter 612 pt.
