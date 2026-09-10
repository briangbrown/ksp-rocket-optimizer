# Severity Says Whose Fault It Is

**Why it matters:** whenever a measurement crosses a threshold and the
interface has to decide how loudly to say so.

## The concept

A severity scale looks like a scale of magnitude — a bigger number, a redder
box — but the axis a reader can use is _actionability_. `bad` means the reader
did something that can be undone; `warn` means something true about the world
they should know and cannot change; `info` means an instruction that keeps
things fine, which is neither praise nor a problem. The same number can earn
different severities on different days, because what changed is not the number
but whether the reader could have avoided it. Flag the unavoidable as a fault
and you teach the reader that red means nothing.

## In this codebase

`AscentPanel` in `src/ui/components/flight.tsx` flags a peak dynamic pressure
over 40 kPa, where a real KSP stack tends to flip or shed parts. It used to be
`bad` wherever it happened. Now `thick = Number(atm) > 1.5` — the surface
pressure in atmospheres — decides:

```tsx
severity={thick ? "warn" : "bad"}
```

Above 1.5 atm nothing keeps a rocket under 40 kPa and the trajectory shown is
already the gentlest that reaches orbit, so the sentence under the headline is
_That is Eve rather than your rocket_; on a thin-aired body it is _Drop a
booster, throttle the first stage back, or fly a shallower turn_. In the same
change _Hold the core at … until the boosters burn out_ and _Throttled to …_
went from `good` to `info`:
they are things to do, not things done well. The table in `docs/design.md` is
where the four meanings are written down.

## What made it real

Nothing was measured; the argument is the two thresholds and what sits either
side of them. 40 kPa is where the ascent model starts flagging heat. Eve's
surface pressure is 5 atm, Kerbin's is 1, and no design choice moves a body's
atmosphere — so a `bad` callout on every Eve ascent would be a red box with no
button behind it. Each severity also carries its own icon, so the distinction
survives without colour; the layout suite's axe count stayed at zero in both
themes.

## Key takeaway

Choose a severity by whether the reader can act on it, not by how large the
number is — the same reading is a fault in one place and a fact in another.
