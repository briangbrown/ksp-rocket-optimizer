# Snapshots pin the design

**Syllabus:** [V1](../../README.md#part-4--verification)

**Why it matters:** The design snapshot matters because the characteristic
failure in a solver is silent, a refactor believed to preserve behaviour
once altered 31 of 72 designs without a single error, and nothing but a
stored copy of every design can notice that; so 81 configurations are
solved on every run and compared against a committed baseline, every
number to four decimals, and a diff means the physics moved, which is
either the change you intended, to be explained and blessed, or the bug the
test exists to find, which blessing destroys the only evidence of.

**Before this:**
[A1](../../solver/the-search/closed-form-first-simulation-last.md), _The
shape of the search: closed form first, simulation last_.

## A worked case

Run the grid against its baseline on this machine, then nudge one case's
payload by one percent and see what a diff looks like:

| Measure                                          | Value                                |
| ------------------------------------------------ | ------------------------------------ |
| Configurations solved                            | 81                                   |
| Of which produce a design                        | 66; 15 are unbuildable at their tier |
| Time                                             | 16.1 s                               |
| Baseline                                         | 793 lines, 140,771 characters        |
| Lines differing from the baseline                | 0                                    |
| `tier5-pay3.5-dv5400-cost`, lines in its section | 13                                   |
| Lines that change when its payload rises 1%      | 11                                   |

The first differing line after the nudge is the design's total, 48.7500 t
to 48.7850 t, and ten more follow, because every stage's mass, burn time
and thrust-to-weight is printed to four decimals and a heavier payload
moves them all. That is the point of the format: a change to the physics
does not produce a subtle diff, it produces a loud one, and the test's job
is to make sure someone reads it.

```ts
// save as test/v1.test.ts and run: npx vitest run test/v1.test.ts --reporter=verbose
import { test } from "vitest";
import { readFileSync } from "node:fs";
import { solveGroup } from "../src/core/solver";
import { cases } from "./grid";
import { signature } from "../src/core/signature";

const differing = (a: string[], b: string[]) => {
  let n = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) n++;
  return n;
};

test("the design snapshot", () => {
  const t0 = performance.now();
  const all = cases(); // 3 tiers × 3 payloads × 3 Δv budgets × 3 objectives
  const solved = all.map(({ name, input }) => ({
    name,
    res: solveGroup(input),
  }));
  const s = (performance.now() - t0) / 1000;
  const text = solved.map(({ name, res }) => signature(name, res)).join("\n"); // what toMatchFileSnapshot compares
  const baseline = readFileSync("test/__snapshots__/designs.txt", "utf8");
  console.log(
    `${all.length} cases, ${solved.filter((x) => x.res).length} designs, ${s.toFixed(1)} s; ${text.split("\n").length} lines and ${text.length.toLocaleString("en-US")} chars; ${differing(text.split("\n"), baseline.split("\n"))} lines differ from the baseline`,
  );
  const c = all.find((x) => x.name === "tier5-pay3.5-dv5400-cost")!;
  const was = signature(c.name, solveGroup(c.input)).split("\n");
  const now = signature(
    c.name,
    solveGroup({ ...c.input, payload: c.input.payload * 1.01 }),
  ).split("\n");
  const first = was.findIndex((l, i) => l !== now[i]);
  console.log(
    `${c.name}: ${was.length} lines; payload +1% changes ${differing(was, now)} of them; first: "${was[first].trim()}" → "${now[first].trim()}"`,
  );
});
```

## The idea

A **snapshot test** compares a program's output with a stored copy of an
earlier output, and asserts nothing about whether the output is right,
only that it has not moved. That is a weaker claim than a test that knows
the answer, and for a solver it is the only claim available: nobody knows
what the optimal rocket for 3.5 t at 5,400 m/s on tier five is, but
everybody can see that yesterday's answer and today's differ. The **baseline**
is the stored copy, committed beside the code so that a change to either
travels in the same commit and the diff of the baseline is the record of
what the change did. To **bless** is to accept the current output as the
new baseline, and it is the moment the whole method turns on: blessed
deliberately, with the before and after written down, the baseline is a
history of every intended change to the physics; blessed to make a red
build green, it is a history of nothing, and the diff that would have shown
the bug is gone.

What is compared decides what can be caught. A hand-written list of fields
to check silently stops covering anything added later, so the signature
here serialises whatever the solver returns, walking the object and
printing every key in sorted order; a part collapses to its name, so the
snapshot says which parts were chosen and how many rather than restating
the part database, and a change to a part's mass still shows through the
stage masses it feeds. Every number is rounded to four decimals, one rule
for all fields because a per-field precision map is exactly what goes
stale, and because rounding is what makes the file portable: transcendental
functions can differ in the last bit across V8 builds, around 1e-13 on a
Δv of 3,600, far below the fourth decimal, so a different Node cannot move
a signature on its own. NaN and Infinity are printed as themselves, since
they are signal, not noise.

What is solved decides what can be seen, and this is where a snapshot's
honesty matters most. The grid drives `solveGroup` and reads its `best`,
the closed form's favourite; the application does not deliver that. For a
launch with the stage count left open, `planMission` walks the candidates
cheapest first through the ascent simulator and delivers the first that
flies, then re-solves against the flown cost. A change can leave `best`
byte-identical and hand the user a different rocket, and one did: dropping
a variant of the cluster cap looked free by the grid and moved eleven of
128 real missions, nine of them worse on the objective asked for. So there
is a second baseline, the mission sweep, sixteen whole missions through
`planMission` pinned on the delivered stages, blessed exactly as
deliberately; and a third, `solvability.txt`, which records which
destinations build at all and how big. Each pins a different layer, and a
change that is invisible to all three can still exist, which is why a
solver change nobody can explain deserves a wider sweep before it is
believed to be nothing.

```
   solver change ──► npm test ──► designs.txt   81 grid cases, `best`, every field to 4 dp
                              ├─► missions.txt  16 whole missions, the *delivered* stages
                              └─► solvability.txt  which destinations build, and how big
        green: the closed form's favourite, the delivered rockets and the reachable set all held
        red:   read the diff — intended? write before/after in the commit and `npm run test:bless`
                                 unexplained? that diff is the bug; blessing it deletes the evidence
```

## In this codebase

[`test/design-snapshot.test.ts`](../../../../test/design-snapshot.test.ts)
is the test: every case in `cases()` through `solveGroup`, each reduced by
`signature` and joined, an assertion that at least one case produced a
design so an empty grid cannot sail past its baseline, and
`toMatchFileSnapshot("./__snapshots__/designs.txt")`. Its header comment is
the contract in three sentences, and the last of them is the rule:

```ts
/* When a diff is intended, re-bless with `npm run test:bless` and put the
   before/after in the commit message. Do not re-bless to make a red build go
   green; a diff you cannot explain is the bug this test exists to find. */
```

[`test/grid.ts`](../../../../test/grid.ts) is the axes, `TIERS`,
`PAYLOADS`, `DV_BUDGETS` and `OBJECTIVES`, three each, with stock parts
only so the snapshot is a statement about the solver and not the roster,
and a slenderness limit paired with the light payload where it bites.
[`src/core/signature.ts`](../../../../src/core/signature.ts) is `canon`
and `round`. `npm run test:bless` is `vitest run -u`, which rewrites every
file snapshot the run touches, the mission sweep's and the render sweep's
included, which is one more reason to read the diff before committing it.
[`.claude/rules/verification.md`](../../../../.claude/rules/verification.md)
says what each baseline covers, and the solver rule _`best` is not what
the user gets_ in
[`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) is the
record of the blind spot.

## What made it real

The 31 of 72 is the founding measurement, from before the grid grew to 81:
a refactor believed to be behaviour-preserving altered 31 designs and
raised no error, and the snapshot was written so that could not happen
unnoticed again. The eleven of 128 is the measurement of the blind spot,
#45, and it is why the mission sweep exists.

The baseline's history is the rest of the evidence, fourteen commits that
re-blessed `designs.txt`, each saying why. The one for #167 through #169 is
the form at its best: "the design itself moved in five cells, all the guard
refusing a stalling core — tier5-pay0.8-dv9000 cost 76.6 → 80.3 t (+1.2%
cost)…", and for the mission sweep "Mun 3.5 t 101.4 t/33,598 → 128.2
t/26,749 (floor: 20% cheaper)". A reader can check every one of those
against the diff. That is what a bless is for.

## Where it breaks

- **Blessing red to get green.** The diff was the finding. Once blessed,
  the bug is the new baseline and the next diff is measured against it.
- **A field list.** Named fields stop covering what is added later; the
  signature walks everything the solver returns.
- **Trusting the grid alone.** It pins `best`, not what is delivered. A
  change that leaves every grid design untouched moved three of sixteen
  missions and eleven of 128 before that. Read the mission sweep too, and
  widen it when a change cannot be explained.
- **Unrounded numbers.** A snapshot of raw doubles moves across Node
  builds. Four decimals is below anything the physics can mean and above
  anything the platform can jitter.
- **A grid that solves nothing.** An empty output matches an empty
  baseline. The test asserts that something was designed before it
  compares.
- **A snapshot for the wrong kind of thing.** The style guide discourages
  snapshots in general, and rightly for UI markup that churns; a solver's
  output is the case they were made for, deterministic, dense with numbers,
  and with no other oracle.

## Try it

Run the snippet, then change one physics constant in `src/core/`, the
standard gravity in `propellantFor` say, by one part in a thousand, run
`npm test`, and read the diff vitest prints: count how many of the 66
designs moved and by how much. Put the constant back. Then read `git log
-- test/__snapshots__/designs.txt` and pick one commit; check its stated
before-and-after against its diff.

## Check yourself

<details><summary>The snapshot asserts nothing about whether a design is correct. What does it assert, and why is that enough to be the most important check here?</summary>

That the design has not moved. Nobody knows the optimal rocket for a grid
cell, so no test can assert it, but the characteristic failure here is a
change that alters designs silently, and a stored copy of every design is
the only thing that can see that. It turns a silent change into a loud
diff that a person must explain.

</details>

<details><summary>A solver change leaves all 81 grid designs identical. Why is that not proof the change was invisible?</summary>

Because the grid reads `best`, the closed form's favourite, and the
application delivers the first candidate that flies the simulator, then
re-solves against the flown cost. A change can leave `best` untouched and
change what is delivered, as dropping the cluster-cap variant did for
eleven of 128 missions. The mission sweep pins the delivered stages for
sixteen of those; a change nobody can explain deserves a wider sweep.

</details>

<details><summary>Why is every number in the signature rounded to exactly four decimals?</summary>

One rule for all fields, because a per-field precision map goes stale; four
because it is the tighter of the two precisions the project specifies, so
nothing is loosened; and rounding at all because transcendental results
can differ in the last bit between V8 builds, around 1e-13 on a Δv of
3,600, and without rounding a different Node would move the baseline on
its own.

</details>

## Further reading

- Michael Feathers, _Working Effectively with Legacy Code_ (2004), on
  characterisation tests: pinning what code does before changing it.
- The vitest documentation for `toMatchFileSnapshot` and the `-u` flag,
  which is what `npm run test:bless` runs.
- Llewellyn Falco's approval-testing writing, for the discipline of reading
  the diff before approving it.

## Key takeaway

A snapshot pins what a solver does rather than what it should do, storing
every design to four decimals so any change is a loud diff; the discipline
is entirely in the bless, which written up with its before and after is the
history of the physics and done to silence a red build is the deletion of
the only evidence; and because the grid pins the closed form's favourite
rather than the delivered rocket, a second baseline pins that too.

_As of 73b1375._
