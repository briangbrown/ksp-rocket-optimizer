# Butt Caps on a Translucent Trail

**Why it matters:** any stroke drawn as many short segments with varying
opacity — a fading orbit, a gradient path, a speed-coloured track — in SVG or
on a canvas.

## The concept

A line cap is painted at both ends of every segment. Where two segments meet,
two round caps overlap in a disc the width of the stroke, and that disc is
painted twice. With opaque ink the second coat changes nothing; with
translucent ink alpha compounds, and every joint comes out darker than the
segment on either side of it. A polyline of N translucent segments with round
caps is therefore N − 1 evenly spaced dots — it reads as dashed. Butt caps end
each segment exactly on the shared point, so no pixel is painted twice, at
the price of a wedge left open on the outside of each bend, which is nothing
when the segments are short.

## In this codebase

`Trail` in `src/ui/components/transfer.tsx` draws an orbit as one `<line>`
per sample — 72 around a parking orbit, 120 around a planet's — with
`strokeOpacity` falling from full just behind the body to a tenth just ahead,
which is how the game's map shows which way a thing is going without an
arrow. Each segment carries `strokeLinecap="butt"`, with the reason beside
it.

## What made it real

Nothing was measured beyond the eye: with round caps the fading orbits read
as dashed lines in both themes, and with butt caps they read as continuous.
The arithmetic stands in for the number. Two coats of a stroke at opacity 0.5
read as 0.75, a step anyone can see; the wedge butt caps leave outside a
joint is (w/2)·tan(θ/2), which for a 1 px stroke and the 5° between samples
is a few hundredths of a pixel, below anything a display can show.

## Key takeaway

Translucent strokes that share endpoints must not share paint: use butt
caps, or every joint becomes a dot.
