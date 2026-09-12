# Quadric edge collapse

**Syllabus:** [L18](../../README.md#part-3--language-and-platform)

**Why it matters:** How the engines are simplified matters because the game's
meshes are a quarter of a million triangles across fifty engines and the
drawing gives a bell sixty pixels, so each mesh is cut to a few hundred
vertices before it is committed; and because the metric that chooses which
edges to collapse decides what survives the cut, a plain distance metric
keeps the bolt heads and turns a sixteen-sided bell into an eight-sided one,
so the cost had to price the turn a collapse puts on the surface as well as
the distance it moves it, and refuse the minimiser when it points out of the
surface like a needle.

**Before this:**
[L14](../../renderer/geometry/revolved-geometry-normals-creases-and-silhouettes.md),
_Revolved geometry, normals, creases and silhouettes_.

## A worked case

First the metric on two shapes a hand can hold. A vertex on a flat face
belongs to planes that all agree; a vertex at a cube's corner belongs to
three that do not. Move each by one millimetre and sum the squared
distances to its planes:

| Vertex      | Moved along the surface | Moved off the surface |
| ----------- | ----------------------- | --------------------- |
| Flat face   | 0                       | 2 (one per triangle)  |
| Cube corner | 1, in any direction     | 1, in any direction   |

A flat vertex has a free direction and costs nothing to slide; a corner has
none, and any move costs its full square. That asymmetry is the whole
method: collapse where the planes agree, keep where they do not.

Then the shape that shows why distance is not enough. A sixteen-sided ring
of radius 100 mm stands in for a bell's circumference. Merging two
neighbouring vertices at their midpoint moves the surface 1.92 mm, which a
distance metric prices at under four square millimetres times the face
area, and turns the two facets 22.5° toward each other, which it does not
price at all. Weighted at `TURN = 40`, a face that turns fifteen degrees
costs `40 × (1 − cos 15°) = 1.36` times what moving it the part's whole
extent would, and the ring keeps its sixteen sides while the bolt heads,
all turn and no size, are spent first.

Then the engines themselves, the tool's full copies against what it
committed:

| Engine   | Triangles            | Vertices    | Nearest original vertex from a simplified one, mean and max |
| -------- | -------------------- | ----------- | ----------------------------------------------------------- |
| Spark    | 3,043 → 1,000 (3.0×) | 1,603 → 545 | 4.7 mm, 26 mm (7.8% of height)                              |
| Terrier  | 5,778 → 1,000 (5.8×) | 3,051 → 566 | 17.9 mm, 84 mm (11.0%)                                      |
| Poodle   | 9,432 → 1,572 (6.0×) | 5,054 → 896 | 16.9 mm, 96 mm (6.6%)                                       |
| Mainsail | 6,206 → 1,034 (6.0×) | 3,150 → 528 | 37.6 mm, 155 mm (5.2%)                                      |
| Mammoth  | 4,054 → 999 (4.1×)   | 2,578 → 595 | 45.0 mm, 270 mm (6.5%)                                      |
| Nerv     | 2,338 → 1,000 (2.3×) | 1,266 → 570 | 23.8 mm, 80 mm (2.5%)                                       |

Across all fifty stock engines: 263,583 triangles become 60,439, and 5.6 MB
of files become 1.2 MB. The budget is one face in six, floored at a
thousand and capped at three thousand, which is why the Spark and the Nerv
lose less than the rest: a bell has to read as a bell at the size it is
drawn, and the floor is where that starts. The last column is a crude
bound, the distance from each surviving vertex to the nearest original
vertex, not to the original surface; a vertex the metric slid to the middle
of a large smooth facet reads as far from the originals while sitting on
the bell. The height and width the files report move by at most a few
percent.

```ts
// save as test/l18.test.ts and run: npx vitest run test/l18.test.ts --reporter=verbose
import { test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
type M = { h: number; w: number; v: number[]; i: number[] }; // millimetres as integers; index triples
const read = (dir: string, f: string): M =>
  JSON.parse(readFileSync(`public/${dir}/stock/${f}`, "utf8"));
const plane = (a: number[], b: number[], c: number[]) => {
  // unit normal and offset, as the tool's plane() computes them
  const u = b.map((x, i) => x - a[i]),
    v = c.map((x, i) => x - a[i]);
  let n = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const l = Math.hypot(...n);
  n = n.map((x) => x / l);
  return [...n, -(n[0] * a[0] + n[1] * a[1] + n[2] * a[2])];
};
const quadric = (planes: number[][], x: number[]) =>
  planes.reduce(
    (s, p) => s + (p[0] * x[0] + p[1] * x[1] + p[2] * x[2] + p[3]) ** 2,
    0,
  ); // squared distances to the planes, summed

test("quadric edge collapse", () => {
  const flat = [
    plane([0, 0, 0], [1, 0, 0], [1, 1, 0]),
    plane([0, 0, 0], [1, 1, 0], [0, 1, 0]),
  ];
  const corner = [
    plane([0, 0, 0], [1, 0, 0], [1, 1, 0]),
    plane([0, 0, 0], [0, 0, 1], [1, 0, 1]),
    plane([0, 0, 0], [0, 1, 0], [0, 1, 1]),
  ];
  const diag = [1, 1, 1].map((c) => c / Math.sqrt(3));
  console.log(
    `flat face: along ${quadric(flat, [1, 0, 0])}, off ${quadric(flat, [0, 0, 1])};  corner: along an edge ${quadric(corner, [1, 0, 0])}, along the diagonal ${quadric(corner, diag).toFixed(3)}`,
  );
  const R = 100,
    th = Math.PI / 16;
  console.log(
    `16-gon ring, radius ${R} mm: merging two neighbours moves the surface ${(R * (1 - Math.cos(th))).toFixed(2)} mm and turns its facets ${((2 * th * 180) / Math.PI).toFixed(1)}°; TURN·(1 − cos 15°) = ${(40 * (1 - Math.cos(Math.PI / 12))).toFixed(2)}`,
  );
  let tf = 0,
    ts = 0,
    bf = 0,
    bs = 0;
  for (const f of readdirSync("public/engines/stock")) {
    tf += read("engines-full", f).i.length / 3;
    ts += read("engines", f).i.length / 3;
    bf += readFileSync(`public/engines-full/stock/${f}`).length;
    bs += readFileSync(`public/engines/stock/${f}`).length;
  }
  console.log(
    `50 stock engines: ${tf.toLocaleString("en-US")} → ${ts.toLocaleString("en-US")} triangles, ${(bf / 1e6).toFixed(1)} MB → ${(bs / 1e6).toFixed(1)} MB`,
  );
  for (const f of [
    "48-7s-spark-liquid-fuel-engine.json",
    "lv-909-terrier-liquid-fuel-engine.json",
    "re-l10-poodle-liquid-fuel-engine.json",
    "re-m3-mainsail-liquid-fuel-engine.json",
    "s3-ks-25x4-mammoth-liquid-fuel-engine.json",
    "lv-n-nerv-atomic-rocket-motor.json",
  ]) {
    const full = read("engines-full", f),
      s = read("engines", f);
    let max = 0,
      sum = 0;
    const nv = s.v.length / 3,
      nf = full.v.length / 3;
    for (let i = 0; i < nv; i++) {
      // distance from each surviving vertex to the nearest original one: a bound on how far it left the surface
      let best = Infinity;
      for (let j = 0; j < nf; j++) {
        const d =
          (s.v[3 * i] - full.v[3 * j]) ** 2 +
          (s.v[3 * i + 1] - full.v[3 * j + 1]) ** 2 +
          (s.v[3 * i + 2] - full.v[3 * j + 2]) ** 2;
        if (d < best) best = d;
      }
      best = Math.sqrt(best);
      sum += best;
      if (best > max) max = best;
    }
    console.log(
      `${f.split("-")[2]}: ${full.i.length / 3} → ${s.i.length / 3} triangles (${(full.i.length / s.i.length).toFixed(1)}×), ${nf} → ${nv} vertices; h ${full.h}→${s.h}, w ${full.w}→${s.w}; nearest original ${(sum / nv).toFixed(1)} mm mean, ${max.toFixed(0)} mm max (${((100 * max) / (full.h * 1000)).toFixed(1)}% of height)`,
    );
  }
});
```

## The idea

**Mesh simplification** is reducing a mesh's triangle count while keeping
its shape, and the question it turns on is what "keeping its shape" is
measured by. The first attempt here was vertex clustering, snapping vertices
to a grid and merging those that land in a cell, and it drew lumps, because
a grid knows nothing of curvature: it merges across a lip as readily as
across a flat plate. The method that replaced it works one edge at a time
and asks, of each, what it would cost to remove.

An **edge collapse** merges an edge's two vertices into one, at a position
of the algorithm's choosing, and deletes the two triangles that had the
edge as a side; every other triangle that touched either vertex now touches
the merged one. Done once it removes two faces, one vertex and three
edges; done a few thousand times, cheapest edge first, it takes a mesh from
nine thousand faces to fifteen hundred. The order is the algorithm, and the
order is decided by a cost.

The **quadric error** is that cost, after Garland and Heckbert: a measure of
how far a vertex has moved from the planes of its original faces, the sum
over those planes of the squared distance from the candidate position to
each. It is a quadratic form in the position, ten coefficients, so the sum
of two vertices' quadrics is the quadric of the edge between them, and the
position that minimises it is a three-by-three linear solve. Where the
planes agree, along a flat plate or a gently curved bell, the minimum is
near zero and the collapse is cheap; where they disagree, at a lip or a
corner, no position satisfies them all and the collapse is dear. The table
above is that in miniature: a flat vertex slides for free, a corner cannot
move without paying.

Three refinements make it work on these meshes, and each has a failure
behind it. The first is **memoryless** evaluation, after Lindstrom and Turk:
the original method accumulates each vertex's quadric through its history
of collapses, and on a long chain, a cylinder losing its rings one by one,
the accumulated quadric judges a vertex against planes that no longer exist
and drifts the surface off its true position; the memoryless form prices an
edge against the faces round its two ends as they stand now. The second is
that the quadric measures distance and nothing else: merging two ring
vertices on a cylinder moves the surface very little while turning its
facets a lot, so the pure quadric took a sixteen-segment ring to eight and
made every facet an edge to the shading. The turn a collapse puts on its
faces, area times one minus the cosine of the angle each face rotates, is
added to the cost scaled by the part's extent squared, and a face turned
past a right angle is a flip and is refused outright. Forbidding turns
instead of pricing them pinned a Mammoth at nine thousand vertices, because
a bolt head is all turn. The third is guarding the minimiser: the planes
round one edge are often nearly coplanar, the linear system nearly singular,
and the solution a needle out of the surface, which the Boar grew; a
candidate farther from the edge than the edge is long is refused, leaving
the two endpoints and the midpoint.

```
   an edge collapse                          the cost of collapsing (a, b) to p
   ────────────────                          ─────────────────────────────────
      ╲   │   ╱        ╲     ╱               Σ over faces round a and b, as they stand now:
       ╲  │  ╱          ╲   ╱                    area · dist(p, plane)²             the quadric
   ─────a─┼─b─────  →  ───p───              + TURN · extent² · Σ area · (1 − cos θ)  the turn
       ╱  │  ╲          ╱   ╲                + 1e3 · length · dist² for a boundary edge's wall
      ╱   │   ╲        ╱     ╲               θ > 78° (cos θ < 0.2): a flip, refused
   two faces gone, one vertex fewer          p ∈ {quadric minimum if within an edge length, a, b, midpoint}
```

Boundaries need a rule of their own. A bell's open lip and a plate's rim
have faces on one side only, so their quadrics pull inward with nothing
pulling back and the outline creeps in as collapses accumulate. Each
boundary edge gets a heavy plane standing perpendicular to its one face
along the edge, weighted a thousand times its length, so moving off the
outline is priced far above moving along it.

## In this codebase

[`tools/engine-meshes.mjs`](../../../../tools/engine-meshes.mjs) is the
whole pipeline in plain Node, from the install's zip to
`public/engines/<art>/<title>.json`: it reads each engine's part config for
which mesh at what scale in which variant, walks the transform tree with
the root's own placement dropped, takes every visible triangle with the top
node at y = 0, welds the texture seams by rounding to a ten-thousandth,
and simplifies. `KEEP`, `FLOOR` and `CEIL` set the budget, six, a thousand
and three thousand faces, and `TURN` is forty. `plane` returns a unit normal,
an offset and half the face's area; `quadric` is the ten coefficients of a
plane's squared distance, weighted by that area; `qadd` and `qeval` sum and
evaluate; `qmin` is the three-by-three solve. Inside `simplify`, `local`
builds the edge's quadric from the faces round both ends as they stand and
adds the boundary walls, `turnOf` prices the rotation and returns infinity
for a flip, and `propose` tries the guarded minimiser, both endpoints and
the midpoint:

```js
for (const c of [opt, V[a], V[b], mid]) {
  if (!c) continue;
  const t = turnOf(a, b, c);
  if (t === Infinity) continue;
  const e = qeval(q, c) + TURN * extent * extent * t;
  if (e < cost) {
    cost = e;
    best = c;
  }
}
```

A heap orders the edges by cost and the loop collapses the cheapest until
the face count reaches the target. The `--full` flag writes the unsimplified
copies to `public/engines-full/`, which the gallery's Full switch draws
beside the committed files for judging the cut by eye, and `--check` exits
non-zero if the committed files differ from what the tool would write.
[`test/engine-meshes.test.ts`](../../../../test/engine-meshes.test.ts)
holds that every engine in the catalogue has a file, that each mesh hangs
from its top node inside its own width, that ReStock's files follow its art
where it remodelled and only there, and that the full copies exist. The
record is in
[`.claude/rules/part-data.md`](../../../../.claude/rules/part-data.md),
under _The engines are drawn from simplified copies of the game's meshes_.

## What made it real

The counts are the measurement: 263,583 triangles to 60,439 across fifty
engines, the Poodle from 9,432 to 1,572, and a file size the renderer can
fetch on first draw without the reader noticing. The three refinements
each have a picture behind them that the gallery's Full switch was built to
show: the eight-sided ring the pure quadric drew on a sixteen-sided bell,
the needle the Boar grew from an unguarded minimiser, and the Mammoth pinned
at nine thousand vertices when turns were forbidden rather than priced. And
the budget's shape has one too: a fixed thousand faces made the ReStock
Vector's simplifier, unable to afford its forty cooling ribs, eat the cone's
circumference around them and draw a lumpy, crossing silhouette; one face
in six, floored and capped, gave it what it needed and left the Spark, which
has three thousand faces and needs no more, alone.

## Where it breaks

- **Distance alone.** A quadric prices how far the surface moves, not how
  much it turns; on a smooth curved surface the two disagree, and the ring
  halves its sides. Price the turn, scaled to the part.
- **Forbidding what should be priced.** A collapse that turns a face is
  what removing a bolt head is. Refuse only flips, and let the cost decide
  the rest.
- **Trusting the minimiser.** Nearly coplanar planes give a nearly singular
  system and a solution far out of the surface. Refuse a candidate farther
  than the edge is long, and fall back to the endpoints and the midpoint.
- **Accumulated quadrics on a long chain.** They judge against planes that
  no longer exist and drift the surface. Price each edge against the faces
  as they stand.
- **Unwelded seams.** The game splits a vertex wherever a texture seam runs;
  to the collapse every seam is a boundary, and boundaries are weighted not
  to move. Weld first.
- **A fixed face budget.** Too few for a ribbed cone, too many for a small
  bell already at its floor. Budget as a fraction, floored and capped.

## Try it

Run the snippet, then open the gallery in the application and flip its
Full switch on the Vector, the Mammoth and the Spark, watching the bells
and the lips stay and the panel lines go. Then read `propose` in the tool
and work out which of the four candidates wins for an edge in the middle
of a flat plate, and which for one on a lip.

## Check yourself

<details><summary>Why does a quadric error metric collapse a flat plate before a lip?</summary>

Because the quadric is the sum of squared distances to the planes of the
faces round the edge. On a plate those planes agree, so there is a position
at zero distance from all of them and the collapse costs nothing; at a lip
they disagree, no position satisfies them all, and the minimum is large.

</details>

<details><summary>The pure quadric turned a sixteen-sided bell into an eight-sided one. What did it fail to price, and how is the cost written now?</summary>

The turn. Merging two neighbouring ring vertices moves the surface less than
two millimetres on a 100 mm radius, which the quadric prices at almost
nothing, while rotating the facets 22.5°. The cost now adds `TURN × extent²
× Σ area × (1 − cos θ)` over the faces the collapse moves, so a smooth
surface keeps its rings and the budget is spent on the bolts and struts,
which are all turn and no size.

</details>

<details><summary>Why is the quadric's own minimiser sometimes refused in favour of an endpoint or the midpoint?</summary>

Because the planes round one edge are often nearly coplanar, so the
three-by-three system is nearly singular and its solution can lie far out
of the surface, a needle. A candidate farther from the edge than the edge
is long is refused; the endpoints and the midpoint are always on or between
the surface's own points.

</details>

## Further reading

- Michael Garland and Paul Heckbert, "Surface Simplification Using Quadric
  Error Metrics", SIGGRAPH 1997: the quadric, its ten coefficients and the
  minimising solve.
- Peter Lindstrom and Greg Turk, "Fast and Memory Efficient Polygonal
  Simplification", IEEE Visualization 1998: the memoryless form, where an
  edge is priced against the surface as it stands.
- Hugues Hoppe, "Progressive Meshes", SIGGRAPH 1996, for edge collapse as the
  primitive and the collapse sequence as a representation in its own right.

## Key takeaway

Simplify a mesh by collapsing its cheapest edge repeatedly, price each
collapse by the squared distances of the merged vertex from the planes of
the faces round it as they stand now, add the turn the collapse puts on
those faces and a wall along any open boundary, refuse a flip and a
minimiser that leaves the surface, and the lips and bells survive while the
bolt heads and panel lines are spent.

_As of 336d697._
