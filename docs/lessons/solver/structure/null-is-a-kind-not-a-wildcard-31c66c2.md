# Null Is a Kind, Not a Wildcard

**Why it matters:** any fallback that widens a filter when the exact match is
missing, where the widening admits rows whose field is null.

## The concept

In a data table a null field often encodes a category, not an unknown: "no
diameter" on a decoupler means it attaches to a surface, not that it fits
every stack. A fallback written as "anything with no size, or a size at least
this big" reads the null as a wildcard and so, exactly when the right size is
missing, hands back the rows that cannot do the job — cheapest first, because
the radial parts are cheap. The fix is to decide what null means before any
size is asked for, and to order the fallback the way a person would: the
exact size, then the largest that fits under it, then the smallest that is
wider.

## In this codebase

`pickStruct` in `src/core/parts.ts`, for a decoupler, fell back to
`ok.filter((x) => x.d == null || x.d >= d)`. In `structure.json` the parts
with `d: null` are the TT-38K, the TT-70 and the Hydraulic Detachment
Manifold — the three radial decouplers — so a 5 m Kerbodyne stack on a roster
without the TD-37 was handed a TT-38K on price, a part with no stack node at
all (#190). The other branch was wrong the other way: a 1.875 m ReStock+
stack took the 160 kg TD-25 as the cheapest wider part where a player puts
the 40 kg TD-12 under it. The decoupler branch drops `d: null` first now,
then exact size, then the largest researched no wider, then the smallest
wider; `decouplerFor` asks it with the stack's size class.

## What made it real

`test/decouplers.test.ts` asks the picker at every tier and every size
class: seven of nine tiers failed on the old picker. Neither the design
snapshot nor the mission sweep moved — their rosters carry a decoupler at
every size they use, which is why they had never seen it — but the default
roster's solvability moved on every destination that builds: Mun 80.9 t →
74.0, Jool 151.6 → 126.1, Ike 96.4 → 81.1, from 120 kg saved at each joint.

## Key takeaway

Before a fallback widens a filter, ask what a null in that column means — it
is usually a kind of part, and the fallback is about to select exactly that
kind.
