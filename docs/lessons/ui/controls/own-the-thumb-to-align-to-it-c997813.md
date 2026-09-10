# To Align With a Native Control, Own Its Geometry

**Why it matters:** any overlay that has to line up with a native control's
moving part — stops on a slider, ticks under a range input, a fill that follows
the handle.

## The concept

A range input's thumb travels the track's width minus its own, so its centre at
value `v` is `half + (width − 2·half) · v / max`, and `half` is the platform's:
a sixteen-pixel thumb on desktop Chrome, wider on Android and iOS, drawn by the
OS. Anything placed by that formula with a guessed `half` is right on one
platform and off on the others, most at the ends and least in the middle, since
the error grows with the distance from the centre. The native width cannot be
read reliably; it can be replaced. `appearance: none` with an explicit thumb size
makes the constant yours on every platform, and the overlay and the thumb then
share one rule. The price is that the track and its fill become yours to draw
too — and a pseudo-element takes no inline style, so the fill has to follow the
value through a custom property set on the input.

## In this codebase

The scrubber's stops on the phone (#210). `src/ui/styles.ts` strips the range
input (`appearance: none`), draws an eighteen-pixel thumb and a four-pixel track
whose gradient reads `--fill`; `BuildView` in `src/ui/components/build.tsx`
sets `--fill` inline from the handle's value and places each stop at

```ts
`calc(${THUMB_HALF}px + (100% - ${2 * THUMB_HALF}px) * ${i / last})`;
```

with `THUMB_HALF = 9` — the same nine the thumb's centre runs in from either
end, because the thumb is now eighteen wide everywhere.

## What made it real

The first cut placed the dots nine pixels in with the native thumb, which is
where a sixteen-pixel desktop thumb's centre goes; on a phone the wider native
thumb's centre ran a narrower course, and the end dots sat visibly off it, the
middle ones by less. With the stylesheet's thumb, `visual/stops.test.ts` finds
the thumb's amber run off the pixels of a screenshot and holds its centre within
1.5 px of the lit dot's at the pad, a middle step and the end.

## Key takeaway

If something must line up with a native control, stop guessing the platform's
constant and set it — `appearance: none` makes the number yours.
