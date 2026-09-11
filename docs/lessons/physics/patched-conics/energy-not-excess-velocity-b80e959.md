# Characteristic energy, not excess velocity

**Concept:** [P18](../../README.md#part-1--physics), _[Ejection: characteristic
energy and the hyperbolic leg](../orbits/ejection-energy-and-the-hyperbolic-leg.md)_.

**Why it matters:** Pricing a departure from its excess velocity matters
because a moon's sphere of influence is so small that a ship can leave it still
bound to the moon, and a formula that cannot express a bound departure prices
every moon window at escape velocity instead of at what the window costs.

## The idea

When a ship climbs away from a body, the speed it has left once the body's
pull is spent is its **excess velocity**, v∞. It is the convenient number for
the leg that follows, but it exists only if the ship escapes. What always exists
is the **characteristic energy**, C3 = v² − 2μ/r: twice the ship's orbital
energy per unit mass, equal to v∞² when the ship escapes and negative when it
does not. Written in energy, the departure burn costs the same algebra when v∞
exists and stays correct when it does not.

## In this codebase

KSP hands a ship from one body to the next at the edge of the **sphere of
influence**, the region in which only that body's gravity is counted, whether
or not the ship has out-climbed the body's pull. The Mun's sphere ends at 20% of
its orbital radius, so a ship leaving the Mun for Minmus crosses the edge still
on a **bound orbit**, a closed one that would bring it back, and its v∞ is
imaginary. `atInfinity` in [`src/core/transfer.ts`](../../../../src/core/transfer.ts) computed
`sqrt(max(0, v² − 2μ/r))`, and the floor at zero turned every such departure
into one at exactly escape velocity, whatever the window asked for. `c3Of` now
returns the signed energy and `injectC3` spends it:

```ts
const c3Of = (vrel: number, mu: number, rSoi: number) =>
  vrel * vrel - (2 * mu) / rSoi;

const injectC3 = (v: number, c3: number) =>
  Math.sqrt(Math.max(0, 2 * v * v + c3)) - v;
```

The remaining `max` guards against a nonsensical **parking orbit**, the low
orbit a ship waits in before it departs; it is not a physical floor. 2v² + C3 is
the square of the speed at the bottom of the departure path, and it is positive
for any orbit inside the sphere.

## What made it real

The Mun's escape speed at the edge of its sphere is 232 m/s, and every Mun
departure the tool priced came out at 231 m/s: `sqrt(2μ/r) − v_circ`, a number
with nothing to do with the window. Priced from energy, the same departure is
214 m/s. All 84 windows between planets, where v∞ is real, stayed identical to
the last digit, which is what proved the rewrite changed the moons and nothing
else.

## Key takeaway

When a formula floors a value to keep it real, ask what the floored case
physically is; it is often a valid state the model simply cannot express.
