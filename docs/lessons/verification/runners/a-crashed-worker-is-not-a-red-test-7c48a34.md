# A Crashed Worker Is Not a Red Test

**Why it matters:** whenever a suite runs its files on parallel workers under a
memory ceiling, and a change adds cases to a list that more than one file reads.

## The concept

A test runner reports what its workers told it. A test that fails reports a
failure; a worker that dies — out of memory, killed by the host — reports
nothing, and the summary counts the files it heard from. So a suite can lose a
whole file of checks and still print green. The tell is arithmetic: the number
of files that passed against the number the runner found. Anyone reading the
summary for the word "passed" will not see it; anyone comparing the two numbers
will.

The second half is where a fixture lives. A shared list of cases is read by
every test that imports it, so adding a row costs what the most expensive reader
pays, not what the test you wrote it for pays.

## In this codebase

`missionCases` in `test/grid.ts` feeds the mission sweep and also
`test/model.test.ts`, which builds the model of every mission at every staging
step. The three crossfed rows for #125 were first added to `missionCases`; the
model test's worker ran out of memory and vitest printed `24 passed (25)` with
no failure anywhere in the output. The rows moved to `sweepCases`, a list only
`test/mission-sweep.test.ts` reads.

## What made it real

The count was the only evidence: 24 of 25 files, and nothing red. In the sweep
the same three rows cost 1.5 s of a suite that runs for about 130 s; in the
model test they cost a worker.

## Key takeaway

Read a test summary as two numbers, not one word: a file that never finishes is
neither passed nor failed, and only the count says so.
