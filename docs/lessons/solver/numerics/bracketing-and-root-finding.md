# Bracketing and root finding

**Syllabus:** [A3](../../README.md#part-2--algorithms-and-the-solver)

**Why it matters:** Root finding matters because three questions the solver
asks thousands of times have no closed-form answer and must be found
numerically: how much core propellant closes a boosted stage's budget, where
a planet is on a date, and where along an arc a plane change is cheapest;
each is solved by a different method chosen for the shape of its function
and how often it is called, and every one of them depends on a bracket that
really does contain the answer, because a bisection on a bracket with no
sign change and a golden section on the wrong valley both finish in the same
number of steps and both return a confident number that means nothing.

**Before this:** [P14](../../physics/orbits/keplers-equation.md), _Kepler's
equation: where a body is at time t_.

## A worked case

Size a stage by hand. An engine with an Isp of 320 s sits under 8 t of dry
mass and payload, and the stage must deliver 2,000 m/s. The rocket equation
gives Δv from propellant, not propellant from Δv, so define the function
whose zero is wanted:

    f(x) = 320 × 9.80665 × ln((8 + x) / 8) − 2,000

Negative when x is too little propellant, positive when it is enough. Start
at x = 0.1 t and multiply by 1.6 until f turns positive: ten steps take it to
11.0 t, and the answer is now known to lie between 6.9 and 11.0. Then halve:
try the midpoint, keep the half where the sign still changes, and repeat.
Twenty halvings shrink the 4.1 t bracket to four millionths of a tonne and
land on 7.1313 t, which is what solving the equation exactly gives. Every
step cost one evaluation of f, and the answer was never in doubt, only its
precision.

Now a planet's position. [Kepler's equation](../../physics/orbits/keplers-equation.md)
M = E − e sin E has to be solved for E, and Newton's method, from a starting
guess of E = M, takes four steps to reach 10⁻¹³ for an orbit like Duna's,
five or six for Gilly's at e = 0.55, and at e = 0.99 from a small M it takes
twenty-one, wandering before it settles. Started from E = π instead it takes
eight. The code starts from M below e = 0.8 and from π above, and never sees
more than seven or eight steps.

And a minimum rather than a root. The mid-course plane change of
[P19](../../physics/orbits/plane-change-and-inclination.md) is cheapest at
some point along the arc, and the cost along the arc is a smooth curve with
one dip. Golden-section search keeps a bracket round the dip and shrinks it
by 0.618 per evaluation, reusing one point each time; forty steps shrink a
bracket to 4.4 × 10⁻⁹ of its length, a twelve-day flight to a millisecond,
for forty evaluations of the cost.

```js
const isp = 320,
  g0 = 9.80665,
  dry = 8;
const f = (x) => isp * g0 * Math.log((dry + x) / dry) - 2000;
// bracket: grow by 1.6 until the sign changes
let lo = 0.1,
  hi = 0.1,
  grew = 0;
while (f(hi) < 0) {
  hi *= 1.6;
  grew++;
}
// bisection: twenty halvings
let a = lo,
  b = hi,
  n = 0;
while (b - a > (hi - lo) / 1048576) {
  const c = (a + b) / 2;
  n++;
  if (f(c) >= 0) b = c;
  else a = c;
}
console.log(
  grew,
  hi.toFixed(1),
  n,
  b.toFixed(4),
  (dry * (Math.exp(2000 / (isp * g0)) - 1)).toFixed(4),
); // 10 11.0 20 7.1313 7.1313
// Newton on Kepler's equation, counting steps
const kepler = (M, e, E) => {
  for (let i = 1; i <= 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) return i;
  }
  return 30;
};
console.log(
  kepler(1, 0.05, 1),
  kepler(1, 0.55, 1),
  kepler(0.1, 0.99, 0.1),
  kepler(0.1, 0.99, Math.PI),
); // 4 5 21 8
// golden section: how much forty steps shrink a bracket
console.log(Math.pow((Math.sqrt(5) - 1) / 2, 40).toExponential(1)); // 4.4e-9
```

## The idea

**Root finding** is solving f(x) = 0 numerically: given a function that can
be evaluated but not inverted, find the x at which it crosses zero. Every
method is a rule for choosing the next x to try from the ones tried so far,
and they differ in what they need, how fast they close in, and whether they
can fail.

A **bracket** is an interval [lo, hi] known to contain the answer. For a root
that means f(lo) and f(hi) have opposite signs: a continuous function that is
negative at one end and positive at the other must cross zero between them.
For a minimum it means three points with the middle one lowest. A bracket is
the only guarantee any of these methods has, and finding one is the first
job: the solver grows one by multiplying an upper guess by 1.6 until the sign
changes, which takes about two steps when the guess is good and ten when it
is not, and never more than eighteen.

**Bisection** halves the bracket on the side that keeps the sign change. It
gains exactly one binary digit per evaluation, so twenty steps give a
millionth of the bracket, it needs nothing but the sign of f, and it cannot
fail on a valid bracket. It is also the slowest method there is: Newton's
method gains digits quadratically, doubling the count of correct digits each
step, but needs the derivative and a starting point close enough not to be
thrown off, as e = 0.99 from a small M shows. Between them sits false
position, which draws the secant between the bracket's ends and tries where
it crosses zero, and its Illinois variant, which halves the retained end's
value when the same end is kept twice so the bracket cannot stagnate. It is
superlinear, needs only f, and never leaves the bracket, so a bad function
degrades it to bisection rather than making it diverge.

```
   f(x)
    │                                 ╱  f(hi) > 0
    │                             ╱
    │                         ╱
  0 ┼───────────────────●───╱──────────────────→ x
    │           ╱     the root
    │       ╱
    │   ╱  f(lo) < 0
    │
       [lo ─────────── mid ─────────── hi]        bisection: f(mid) < 0, so the
              [lo' ──────────── hi']              root is in the right half; keep it
```

**Golden-section search** is bisection's cousin for a minimum. With three
points a < c < b where f(c) is lowest, a fourth point is tried in the larger
gap; whichever of the two inner points is now lower becomes the new middle,
and one outer point is dropped. Placing the points in the golden ratio,
0.618 of the bracket from each end, makes the discarded point's position
reusable, so every step costs one new evaluation and shrinks the bracket by
the same factor. It needs the function to have a single dip inside the
bracket, and nothing else.

Which method for which job is the other half of the lesson. The core sizing
is called hundreds of millions of times across a design run and its function
is monotone and cheap, so the cost is all in the count of evaluations:
Illinois. Kepler's equation is smooth with a trivial derivative and is solved
once per body per date, so Newton's quadratic convergence is free to take:
four to eight steps. The plane-change position is a minimum of a smooth cost
with no derivative to hand: golden section. And in every case the bracket
comes first, because a method that never leaves its bracket is only as good
as the bracket it was given.

## In this codebase

`solveCore` in [`src/core/solver.ts`](../../../../src/core/solver.ts) sizes
the core of a boosted stage. The bracket is grown just above it:

```ts
let lo = aspHere ? 0.05 : coreBurnA * 1.03, hi = lo;
// ...
for (let i = 0; i < 18 && hi < 8000; i++) {
  hi *= 1.6; // grow until the budget closes
  if (boostDv(hi, ...) >= dv) { found = true; break; }
}
```

and inside `solveCore` the Illinois step, with two guards: a secant step that
would land within a sixty-fourth of an endpoint falls back to the midpoint,
and `boostDv` returns −1 for a load the stage cannot fly at all, which is a
sentinel and not a value, so any step that would interpolate through it is a
bisection instead. The tolerance is `(hi − lo) / 1048576`, one part in 2²⁰,
chosen so the answer is at least as precise as the twenty halvings it
replaced, and the function returns `hi`, the side known to close the budget:
a rocket sized slightly heavy reaches orbit, one sized slightly light does
not.

`eccentricAnomaly` in [`src/core/kepler.ts`](../../../../src/core/kepler.ts)
is Newton's method in five lines, with the starting guess switched at e = 0.8:

```ts
let E = e < 0.8 ? M : Math.PI;
for (let i = 0; i < 30; i++) {
  const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  E -= d;
  if (Math.abs(d) < 1e-13) break;
}
```

`goldenMin` in [`src/core/transfer.ts`](../../../../src/core/transfer.ts)
is the golden section, forty steps, called by `price` to place the mid-course
plane change along the arc and by `raiseCell` to find the burn's longitude on
the parking orbit after a coarse scan of the whole circle. That coarse scan
is the bracket: golden section is handed the neighbourhood of the coarse
minimum, never the whole circle.

## What made it real

The comment on `solveCore` is the measurement for the core sizing: across a
grid run the twenty fixed bisections were 363 million evaluations of the
rocket equation, 85% of everything the function did, while growing the
bracket averaged 2.25 steps. Replacing them with Illinois at a matched
tolerance left the design snapshot unmoved, which is how a change to a
numerical method is shown to have changed only its speed.

Kepler's solve is held by the tests that depend on it. "Puts the planets
where their elements say at epoch" in
[`test/transfer.test.ts`](../../../../test/transfer.test.ts) requires Kerbin
at 180° and Duna 135.5° ahead at UT 0, and the Lambert test requires two
positions on Eeloo's orbit, the most eccentric planet, to be joined by
Eeloo's own velocities to a millimetre per second; both are Newton solves of
Kepler's equation to 10⁻¹³ underneath. The step counts above, four to eight,
are measured on the same function.

The bracket rule has its own measurement. The raise search's longitude was
once bracketed at ±90° about half a turn back from the arrival, and golden
section found a minimum there every time; it was the Hohmann's, and for any
flight time far from the Hohmann's the real minimum lay outside the
bracket. The plot painted its short-flight half as though no transfer
existed. The rule under _Out to your own moon_ in
[`.claude/rules/solver.md`](../../../../.claude/rules/solver.md) records the
fix: scan the whole circle, then refine.

## Where it breaks

- **A bracket with no sign change.** Bisection on [lo, hi] where f has the
  same sign at both ends halves toward one endpoint and returns it, with the
  same confidence as a real root. The growth loop exists so `solveCore` is
  never handed such a bracket, and the `found` flag skips the candidate when
  even 8,000 t of core does not close the budget.
- **A minimum outside the bracket.** Golden section returns the lowest point
  of the interval it was given, which is an endpoint when the dip is
  elsewhere. The ±90° raise bracket is the recorded case.
- **Interpolating through a sentinel.** `boostDv`'s −1 means "cannot fly",
  not "−1 m/s"; a secant drawn to it points at nothing. The Illinois loop
  checks for it and bisects instead.
- **Newton from the wrong side.** At high eccentricity a start of E = M can
  wander for twenty steps; the code starts from π above e = 0.8. Newton's
  speed is conditional on its start in a way bisection's never is.
- **Two solvers for one truth.** Anomaly to time is closed form, time to
  anomaly is Newton; the encounter check of
  [P23](../../physics/orbits/encounters-on-the-way.md) walks by anomaly so it
  never needs the slow direction. Choosing the direction of a problem is
  often the choice of method.

## Try it

Run the snippet, then change the target from 2,000 to 6,000 m/s: the
bracket grows fourteen times instead of ten, to 72 t, and the bisection
still takes twenty steps, because the count depends on the tolerance, not
the answer. Then change the Newton starts: at e = 0.99 and M = 0.1, the
start from M takes twenty-one steps and the start from π takes eight, which
is the line in `eccentricAnomaly`.

## Check yourself

<details><summary>Bisection takes twenty steps to shrink a bracket by a factor of a million whatever the function. Why did the solver replace it in `solveCore` but keep Newton in `eccentricAnomaly`?</summary>

Because of how often each is called and what each function offers. The core
sizing runs hundreds of millions of times across a design run, so the
twenty evaluations per solve were 85% of the function's cost, and Illinois
gets the same precision in fewer. Kepler's equation is solved once per body
per date, is smooth and has a trivial derivative, so Newton's four to eight
steps are already cheap and nothing is gained by changing it.

</details>

<details><summary>Golden-section search on an interval that does not contain the minimum returns an answer in the same forty steps. What does it return, and how would you know?</summary>

The lowest point in the interval it was given, which is one of its ends.
Nothing in the method signals it; the bracket is the caller's promise. The
raise search's ±90° bracket returned the Hohmann-adjacent minimum for every
flight time and the plot's empty half was the only sign. The fix was to scan
the whole range coarsely first, so the bracket handed to golden section
always contains the dip.

</details>

<details><summary>Why does `solveCore` return the upper end of its final bracket rather than the midpoint?</summary>

Because the two errors are not symmetric. The upper end is a propellant load
known to close the budget; the midpoint might not. A stage sized a few
grams heavy is a slightly heavier rocket; one sized a few grams light is a
rocket that does not reach orbit. The tank packer is then asked to cover
that upper value.

</details>

## Further reading

- William Press et al., _Numerical Recipes_, the chapter on root finding for
  bracketing, bisection, false position and Newton, and the chapter on
  minimisation for golden-section search.
- Richard Burden and Douglas Faires, _Numerical Analysis_, the chapter on
  solutions of equations in one variable, for convergence rates and the
  conditions under which Newton's method fails.

## Key takeaway

Find a bracket first, because every method here is only as good as the
interval it is given; then choose by the function and the call count:
bisection or Illinois where only the sign is cheap and the call is made
hundreds of millions of times, Newton where the derivative is free and the
call is rare, golden section where a minimum is wanted and no derivative
exists, and never trust a confident answer from a bracket that did not
contain it.

_As of 2ecc64f._
