# Energy, Not Excess Velocity

**Why it matters:** any time a patched-conic transfer is priced, and especially
when the body being left is small next to its own sphere of influence.

## The concept

The excess velocity v∞ is what a ship has left after climbing entirely out of a
body's gravity well. It is a convenient number because it is what the
heliocentric leg sees, but it only exists when the ship can actually escape. The
quantity that always exists is the characteristic energy, C3 = v² − 2μ/r, which
is _signed_: negative means a bound orbit. Writing the burn in energy costs
nothing when v∞ exists — the algebra is the same — and stays correct when it
does not.

## In this codebase

`atInfinity` in `src/core/transfer.ts` computed `sqrt(max(0, v² − 2μ/r_soi))`.
The floor at zero was doing real work only for moons: KSP hands a ship over at
the sphere's boundary whether or not it out-climbed the well, so a Mun → Minmus
departure legitimately leaves on a _bound ellipse_. Flooring that at zero threw
the transfer away and left bare escape velocity in its place. `c3Of` returns the
signed value now, and `injectC3` spends it:

```ts
const c3Of = (vrel: number, mu: number, rSoi: number) =>
  vrel * vrel - (2 * mu) / rSoi;

const injectC3 = (v: number, c3: number) =>
  Math.sqrt(Math.max(0, 2 * v * v + c3)) - v;
```

The remaining `max` is a guard against a nonsensical parking orbit, not a
physical floor: `2v² + c3` is the periapsis speed squared, and it is positive
for any orbit inside the sphere.

## What made it real

The Mun's sphere of influence is 20% of its orbital radius and its boundary
escape speed is 232 m/s. Every moon ejection came out at exactly 231 —
`sqrt(2μ/r) − v_circ`, a number with nothing to do with the window. The real
figure is 214. All 84 planetary windows stayed identical to the last digit,
which is what proved the rewrite was a rewrite and not a change.

## Key takeaway

When a formula floors a value to keep it real, ask what the floored case
physically is — it is often a valid state the model simply cannot express.
