# Placing labels by scored search

**Syllabus:** [A16](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** Label placement matters because the transfer drawing
has to name a handful of things, the ship, the Sun or planet in the middle,
the departure and arrival bodies, the ejection angle, in a 220-pixel square
already full of markers and rays, and a name written at a fixed offset lands
on a marker or across a line as soon as the geometry changes with the
mission; placing each name by trying a couple of dozen positions and scoring
what each would sit on, with the width and height a real glyph measures,
keeps every drawing legible without a hand-made layout per case, and it is
a small constraint-satisfaction problem solved the way the big ones in this
solver are, by scored search.

**Before this:** nothing.

## A worked case

The ejection drawing marks the burn with a dot ten pixels across and the
central body with one five across, draws the prograde reference and the
burn direction as rays from the middle, and boxes the angle text and its
arrow. Then it names the ship, at the burn dot, and the body, at the centre.

Take the ship's name, "Ship", four glyphs, 31.6 pixels wide and 15 tall by
the measured metrics. Twenty-four candidate positions are tried: eight
directions about the dot, sideways first, at three stand-offs of 7, 19 and
31 pixels, the second and third with a leader line back to the dot. Each is
scored, and the lowest wins:

| Candidate                  | Base | Overlap with the dot's box    | Crosses a ray | Cost |
| -------------------------- | ---- | ----------------------------- | ------------- | ---- |
| Right, 7 px, no leader     | 0    | 3 × 15 px = 45 px², × 2 = 90  | yes, +6       | 96   |
| Left, 7 px, no leader      | 0    | 3 × 15 px = 45 px², × 2 = 90  | no            | 90   |
| Above, 7 px, no leader     | 1    | 20 × 3 px = 60 px², × 2 = 120 | no            | 121  |
| Left, 19 px, with a leader | 4    | none                          | no            | 4    |

A name that stands off with a short leader and touches nothing costs 4; a
name beside its point that overlaps three pixels of marker costs 90. The
leader wins by a mile, which is the point: overlap is charged by the pixel
and dearly, standing off is charged a few points, so a name is moved rather
than let sit on something. The body's name is placed next, with the ship's
box now among the things to avoid and a preference for below, since a name
under the middle of the drawing reads as the centre's.

```js
// place(), in miniature: the scoring of one name's candidates
const NOTE_H = 15,
  widthOf = (t) => 6.9 * t.length + 4,
  size = 220;
const DIRS = [
  [1, 0, "start", 0],
  [-1, 0, "end", 0],
  [0, 1, "middle", 1],
  [0, -1, "middle", 1],
  [1, 1, "start", 2],
  [-1, 1, "end", 2],
  [1, -1, "start", 2],
  [-1, -1, "end", 2],
];
const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const crossesH = (box, y, x0, x1) =>
  y > box.y && y < box.y + box.h && x1 > box.x && x0 < box.x + box.w; // a horizontal ray, for this scene
function place(text, at, taken, rays) {
  const w = widthOf(text),
    h = NOTE_H;
  let best = null;
  for (const ring of [0, 1, 2]) {
    const d = [7, 19, 31][ring];
    for (const [dx, dy, anchor, pen] of DIRS) {
      const cx = at[0] + dx * d,
        cy = at[1] + dy * d;
      const box = {
        x: anchor === "start" ? cx : anchor === "end" ? cx - w : cx - w / 2,
        y: dy === 0 ? cy - h / 2 : dy > 0 ? cy : cy - h,
        w,
        h,
      };
      let cost = pen + ring * 4;
      for (const edge of [
        box.x < 1 && 1 - box.x,
        box.x + box.w > size - 1 && box.x + box.w - size + 1,
        box.y < 1 && 1 - box.y,
        box.y + box.h > size - 1 && box.y + box.h - size + 1,
      ])
        if (edge) cost += edge * 5;
      for (const t of taken) cost += overlap(box, t) * 2;
      for (const r of rays) if (crossesH(box, r.y, r.x0, r.x1)) cost += 6;
      if (!best || cost < best.cost) best = { dx, dy, ring, cost };
    }
  }
  return best;
}
const burn = [100, 100];
const taken = [{ x: 90, y: 90, w: 20, h: 20 }]; // the burn dot, ten pixels across
const rays = [{ y: 100, x0: 100, x1: 200 }]; // the burn direction, drawn to the right
console.log(place("Ship", burn, taken, rays)); // { dx: -1, dy: 0, ring: 1, cost: 4 }: left, standing off, with a leader
```

## The idea

**Constraint satisfaction** is finding values that meet a set of limits at
once. Here the values are where each name goes, and the limits are that a
name should not sit on a marker, another name or the frame's edge, should
not lie across a ray it would make unreadable, and should read as belonging
to its point. Few of the limits are absolute, so the problem is solved as
scoring rather than as a hard search: every violation has a price, a
candidate's cost is the sum, and the cheapest candidate is taken. The prices
encode the priorities. Overlap is charged by the square pixel and doubled,
so a name never sits on a marker if any clear position exists; crossing a
ray costs six; leaving the frame costs five per pixel; standing off from
the point costs four per ring, and a leader is drawn to say which point the
name belongs to; a direction that reads worse costs one or two. Ties are
broken by trying the sideways positions first, because a name reads best
beside its point.

The order the names are placed in is part of the method. Each placed name's
box joins the set to avoid, so the first name has the freest choice and the
last the most constrained. The drawing therefore places the most-constrained
name first, the ship's, which must sit near a marker with rays leaving it,
then the body's, which can go almost anywhere and is only asked to prefer
below, and the departure and arrival names after. Placing an easy name first
would let it take the spot a hard one needed.

```
   candidates round a point, scored:

            ▪·····▪·····▪        ring 2 (31 px, leader)      ▪ a candidate box's anchor
            ·  ▫  ·  ▫  ·        ring 1 (19 px, leader)
            ▪  ·  ● ─── ray →    ring 0 (7 px, no leader): right sits on the ray, +6, and on the dot, +90
            ·  ▫  ·  ▫  ·                                    left sits on the dot, +90
            ▪·····▪·····▪                                    ring 1 left: clear, cost 4 — chosen
```

**Text metrics** are the measured width and height of rendered text, and
the scoring is only as good as they are. A canvas can measure text exactly,
but this drawing is SVG built in React, so the metrics are constants
measured once in Chrome for the note role's font and size: about 6.9 pixels
per glyph plus 4, and 15 pixels tall. The comment records why the estimate
is not rounder: "an estimate a pixel short put names a pixel onto markers."
A metric a little large costs nothing but a slightly larger stand-off; a
metric a little small puts a name on a dot in every drawing where the
scoring said it was clear.

## In this codebase

`place` in [`src/ui/components/transfer.tsx`](../../../../src/ui/components/transfer.tsx)
is the function, and the snippet above is it with the ray test simplified.
The directions and their penalties:

```ts
/* Eight directions about a point, the sideways ones first — a name reads
   best beside its point — at two stand-offs, the second with a leader. */
const DIRS: Array<[number, number, "start" | "middle" | "end", number]> = [
  [1, 0, "start", 0],
  [-1, 0, "end", 0], // beside: no penalty
  [0, 1, "middle", 1],
  [0, -1, "middle", 1], // above or below: one
  [1, 1, "start", 2],
  [-1, 1, "end", 2],
  [1, -1, "start", 2],
  [-1, -1, "end", 2], // diagonal: two
];
```

and the scoring, with `overlap` a box intersection in square pixels and
`crosses` a segment-against-box test:

```ts
let cost = pen + ring * 4;
if (prefer === "below" && dy <= 0) cost += 2;
if (box.x < 1) cost += (1 - box.x) * 5; // and the other three edges
for (const t of taken) cost += overlap(box, t) * 2;
for (const l of lines) if (crosses(box, l)) cost += 6;
```

The metrics are `NOTE_H` and `widthOf` just above it. The callers build
`taken` from the markers, `dot(burn, 10)` and `dot(sun, 5)` and the angle
and arrow boxes on the ejection drawing, and `rays` from the reference and
burn directions, then call `place` for each name in order of how
constrained it is, pushing each result's box onto `taken`. The result
carries the anchor the SVG text needs, the baseline to draw on, and the
leader segment when the name stood off.

## What made it real

The metrics are the measurement: 6.9 pixels a glyph and 15 tall, taken in
Chrome for the note role, and the comment's record that a pixel less put
names onto markers. The drawing is checked in the visual suite, which
renders the transfer card in a real browser and keeps its screenshots as
artefacts for a person to read; the jsdom suite in
[`test/transfer-card.test.tsx`](../../../../test/transfer-card.test.tsx)
holds that the card and its plots exist and are described, and cannot see
where a name landed, because jsdom does not lay out text. The rule under
_anything visible_ in [`.claude/rules/design.md`](../../../../.claude/rules/design.md)
is why the metrics are for one role: a name in a drawing is the note role
in the dim colour, as everywhere, so one measured width serves every name.

## Where it breaks

- **A fixed offset.** A name written at "up and to the right" of its point
  is right for one mission and on a marker for the next, because the
  geometry moves with the transfer. Scored candidates move with it.
- **Metrics a pixel short.** The scoring believed a name was clear when its
  last glyph sat on the dot. The measured width is the estimate that stopped
  it, and a change of font or size in the note role would need it
  re-measured.
- **Placing the easy name first.** The centre's name can go almost anywhere;
  placed first, it can take the one clear spot the ship's name needed. Most
  constrained first, and each placed box added to the set to avoid.
- **A leader that costs nothing.** If standing off were free the scorer
  would never place a name beside its point. Four points a ring is the
  price of the visual distance, small against overlap and large against a
  clear sideways position.
- **Trusting jsdom.** The test suite mounts the card but lays out no text,
  so a regression in placement shows only in the visual suite's
  screenshots, which a person has to look at.

## Try it

Run the snippet and read that the ship's name goes left at the second ring.
Then remove the ray, so the burn direction is not drawn: right at the first
ring still overlaps the dot and costs 90, so the name still stands off at
the second ring, but now to the right, because left and right tie at 4 and
the sideways-right direction is tried first.
Then shrink the dot to radius 3, `{ x: 97, y: 97, w: 6, h: 6 }`: now the
first ring clears it and the name sits beside its point at cost 0 on the
left, 6 on the right because of the ray. Then open the application, pick a
mission to Moho and one to Eeloo, and compare where the names sit on the two
ejection drawings.

## Check yourself

<details><summary>Why is overlap charged by the square pixel and doubled, while standing off costs a flat four per ring?</summary>

Because the two are not comparable failures. A name on a marker is
unreadable and misleading, so any overlap must lose to any clear position;
a name a few pixels further out with a leader is merely less tidy. Charging
overlap by area makes a large overlap much worse than a small one, and the
doubling puts even a three-pixel graze at 90 against a stand-off at 4.

</details>

<details><summary>Why are the names placed in a particular order, and which goes first?</summary>

Because each placed name's box is added to the set the next must avoid, so
the last name placed has the fewest options. The most constrained goes
first: the ship's name, which must sit near the burn marker with rays
leaving it. The centre's name, which can go almost anywhere, comes after and
is only asked to prefer below.

</details>

<details><summary>The drawing is SVG, so it cannot measure text. Where do its text metrics come from, and what happens if they are wrong?</summary>

From constants measured once in Chrome for the note role: about 6.9 pixels
a glyph plus 4, and 15 tall. Too large, and names stand off a little
further than they need to; too small, and the scoring believes a name is
clear when its last glyph is on a marker, which is what a pixel's
underestimate did.

</details>

## Further reading

- Jon Christensen, Joe Marks and Stuart Shieber, "An empirical study of
  algorithms for point-feature label placement" (ACM Transactions on
  Graphics, 1995), the standard survey of exactly this problem and the
  candidate-and-score approach.
- Eduard Imhof, "Positioning names on maps" (The American Cartographer,
  1975), the cartographer's rules the direction penalties encode: beside
  the point first, then above, then below.

## Key takeaway

Name a point by trying eight directions at three stand-offs, scoring each
candidate for what it would overlap, cross or leave the frame by, with
measured glyph widths and a small price for standing off on a leader, and
take the cheapest; place the most constrained name first and add each
placed box to what the next must avoid, and the drawing stays legible as
the geometry changes from Moho to Eeloo without a layout drawn by hand.

_As of 2ecc64f._
