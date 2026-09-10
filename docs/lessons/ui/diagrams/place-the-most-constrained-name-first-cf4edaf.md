# Place the Most Constrained Name First

**Why it matters:** any diagram whose labels are positioned by rule rather
than by hand, and whose geometry changes with the data — the layout that is
clean for one dataset is a pile-up for the next.

## The concept

A fixed offset — "the name goes to the right of its point" — is a layout
decision made before the data is known, and it holds only for data that
resembles the case it was drawn for. Placing names is a small search instead:
each candidate position is scored against what is already down — the other
names, the markers, the lines, the frame — and the cheapest wins, with a
leader where it had to stand off. The search is greedy, so order matters: the
label with the fewest good positions goes first and the one with the most
room to give goes last. And a placer can only use room that exists; where the
geometry crushes everything into one spot, the scale has to change before
placement can help.

## In this codebase

`place` in `src/ui/components/transfer.tsx` tries eight directions at three
stand-offs about a point and scores each: overlap by the pixel, the frame by
the pixel over, a ray crossed, a ring further out. `Heliocentric` places in
order — the phase angle, the ship, the departure body, the arrival body,
Kerbol beneath its mark, and "_body_ at launch" last. The same drawing maps
every radius as `(r / r_max) ^ 0.6` (`POWER`), because a linear scale put
Kerbin's orbit at 15% of the frame against Eeloo's and left nothing to place
into; the caption says the distances are compressed. The `beside` it replaced
chose a side by one test — does the name fit between its point and the frame
— and nothing else (#200).

## What made it real

Twelve From/To pairs, every `<text>` box in the four drawings measured with
`getBBox` in headless Chrome: eleven of the twelve had a name on another
name, on a marker or on the phase label before, and none after
(`visual/transfer.test.ts`). The compression alone moved Kerbin's orbit from
15% to 32% of the frame. The placer's glyph estimate — 6.9 px a glyph, 15 px
tall — is Chrome's measurement; an estimate a pixel short put names a pixel
onto markers, which is why the check measures real text in a browser and not
in jsdom, which has no text metrics.

## Key takeaway

Labels are placed by a scored search over what is already drawn, most
constrained first — and the check that they are clear has to measure real
text.
