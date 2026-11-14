import { readFileSync, writeFileSync } from 'node:fs';

// Runs after `stryker run` (npm run test:mutation): reads Stryker's JSON report and writes
// the committed summary in docs/mutation-score.json, which the README quotes and the
// verify docs check compares against. The score uses Stryker's definition: killed and
// timed-out mutants over every mutant that was scored (runtime and compile errors excluded).

const report = JSON.parse(readFileSync('reports/mutation/mutation.json', 'utf8'));
const tally = {};
for (const file of Object.values(report.files)) {
  for (const mutant of file.mutants) tally[mutant.status] = (tally[mutant.status] ?? 0) + 1;
}
const killed = (tally.Killed ?? 0) + (tally.Timeout ?? 0);
const scored = killed + (tally.Survived ?? 0) + (tally.NoCoverage ?? 0);
const summary = {
  date: new Date().toISOString().slice(0, 10),
  scope: 'src/guidelines and src/domain/relationships.ts',
  score: Number(((killed / scored) * 100).toFixed(1)),
  killed,
  scored,
  survived: tally.Survived ?? 0,
  noCoverage: tally.NoCoverage ?? 0,
  excluded: (tally.RuntimeError ?? 0) + (tally.CompileError ?? 0),
};
writeFileSync('docs/mutation-score.json', `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`Mutation score ${summary.score}% (${killed} of ${scored} scored mutants killed)\n`);
