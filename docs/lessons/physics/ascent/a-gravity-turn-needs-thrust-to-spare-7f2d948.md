# A Gravity Turn Needs Thrust to Spare

**Why it matters:** simulating or flying an ascent on a stack whose
thrust-to-weight is near one, where the textbook gravity turn quietly stops
being an option.

## The concept

A gravity turn kicks the nose off vertical once and then follows the velocity
vector; gravity does the steering. It works because gravity rotates the velocity
vector downward at a rate that goes as g/v, and thrust along that vector keeps v
growing fast enough that the rotation stays slow. Near TWR 1 the net
acceleration is close to zero, v barely grows, and the vector falls over faster
than the thrust can carry it forward — a real kick becomes a lofted stall. The
only prograde-following flight that reaches orbit is then the shallowest, latest
kick, which is nearly "go straight up" and pays for it in gravity loss. What a
pilot does instead is hold the nose a few degrees _above_ prograde: the thrust's
vertical component fights the rotation, and an earlier, larger kick survives.
That is a third control a two-parameter turn cannot express.

## In this codebase

`flyAscent` in `src/core/ascent.ts` took `vKick` and `kick` and followed
prograde after the handoff. It now takes `lead`, radians above prograde, applied
as `pro - lead` in both the handoff test and the pitch floor; zero reproduces
the classic turn exactly, and a test holds `lead: 0` equal to no lead at all.
`optimiseTurn` runs the two-parameter search first, then tries `LEADS` (3, 6,
10, 15°) round that seed. The flight card's SAS step became "keep the nose N°
above it" where it said "switch SAS to prograde" (#10).

## What made it real

On the six-Hammer Mainsail of #167 and #168 — 187.5 t, TWR 1.40 for 24 s then
0.88 — the best two-parameter flight paid 2,190 m/s of gravity loss on a
4,549 m/s ascent, where a rocket lifting off at 1.4 normally loses 1,200–1,500.
With the nose held 6° above prograde it takes a 7° kick at 125 m/s and flies
for 4,223 m/s, gravity loss 1,954. A 4× Twitch / Spark stack that already flew
well was unchanged, lead 0: the third control costs nothing where the first two
suffice.

## Key takeaway

Following prograde only steers a rocket that is accelerating; near TWR 1 the
nose has to lead the velocity vector, and a program without that control will
always answer "go straight up".
