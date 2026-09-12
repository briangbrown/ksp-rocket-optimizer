# Budgets are today's numbers, held

**Syllabus:** [V3](../../README.md#part-4--verification)

**Why it matters:** How the interface's limits are asserted matters because
a budget set at a target is a test that is off until the target is met and
then never fails, while a budget set at what the page measures today fails
the moment anyone makes it worse; so the layout suite holds page height,
word count, small text and target size at the numbers the application
measured the day each was written, a pull request that improves one lowers
it in the same commit, and a pull request that raises one has to say why in
words a reviewer can check, which is how a page that grew 75 pixels for a
correct warning is told apart from one that grew 75 pixels by accident.

**Before this:** [L10](../../ui/accessibility/accessibility-as-engineering.md),
_Accessibility as engineering_.

## A worked case

Read the budgets out of the layout suite and the numbers its last run wrote
beside its screenshots, and compare them:

| Budget        | Phone: held at | Phone: measured | Desktop: held at | Desktop: measured |
| ------------- | -------------- | --------------- | ---------------- | ----------------- |
| height (px)   | 4745           | 4651            | 3219             | 3219              |
| words         | 634            | 634             | 646              | 646               |
| tinyText      | 0              | 0               | 65               | 65                |
| smallBody     | 62             | 62              | 116              | 116               |
| targets under | 0 (of 26)      | 0               | 0 (of 24)        | 0                 |
| sideways      | 0              | 0               | 0                | 0                 |
| unreachable   | 0              | 0               | 0                | 0                 |
| axe           | 0              | 0               | 0                | 0                 |

Thirteen of the sixteen budgets sit exactly on the measurement, with no
headroom at all: the next pull request that adds a word to the desktop page
fails. The phone's height has two percent over its measurement, 4,651 to
4,745, an allowance for a different Chrome's fonts, and the comment says
so. The desktop's height sits on its measurement because the last change
raised it, from 3,144 to 3,219, and the comment on the number records why:
the default mission lost a stage, and the flight card began judging the
stage that circularises, at a thrust-to-weight of 0.82, where before it
judged the top stage and stayed silent, a correct warning the page had not
carried. Before that commit, the suite failed on exactly that line:

```
FAIL  visual/layout.test.ts > desktop > the page is no taller than budget
AssertionError: page height 3219px: expected 3219 to be less than or equal to 3144
```

That failure is the method working. The page grew; the test said so; a
person looked, found a warning that ought to be there, and raised the
number with the reason beside it, while lowering the six budgets the same
change had improved, phone height from 4,817, words from 657 and 672,
small text from 68, 71 and 123.

```ts
// save as test/v3.test.ts and run: npx vitest run test/v3.test.ts --reporter=verbose
// reads the budgets from the suite and the numbers its last run wrote to visual/.out (run npm run test:visual first)
import { test } from "vitest";
import { existsSync, readFileSync } from "node:fs";

test("budgets against the last measurement", () => {
  const src = readFileSync("visual/layout.test.ts", "utf8");
  const block = (screen: string) =>
    src.slice(
      src.indexOf(`${screen}: {`),
      src.indexOf("},", src.indexOf(`${screen}: {`)),
    );
  const budgets = (screen: string) =>
    Object.fromEntries(
      [...block(screen).matchAll(/^\s+(\w+): (\d+),/gm)].map((m) => [
        m[1],
        +m[2],
      ]),
    );
  for (const screen of ["phone", "desktop"]) {
    const b = budgets(screen);
    const f = `visual/.out/${screen}.json`;
    if (!existsSync(f)) {
      console.log(
        `${screen}: budgets ${JSON.stringify(b)}; no measurement in ${f} — run npm run test:visual`,
      );
      continue;
    }
    const m = JSON.parse(readFileSync(f, "utf8")) as Record<string, number>;
    const rows = Object.entries(b)
      .filter(([k]) => k in m)
      .map(
        ([k, v]) =>
          `${k} ${m[k]}/${v}${m[k] === v ? " (no headroom)" : m[k] < v ? ` (${((100 * (v - m[k])) / m[k]).toFixed(1)}% over)` : " OVER BUDGET"}`,
      );
    console.log(`${screen} (${m.of} targets): ${rows.join("; ")}`);
  }
});
```

## The idea

A **budget** is a measured limit a test holds the interface to: the page is
no taller than this, shows no more words than this, has no more than this
many pressable things under 44 pixels, no text under 12, nothing wider than
its box, nothing a keyboard cannot reach, nothing axe objects to. Each is a
property a person cares about and none has a correct value; a page could
always be shorter. That is what makes the choice of number the whole
design of the test.

Set the budget at the target, the page the design document wants, and
the test is red from the day it is written until the target is met, and
then green forever after, because a target is a floor nobody expects to go
under. A red test that everyone expects to be red is switched off in
practice if not in the file, and a green one with slack in it says nothing
when the page grows back toward the line. Set the budget at what the page
measures today, instead, and the test says one exact thing: this has not
got worse. It is green the day it is written and red the first time anyone
adds a paragraph, a small label, a wide table or a clickable , which is
when the person who did it is still in the room.

Two rules follow, and the file states both. A pull request that improves a
budget lowers it in the same commit, or the improvement is not held and
the next change can spend it. A pull request that raises one says why in
the commit and beside the number, in words a reviewer can check against
the diff, because a taller page or a smaller target is the regression the
suite exists to catch and the number is the evidence. That is the same
discipline as the design snapshot's bless, applied to pixels and words
instead of rockets, and for the same reason: the check knows only that the
number moved, and a person has to decide whether the move was the point.
The comments beside each budget are the history that decision leaves,
every previous value and the issue that moved it, so the file reads as a
ledger of what the interface has cost and where it was spent on purpose.

```
   the target (docs/design.md)   ····················· what the page should be one day; never a test
   the budget (layout.test.ts)   ━━━━━━━━━━━━━━━━━━━━━ what it measured on the day the line was written
   the measurement (visual/.out) ▲ today, from a real browser at 390 px and 1280 px

   measurement < budget   ──►  lower the budget in the same commit (the improvement is held)
   measurement = budget   ──►  green, no headroom: the next word fails
   measurement > budget   ──►  red: say why beside the number and in the commit, or fix the page
```

The measurements themselves are taken in a real browser, because jsdom
lays nothing out ([V2](../browsers/what-jsdom-cannot-see.md)): a phone at
390 pixels with touch and a laptop at 1,280, the default mission solved and
the brief set, after the solver has finished and the build view has stopped
moving. They are written beside the screenshots as numbers first and
compared second, so a pull request can quote what it moved without reading
it off a failure. A few carry deliberate allowances, two percent on the
phone's height for another Chrome's fonts, and a few are held at zero
because zero is where they are: no target under 44 pixels of 26, nothing
sideways, nothing unreachable, nothing axe objects to with every rule on.

## In this codebase

[`visual/layout.test.ts`](../../../../visual/layout.test.ts) is the suite.
`BUDGET` at its top holds sixteen numbers, eight a screen, each with a
comment giving its history; `TARGET_PX` is 44 on the phone and 24 on the
desktop; the `beforeAll` measures everything once, writes
`visual/.out/<screen>.json` and the screenshot, and the `it`s only compare:

```ts
it("the page is no taller than budget", () => {
  expect(n.height, `page height ${n.height}px`).toBeLessThanOrEqual(
    budget.height,
  );
});
```

[`visual/measure.ts`](../../../../visual/measure.ts) runs inside the page
and decides what counts: a target is a form control or anything with a
pointer cursor whose parent has none, text is measured on the element that
owns it, and a one-pixel clipped box is the screen reader's live region and
is hidden for the measure. The suite also holds the section order on each
screen, the folded page under the viewport, every disclosure opening to a
box with area, one focus ring on every Tab stop, and contrast at zero in
each theme. The rules are in
[`.claude/rules/design.md`](../../../../.claude/rules/design.md), _Budgets
are measured, not asserted_, and in `CLAUDE.md`, which says never to raise
one to make a red build green without saying why in the commit message.
The targets the budgets walk toward are in
[`docs/design.md`](../../../../docs/design.md).

## What made it real

The table is the measurement, and its thirteen exact matches are the
point: there is no slack for the next change to spend. The ledger in the
comments is the rest: the phone's height at 3,590 when the staging chips
became stops on the scrubber, 3,660 before the transfer cards, 4,817 after
them, 4,651 once the default mission lost a stage; the desktop's words at
556 after the header lost its install line, then fourteen back on purpose
for the footer's first line and the works number. One entry in the ui rule
records a budget deciding a design: the desktop's rocket was asked for at
seven tenths of the window, which at the suite's 900-pixel window was 55
pixels over the height budget, and six tenths measured 2,583 against
2,610, so six tenths is what shipped and full screen has the rest.

And the audit that seeded the numbers, #127, is what they were measured
from: a 10-pixel label, a 16-pixel button, a 3,000-pixel table and a
clickable `div` each passed the jsdom suite and each is now named by this
one when reintroduced.

## Where it breaks

- **A budget at the target.** Red until met, then green forever; a test
  that is off. Hold today's number and walk it toward the target.
- **Headroom left in.** A budget above the measurement is slack the next
  change spends silently. Lower it in the commit that earned it.
- **Raising without a reason.** A taller page is the regression the suite
  exists to catch. The number moves only with the reason beside it, and the
  reason has to be checkable against the diff.
- **Winning a budget back with a style hack.** A `lineHeight` override to
  recover height is the ui rule's named example; the leading is the design,
  and the budget is what moves.
- **Measuring the wrong moment.** Before the solver finishes or while the
  build view animates, the numbers are of a different page. `settle` waits
  for both.
- **Reading a budget as a judgment.** It counts words and targets; it
  cannot say whether they are the right ones. The screenshot in the CI
  artefact is for a person.

## Try it

Run `npm run test:visual` once, then the snippet, and read the headroom
column. Then add one sentence to any visible paragraph on the page, rebuild,
and run the layout suite: the words budget fails on the desktop by the
number of words you added. Take it out. Then read the comment on
`desktop.height` and check its stated reason against the diff of the
commit that wrote it.

## Check yourself

<details><summary>Why is the page-height budget set at what the page measures today rather than at the height the design document wants?</summary>

Because a budget at the target is red until the target is met and green
forever after, a test that is switched off either way; a budget at today's
number is green now and fails the first time the page gets worse, which is
when the change is still in front of its author. The target is where the
budget walks to, one lowered number at a time.

</details>

<details><summary>A change makes the phone page 120 pixels shorter. What must the pull request do besides the change?</summary>

Lower `phone.height` in `BUDGET` to the new measurement, with its
allowance, in the same commit, and note the old value in the comment.
Otherwise the improvement is not held, and the next change can spend the
120 pixels without any test noticing.

</details>

<details><summary>The desktop height budget was raised from 3,144 to 3,219. What made that acceptable where raising it to silence a red build would not be?</summary>

The reason, written beside the number and in the commit: the flight card
began judging the stage that circularises and carried a correct warning the
page had not shown before. A reviewer can check that claim against the diff
and the screenshot. Raising the number without one records nothing and
makes the regression the new baseline.

</details>

## Further reading

- The design snapshot lesson, [V1](../snapshots/snapshots-pin-the-design.md),
  for the same discipline applied to the solver's output.
- Google's web.dev material on performance budgets, for the general idea of
  a measured limit held in CI and lowered as the product improves.
- The axe-core rule documentation, for what the accessibility budget's
  rules test and what they cannot.

## Key takeaway

Hold each interface limit at the number the page measures today, lower it
in the same commit whenever a change improves it, and raise it only with a
reason written beside the number that a reviewer can check against the
diff; a budget set at a target is a test that never fails, and a budget with
headroom is slack the next change spends unseen.

_As of 2c0d1cc._
