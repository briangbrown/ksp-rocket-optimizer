# A check must fail on the fault first

**Syllabus:** [V4](../../README.md#part-4--verification)

**Why it matters:** How a check earns its place matters because a test that
passes proves only that it passes, and a test that has never been seen red
on the fault it names may be passing for a reason that has nothing to do
with that fault; the link suite's too-long-hash test passed for months with
the length check it guards deleted, because the garbage it sent was refused
by the inflater instead, and the only way to know that was to remove the
guard and watch, which is what every pixel read and every snapshot in the
visual suite was made to do before it was trusted.

**Before this:** [V1](../snapshots/snapshots-pin-the-design.md), _Snapshots
pin the design_, and [V2](../browsers/what-jsdom-cannot-see.md), _What jsdom
cannot see_.

## A worked case

Take one small module with four guards in it, the share link's `fromLink`,
and its ten tests. Break one guard at a time in a copy, run the tests
against the copy, and count what goes red:

| Fault introduced in a copy of `link.ts`  | Tests red, of 10 | Which                                                  |
| ---------------------------------------- | ---------------- | ------------------------------------------------------ |
| Delete the `MAX_HASH` length check       | 1                | refuses a hash too long to be a design                 |
| Remove the inflate cap (`Infinity`)      | 1                | refuses a hash that would inflate past the cap         |
| Raise the inflate cap a thousandfold     | 1                | the same                                               |
| Double the inflate cap, 256 kB to 512 kB | 0                | nothing: the exact cap is not pinned                   |
| Change the format letter, `#c=` to `#d=` | 4                | round trip, plain visit, too long, large configuration |

The first row was 0 until this lesson was written. The test sent twenty
thousand letter A's after `#c=`, which is not deflate at all, and `fromLink`
refused it in the inflate step whatever the length check said; with the
check deleted, all ten tests stayed green. The test named a fault and
could not see it. It now sends thirty thousand characters of seeded noise,
which deflate to about 27,000, over the length cap and under the inflate
cap, so only the length check can refuse them, and it checks that a sixth
of the same noise reads back, so the refusal is the length's and not the
noise's. Against the broken copy it is now red, which is the first time
anyone has seen it red, and the only evidence that it checks anything.

The fourth row is a fault the suite cannot see and says so honestly: the
bomb test sends five megabytes, which a doubled cap refuses just as well, so
the cap's exact value is unpinned. Whether that matters is a judgment; that
it is true is a measurement.

```bash
# run at the repository root — break one guard at a time in a copy of link.ts and run its tests against the copy
mkdir -p test/__mutants
sed 's#from "../src/ui/link.js"#from "./link-mutant.js"#; s#from "../src/ui/\([a-z]*\).js"#from "../../src/ui/\1.js"#; s#from "../src/core/\([a-z]*\).js"#from "../../src/core/\1.js"#' test/link.test.ts > test/__mutants/link.mutant.test.ts
while IFS='|' read -r name expr; do
  sed "s#from \"../core/catalogue.js\"#from \"../../src/core/catalogue.js\"#; $expr" src/ui/link.ts > test/__mutants/link-mutant.ts
  red=$(npx vitest run test/__mutants/link.mutant.test.ts 2>&1 | grep -E '^\s+×' | sed 's/^ *× //; s/ [0-9]*ms$//' | tr '\n' ';')
  printf '%-22s red: %s\n' "$name" "${red:-none}"
done <<'MUTANTS'
no length check|s/if (hash.length > MAX_HASH) throw new RangeError("too long to be one");//
no inflate cap|s/MAX_INFLATED,/Infinity,/
cap x1000|s/const MAX_INFLATED = 256 \* 1024;/const MAX_INFLATED = 256 * 1024 * 1000;/
cap x2|s/const MAX_INFLATED = 256 \* 1024;/const MAX_INFLATED = 512 * 1024;/
format letter|s/const PREFIX = "#c=";/const PREFIX = "#d=";/
MUTANTS
rm -r test/__mutants
```

## The idea

A test is a claim about a fault: if this were broken, I would be red. The
claim has two halves, and a green run proves only the easy one, that the
code as it stands satisfies the assertion. It says nothing about whether
the assertion would notice the fault it was written for, and there are
many ways for it not to. The assertion can be satisfied by a different
mechanism than the one it names, as the too-long test was by the inflater.
It can measure something that does not change when the fault is present,
as a containment check in jsdom measures rectangles that are always zero.
It can be looser than the fault, as a bomb test that sends five megabytes
cannot tell a 256 kB cap from a 512 kB one. Or it can simply be exercising
nothing, as a snapshot of an empty grid matches an empty baseline. In every
one of those cases the test is green on the broken build, and a green test
that would also be green on the broken build is not a test.

So the discipline is to see the red first. Before a check is trusted, the
fault it exists to catch is put in place, or put back, and the check is run
and watched fail; then the fix is applied and it is watched pass. The
order matters because the red run is the only observation that ties the
assertion to the fault. When the fault has already been fixed, the red run
is a mutation: a copy of the code with the guard removed, the constant
changed or the branch inverted, against which the suite is run. What goes
red is what the suite covers; what stays green is a fault the suite cannot
see, to be either accepted with open eyes or given a test that can.

```
   a check earns its place                            what the results mean
   ───────────────────────                            ─────────────────────
   1. put the fault in place (or copy the code        red on the fault, green on the fix:
      and break one thing)                              the assertion is tied to the fault
   2. run the check: it must go RED                   green on the fault:
   3. fix (or restore): it must go GREEN                 the check passes for some other reason —
   4. write down what went red, and what did not        fix the check, or record the gap
```

The written record is part of the method. A test comment that says
"reintroduce `setSize(w, h, false)` and this fails" is a claim someone can
repeat; a snapshot bless that lists the five cells that moved is a red run
described; a budget comment that says what the page measured before and
after is the same thing for pixels. And when a fault is found that nothing
sees, the honest record is the row that says 0, because the alternative,
a suite believed to cover what it does not, is worse than a known gap.

## In this codebase

The visual suite is the method applied deliberately.
[`.claude/rules/verification.md`](../../../../.claude/rules/verification.md)
records the red runs for each of its checks: reintroduce `setSize(w, h,
false)` and one test fails; drop `preserveDrawingBuffer` and four do; break
a line of GLSL and three do, one of them naming the compiler error. Each
test in [`visual/render.test.ts`](../../../../visual/render.test.ts) carries
the issue it was seen red on: #66 for the canvas laid out at twice its
panel, the drawing blank after a repaint and the plan that kept the step
before; #70 for the outline that only surface ids can find, whose test says
in its comment what silence would look like:

```ts
/* #70: the seam between two tanks of the same diameter is continuous in
   depth and in normals, so it is found by surface id or not at all. If the
   id pass silently produced nothing, the drawing would still look like a
   rocket — flat-shaded cylinders with cap rims — and only the absence of
   the edge colour would say so. */
```

The design snapshot's guard against an empty grid is the same idea turned
inward: it asserts that at least one configuration produced a design before
comparing, because an empty output would match an empty baseline. The
mission sweep exists because a change that left every grid design
byte-identical moved eleven real missions, which is a red run the grid
could not produce and the sweep now can. And
[`test/link.test.ts`](../../../../test/link.test.ts) carries this lesson's
own red run in the comment on its too-long test, from #405. The ui rule
_The visual suite runs against `dist/`_ names the commonest false green of
all: a change that "had no effect" on a budget was usually never built, so
the suite measured the previous build.

## What made it real

The table is the measurement, run against five copies of one module: one
guard the suite could not see until its test was rewritten, one it still
cannot, three it can. The visual suite's counts, one, four and three, are
the same measurement recorded in the rule when those tests were written.
The origin is the three rendering bugs of #66 and #73, each shipped past a
suite that was green because it could not see them, and each found by a
person; the suite that replaced that gap was built by putting each bug back
and watching a test go red.

The mission sweep's origin, #45, is the counterexample at the other layer:
a solver change measured as invisible by 81 green grid cells moved eleven
delivered rockets. The grid was green on the fault; it took a new check,
seen red on that change, to cover it.

## Where it breaks

- **Trusting a green you have never seen red.** It may be satisfied by
  another mechanism, measure something the fault does not move, or exercise
  nothing. Break the thing and watch.
- **Testing with input the fault never sees.** Garbage that fails an
  earlier step never reaches the guard under test. Send input that passes
  everything but the guard.
- **A check looser than the fault.** Five megabytes cannot tell one cap
  from another. Match the input's size to the boundary, or record the gap.
- **Measuring the previous build.** The visual suite runs against `dist/`;
  a change that had no effect was usually not built.
- **A snapshot of nothing.** Empty output matches an empty baseline. Assert
  the thing under test ran before comparing.
- **Fixing before failing.** Once the fault is gone the red run is a
  mutation, and it still has to be done, or the test's link to its fault is
  a belief.

## Try it

Run the script and read the five rows. Then write a sixth mutant of your
own, `s/TAG.length/0/` say, and predict which tests go red before running
it. Then pick any test in `test/` you have not seen fail, break the thing
it names in a copy or in place, and run it: if it stays green, you have
found either a gap or a test that is not about what it says.

## Check yourself

<details><summary>The too-long-hash test passed for months with the length check deleted. What was it actually testing?</summary>

That twenty thousand letter A's are refused, which they were, by the
inflater, because they are not deflate. The length check was never reached
on that input, so the test could not see it go. The rewritten test sends
noise that decodes, over the length cap and under the inflate cap, so the
length check is the only thing that can refuse it.

</details>

<details><summary>Why does the visual suite record "reintroduce this and N tests fail" beside its checks?</summary>

Because that is the red run: the observation that ties each assertion to
the fault it was written for. A reader can repeat it, and a suite whose
checks were each seen red on their fault is one whose green means
something.

</details>

<details><summary>A mutant doubles the inflate cap and nothing goes red. What are the two honest responses?</summary>

Write a test that sends something between 256 kB and 512 kB inflated, so
the exact cap is pinned; or decide the exact value does not matter, and
record that the suite does not pin it. What is not honest is believing the
cap is tested because a bomb test exists.

</details>

## Further reading

- The Stryker mutation-testing documentation, for the general form of the
  worked case: break the code one place at a time and count what stays
  green.
- Kent Beck, _Test-Driven Development: By Example_ (2002), for red before
  green as a working rhythm rather than an audit.
- Google Testing Blog, "Testing on the Toilet: Change-Detector Tests", for
  the test that fails on every change and so says nothing.

## Key takeaway

A green test proves the code satisfies the assertion, not that the
assertion would notice the fault it names; so every check is trusted only
after it has been seen red on that fault, by putting the fault in place or
breaking a copy, and what stays green under a broken copy is a gap to fix
or to write down, never a coverage to believe in.

_As of d136178._
