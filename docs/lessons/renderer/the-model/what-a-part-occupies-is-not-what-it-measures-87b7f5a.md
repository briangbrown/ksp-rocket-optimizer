# What a Part Occupies Is Not What It Measures

**Why it matters:** whenever one width per part is being used to answer two
questions — how big to draw it, and whether something can stand beside it.

## The concept

A part in a stack has two widths. Its silhouette is what a measurement returns —
for an engine, the bells, read off its drag cube — and is the right width to draw
it at. Its occupancy is the footprint it claims in the structure — for a stack
engine, the node it mounts on, because a booster beside it runs past the node
with a small gap and that is what the game shows. The two coincide for a tank
and diverge for an engine, so a test asking "is there anything here to bolt to"
with the silhouette says no where the answer is yes. When two numbers disagree
like this, the fix is not a tolerance on the comparison. It is the categorical
distinction that says which number applies — here, whether the part is
stack-mounted or radial. A radial engine occupies only what it measures, because
it is bolted to the side of something rather than sitting under it, and that is
exactly the case a tolerance would have broken.

## In this codebase

`stageParts` in `src/core/model.ts` walks a booster's foot down from the tank
base through the adapters, the coupler and the engine, stopping at the first
section too narrow to stand against. The engine's reach was
`clusterSpan(g.perEng, g.ed) / 2`, with `g.ed` from `widthOf` — the measured
face. Against a 3.75 m tank, a Mammoth measured at 3.267 m failed on the first
step, and six Castors were drawn strapped to the tanks 25 m up the stack (#109).
The section now reaches

```ts
const engineHold = isRadial(sol.engine)
  ? g.ed
  : Math.max(g.ed, diaOf(sol.engine));
```

and the 0.29 m Twitch under a 1.25 m tank from #86 still stops the walk. The
next change (#112) supplied the other half: each section carries `reach` for how
far down the booster goes and `draw` for how far out it stands, because a
Mammoth is in truth 3.98 m across the bells under a 3.75 m stack, and a ring
held at the tank's radius sat 0.117 m inside it. Two questions, two widths.

## What made it real

The mission grid could not reach the case: with ReStock+ off, every stack engine
in it measures within a centimetre of its own node. The Mammoth's 3.267 m then
turned out to be a corrupt drag cube (#110, #112), and the illustration moved to
the Ant — 0.37 m across on a 0.625 m node, the one stack engine in the roster
narrower than its node in both a stock and a ReStock install (#117). The rule
survived both corrections; only its example was an artefact. `test/model.test.ts`
stopped asking for a gap of exactly zero and asks for one under a fifth of the
booster's reach, a bar set by the stack size ladder: adjacent sizes differ by at
least a quarter, so a section within a fifth is the same class measured a little
small and one a class down is not. The grid's own stack engines leave 5 to
14 mm; the Twitch stands 77% clear. No design moved, because `modelOf` is the
drawing and nothing here reaches `stageSize` or the solver.

## Key takeaway

When a measured width fails a structural test, ask what the part occupies rather
than loosening the comparison — the distinction that decides which width applies
is a category, not a tolerance.
