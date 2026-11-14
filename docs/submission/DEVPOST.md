# Devpost submission text

Ready to paste, field by field.

## Project title

KinTrace

## Tagline

Your family tree, checked against clinical guidelines

## About the project

### Inspiration

Family history is the cheapest screening input in medicine. It needs no blood test and no scanner, only the right questions, and published guidelines already say which family patterns should lead to a referral: a mother with breast cancer before 40, three relatives with bowel cancer across two generations, a father with a heart attack before 60. Yet most people do not know which relatives matter, and a short appointment rarely leaves time to draw a family tree properly. We wanted anyone, anywhere, to walk into that appointment already knowing which criteria their family meets, and why.

### What it does

KinTrace lets you draw your family tree, or describe it in a sentence, pick a published clinical guideline, and see which referral criteria your family history meets.

- It covers breast and ovarian cancer (NICE CG164), Lynch syndrome (Amsterdam II), and early heart disease and familial hypercholesterolaemia (NICE CG71, the Dutch Lipid Clinic Network family-history item, NICE NG238).
- Every finding is one of three: Meets criteria, Worth discussing or No criteria met. Each shows the exact rule steps and rings the relatives who triggered it on the tree.
- It never gives a risk percentage, a probability or a diagnosis.
- A "What we don't know" panel shows missing ages and unknown relatives. Unknown is never treated as healthy: if a missing fact could satisfy a criterion, the finding says Worth discussing and names what would settle it.
- A comparison view puts the guidelines side by side, so you can see why they disagree. For example, a father's heart attack at 57 counts for the two NICE guidelines (limit 60) but not for the Dutch Lipid Clinic item (limit 55 for men).
- The output is a one-page report for your doctor, with an option to hide names.
- Everything runs in your browser. There are no accounts, no database and no analytics.

### How we built it

- **Client-only core.** React, TypeScript in strict mode and Vite. The family tree is a pure TypeScript data structure: every change returns a new tree or a typed refusal, and every saved tree is checked against the same zod schema the loader uses. State lives in memory and `localStorage` (Zustand), with a Clear everything button.
- **Deterministic rules.** Each guideline is a set of plain functions that narrow candidate relatives step by step. Each test on a person answers passed, failed or unknown, which is how unknown data becomes "Worth discussing" instead of a silent "no". A relationship engine computes degree, side of the family and lines of descent, and counts only biological links.
- **AI in exactly one place.** Quick add turns free text ("My mum had breast cancer at 38") into proposed tree entries. An offline English parser does this in the browser by default. If the user switches AI on, one serverless function on Vercel calls a hosted model (NVIDIA's API) with only the typed sentence. Every entry is validated against the shared schema, any entry quoting words that are not in the input is dropped, the user accepts each entry, and any failure falls back to the offline parser.
- **Verification as a product feature.** One command, `npm run verify`, runs lint, strict types, unit, component, property and fuzz tests with coverage thresholds, the build, browser tests in Chromium, Firefox and WebKit under a guard (console errors, failed requests, overflow, accessibility, layout shift, focus loss), a secret scan of the source, the build and git history, a dependency audit, a hygiene scan and a documentation check that verifies every number in the README. Mutation testing (Stryker) checks that the rule tests actually catch broken rules.
- **How the code was written.** We built it with an AI coding assistant (Claude Code), working to a written build standard: tests written with each feature, every claim backed by a command's output, and a step-by-step log of decisions. The product's findings never come from a model; the assistant wrote code that is tested like any other code.

### Challenges we ran into

- **Unknown is not "no".** The natural way to code a rule is "if mother had breast cancer before 40". That quietly treats a missing age as healthy. We rebuilt the rule engine so every check is three-valued, and the UI explains what is missing.
- **Guidelines disagree.** The same father counts under one guideline and not another. Rather than hide that, we made it a feature: the comparison view shows each guideline's threshold and who it counted.
- **Trusting a model's output.** Models invent things. The parse function checks every quoted phrase against the user's text, refuses an answer when most entries fail that check, and the user still confirms each entry.
- **Privacy you can test.** "Nothing leaves your device" is easy to claim. We wrote a browser test that runs the whole flow and fails on any request to another origin, self-hosted the fonts, and shipped a strict Content-Security-Policy.
- **Edge cases.** Testing found 16 real bugs, including two browser tabs silently overwriting each other's tree, blocked storage reported as saved, a double click adding two people, the report dated the wrong day in some time zones, and an adopted user being told to "add your parents".

### Accomplishments that we're proud of

- No risk numbers anywhere, and a test suite that checks for them.
- 999 unit, component, property and fuzz tests, 266 browser tests across three engines and five screen widths, and a mutation score of 78.4% on the guideline rules and relationship engine.
- A full demo with zero keys: the sample family and the offline parser need nothing but a browser.
- A one-page doctor report that always prints on one page.

### What we learned

- The hard part of clinical software is not the happy path; it is missing data, conflicting sources and saying clearly what the software does not know.
- Deterministic code and a model are good at different things. Letting the model only propose, and letting code and the user decide, kept both the system and its tests simple.
- Writing the verification first (a guard on every browser test, a docs check on every README number) caught problems we would never have found by clicking around.

### What's next for KinTrace

- More conditions: familial colorectal cancer beyond Lynch syndrome, inherited cardiomyopathy and sudden cardiac death in the young.
- More guidelines, so users can choose the guidance their own health system uses.
- More languages, each reviewed by fluent speakers, with an offline parser for each.
- Review of the rules and wording by clinical geneticists and cardiologists.

### Limitations (honest)

- KinTrace is not a medical device and does not replace a clinician or genetic counsellor.
- The guidelines come from UK, Dutch and international sources; local guidance may differ.
- The Spanish and Hindi translations still need review by fluent speakers. The offline parser reads English only.
- Rules see relatives up to third degree, and some specialist criteria are not implemented. The AI parser is less accurate than the offline one and relies on the user checking each suggestion.

## Built with

TypeScript, React, Vite, React Router, Zustand, zod, Vitest, Testing Library, fast-check, Playwright, axe-core, Stryker, ESLint, Vercel (static hosting and one serverless function), NVIDIA API (hosted model for the optional parser), Barlow Condensed (self-hosted font).

## Try it out

- Live site: https://kintrace-beta.vercel.app
- Code: https://github.com/SurabhiD2008/KinTrace
