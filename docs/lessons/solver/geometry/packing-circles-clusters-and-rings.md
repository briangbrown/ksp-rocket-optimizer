# Packing circles: clusters and rings

**Syllabus:** [A9](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** Circle packing matters because a stage is drawn and
judged as a set of cylinders seen from above, engines clustered under a
tank and whole columns ringed round a core, and whether four 1.25 m engines
fit under a 2.5 m tank, how wide a boosted stage really is, and how far out
a ring of columns must sit are all one question about circles inside a
circle; getting the ring radius wrong once put four columns through each
other by 1.28 m, in the drawing and in the design alike, and the
slenderness and drag of every stage rest on the width these formulas give.

**Before this:** nothing.

## A worked case

Put four 1.25 m engines under one tank. Seen from above they are four
circles of diameter 1.25 m packed as tightly as they go, and the smallest
circle that contains all four has a diameter of 1 + √2 = 2.414 engine
diameters, 3.02 m. A 2.5 m tank is narrower than that, so the cluster sticks
out past it and meets the airflow; the stage is 3.02 m wide, not 2.5. Two
engines span exactly 2.5 m and fit; three span 2.69 m and do not. Under a
3.75 m tank, seven 1.25 m engines fit exactly, one in the middle and six
round it, because a hexagon of six circles round one is three diameters
across; an eighth does not.

Now put whole columns round a core: a rocket made of four parallel stacks,
one on the axis and three round it, each column 2.53 m wide because its
engine cluster is broader than its 1.25 m tank. How far from the axis does
the ring sit? The first answer was the tank's diameter, 1.25 m, which is
right only while a column is no wider than its tank; here each column on
the ring overlapped the centre column by 1.28 m. The right answer keeps two
clearances: the centre column needs a whole column width to the ring, and
neighbours on the ring, 2R sin(π/(S − 1)) apart for S − 1 of them, need a
column width between them too. With three on the ring the neighbours are
√3 R apart and never bind; the ring sits at one column width, 2.53 m from
the axis. With nine columns, eight on the ring, the neighbour clearance
takes over and the ring moves out to 1.31 widths; with ten, 1.46.

```js
// the smallest circle round n equal circles, in units of one circle's diameter
const SPAN = [0, 1, 2, 2.155, 2.414, 2.701, 3, 3, 3.304, 3.613, 3.813];
const exact = {
  2: 2,
  3: 1 + 2 / Math.sqrt(3),
  4: 1 + Math.SQRT2,
  5: 1 + Math.sqrt(2 * (1 + 1 / Math.sqrt(5))),
  7: 3,
  8: 1 + 1 / Math.sin(Math.PI / 7),
};
for (const n of [2, 3, 4, 5, 7, 8])
  console.log(n, SPAN[n], exact[n].toFixed(3));
const fits = (n, d, D) =>
  `${n} × ${d} m under ${D} m: ${(SPAN[n] * d).toFixed(2)} m, ${SPAN[n] * d <= D + 1e-9 ? "fits" : "sticks out"}`;
console.log(
  fits(2, 1.25, 2.5),
  "|",
  fits(3, 1.25, 2.5),
  "|",
  fits(4, 1.25, 2.5),
  "|",
  fits(7, 1.25, 3.75),
);
// how far out a ring of S − 1 columns sits round a centre column, in column widths
const ring = (S, w) =>
  S < 2
    ? 0
    : Math.max(w, S - 1 < 2 ? 0 : w / (2 * Math.sin(Math.PI / (S - 1))));
for (const S of [2, 4, 7, 9, 10])
  console.log(S, "columns: ring at", ring(S, 1).toFixed(3), "widths");
```

## The idea

The **core** is the central stack of the rocket, the column on the axis
that everything else attaches to. A **cluster** is several engines under
one tank, mounted on a coupler; a **column** is a whole parallel stack,
tank and engine, stood beside the core; and a **ring** is columns arranged
evenly round the core. Every one of these is, from above, circles inside a
circle, and two questions recur: how wide is the set, and where does each
circle sit.

The **enclosing circle** of a set of circles is the smallest circle that
contains them all, and for n equal circles packed as tightly as possible its
diameter is known exactly for small n: the problem of packing n equal
circles in a circle has been solved by proof up to about a dozen and by
computation far beyond. In units of one circle's diameter the answers are
2 for two, 1 + 2/√3 = 2.155 for three in a triangle, 1 + √2 = 2.414 for four
in a square, 2.701 for five in a pentagon, 3 for both six and seven, since a
hexagon of six round a centre is three across and the centre may as well be
filled, 3.304 for eight, 3.613 for nine and 3.813 for ten. Beyond the table
the code falls back to 1 + √n, a fair approximation to the packing density
of circles in a circle.

```
   two            three            four              seven

    ●●           ●                ●●                ● ●
                ● ●               ●●               ● ● ●
                                                    ● ●
   span 2      span 2.155       span 2.414        span 3
                                  = 1 + √2         (a hexagon round one)
```

Which count fits under which tank follows at once. Engines of diameter d
under a tank of diameter D fit when SPAN[n] × d ≤ D: 1.25 m engines under
2.5 m allow two, under 3.75 m allow seven; 0.625 m engines under 2.5 m allow
ten. A cluster that does not fit is not refused, because the game does not
refuse it either; the stage is simply as wide as the cluster, and the width
is what the drag and the slenderness are charged on.

A ring is a different packing, because the columns are not free to pack
tightly: the game's radial symmetry puts one on the axis and S − 1 evenly
round it, and the only variable is the radius. Two clearances fix it. The
ring must clear the centre column, so its radius is at least one column
width; and neighbours on the ring must clear each other, and they are
2R sin(π/(S − 1)) apart, which is more than a column width for up to eight
on the ring and less from nine up. The radius is the larger of the two
requirements. The mistake on record used the tank diameter as the radius,
which is a column width only when the column is no wider than its tank; a
column carrying a cluster broader than its tank is wider than that, and the
ring drawn at the tank diameter runs the columns through each other.

The same ring formula lays out a cluster's engines and a packed ring of
tanks round a centre one, because the geometry is the same: one in the
middle, the rest evenly round, at a radius that clears the middle. The
enclosing circle of an optimal packing is a tighter shape than that, and
using it for the ring's radius put three tanks 0.707 diameters from the
middle where they needed a whole one, and they intersected too.

## In this codebase

The table and the two formulas are at the top of
[`src/core/geometry.ts`](../../../../src/core/geometry.ts):

```ts
const SPAN = [0, 1, 2, 2.155, 2.414, 2.701, 3, 3, 3.304, 3.613, 3.813];
const clusterSpan = (n: number, d: number) => d * (SPAN[n] || 1 + Math.sqrt(n));

const stackRing = (S: number, columnWidth: number) => {
  if (S < 2) return 0;
  const neighbours = S - 1;
  const gap =
    neighbours < 2 ? 0 : columnWidth / (2 * Math.sin(Math.PI / neighbours));
  return Math.max(columnWidth, gap); // clear the centre, and clear each other
};
```

`ringPositions` gives the engines of a cluster their places in units of the
ring's radius, a centre engine for counts of 1, 5, 7 and 9 and the rest
evenly round starting at the top, and it lives in the geometry module rather
than the drawing so that the model and the picture lay a cluster out the
same way. `stageGeom` and `stageSize` use `clusterSpan` for a stage's
width, the larger of the tank and the cluster, and `stackRing` for a ring of
columns and for a packed ring of tanks; the comment on the packed ring
records the 0.707 mistake. The drawing in
[`src/core/model.ts`](../../../../src/core/model.ts) reads the same
functions for where to put each cylinder, which is the whole of the rule:
one geometry, read by the solver and the renderer alike.

The rule under _`stageGeom` and `stageSize`_ in
[`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) is the
guard: width, height and packing were each computed twice and drifted apart
three times, leaving the drawing describing a different rocket from the one
the slenderness check was judging.

## What made it real

The overlap of #58 is the measurement for the ring: four columns 1.25 m
apart carrying 2.53 m clusters intersected by 1.28 m, and the model checks
in [`test/model.test.ts`](../../../../test/model.test.ts) now build every
stage of the sweep's tier-9 missions as cylinders and require that no two
share space, touching allowed and overlapping not; that check is what
turned the ring radius from a drawing bug into a test failure. The packed
ring's 0.707 is #63, caught by the same check.

The cluster span is checked against the game the other way: the comment on
`SPAN` records that a cluster of four 1.25 m engines spans 3.02 m and so
sticks out past a 2.5 m tank, which is what the game shows when the parts
are placed, and the model checks hold that a Mammoth mounting on a 3.75 m
tank measures within millimetres of the tank.

## Where it breaks

- **The tank diameter as the ring radius.** Right while a column is no
  wider than its tank, wrong by 1.28 m the moment its cluster is broader.
  The radius is a column width, and the neighbour clearance from nine
  columns up.
- **The optimal packing as the ring's shape.** The enclosing circle is the
  tightest arrangement of r + 1 circles; radial symmetry cannot build it.
  Three tanks round one at 0.707 of a diameter overlap; at a whole diameter
  they touch.
- **Computing width locally.** Every consumer of a stage's width reads
  `stageGeom`; a hand-rolled formula had a three-stack stage at 5.29 m
  against a 5.19 m base while claiming 4.04. The rule is not to recompute.
- **Beyond the table.** `SPAN` stops at ten and the fallback is 1 + √n, an
  approximation. Clusters above ten engines are rare and the cap on
  clusters under the cost objective is four, but a width past the table is
  an estimate.
- **Treating a cluster that sticks out as a rejection.** The game lets it
  happen and so does the solver; what changes is the width, and with it the
  drag area and the slenderness. A cluster of four under a 2.5 m tank is a
  3.02 m stage, and it is priced as one.

## Try it

Run the snippet, then ask it about 0.625 m engines under a 1.25 m tank:
`fits(4, 0.625, 1.25)` says 1.51 m and sticks out, so a four-Spark cluster
under a small tank is wider than the tank by a quarter of a metre; and
`fits(10, 0.625, 2.5)` says 2.38 m and fits. Then open the application, ask
for a mission that produces a clustered stage, and compare the plan view's
cluster with the width the stage card reports.

## Check yourself

<details><summary>Seven 1.25 m engines fit under a 3.75 m tank exactly, and eight do not. Why seven?</summary>

Because six equal circles round a seventh form a hexagon exactly three
diameters across, and the centre may as well be filled; the enclosing
circle of six and of seven is the same. 3 × 1.25 is 3.75. An eighth circle
breaks the hexagon and the span jumps to 3.304 diameters, 4.13 m.

</details>

<details><summary>Why is the ring of columns placed by two clearances rather than by the enclosing-circle table?</summary>

Because a ring is not an optimal packing. Radial symmetry fixes one column
on the axis and the rest evenly round it, so the only freedom is the
radius, and it must be large enough for the ring to clear the centre and
for neighbours to clear each other. The enclosing-circle arrangement is
tighter than any ring can be, and using it put the ring inside the centre
column.

</details>

<details><summary>What does a cluster that sticks out past its tank cost the design?</summary>

Width. The stage is as wide as the cluster, 3.02 m for four 1.25 m engines,
and that width is what the drag area and the slenderness ratio are computed
from. Nothing is refused; the design is simply drawn, judged and priced as
the wider rocket it is.

</details>

## Further reading

- Erich Friedman, "Circles in Circles", the online catalogue of best-known
  packings of n equal circles in a circle, from which the span table's
  values come.
- Hallard Croft, Kenneth Falconer and Richard Guy, _Unsolved Problems in
  Geometry_, the section on packing circles, for what is proved and what is
  merely best known.

## Key takeaway

From above a stage is circles in a circle: a cluster is as wide as the
smallest circle round its engines, 1 + √2 diameters for four, three for
seven, and a ring of columns sits at the larger of one column width and the
spacing its neighbours need; those two formulas, read once by the solver
and the drawing alike, are what a stage's width, and so its drag and its
slenderness, rest on.

_As of 2ecc64f._
