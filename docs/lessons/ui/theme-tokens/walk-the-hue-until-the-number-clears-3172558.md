# Walk the Hue Until the Number Clears

**Why it matters:** deriving text or outline colours from a set of arbitrary
hues — brands, categories, planets — that must meet a contrast ratio on more
than one ground.

## The concept

A fixed transform, "lighten anything dark by 35%", encodes a guess about where
the failures are, and it is wrong three ways. Some hues need more than the fixed
amount and stay under the bar; some need none and lose their identity for
nothing; and the direction reverses with the ground, since on a light theme a
hue must go _darker_ to clear it. The robust form states the constraint —
contrast at least 4.5:1 on the hardest ground the colour lands on — computes it
the way the auditor does, and steps toward the ground's opposite until it holds.
The computation matters as much as the loop: WCAG contrast is defined on
linearised luminance, and a weighted sum of gamma-encoded channels is a fair
"is this light or dark" but not the number an audit will check.

## In this codebase

`edgeOf(h, theme)` in `src/ui/tokens.ts` picks `shade` for the light theme and
`lift` for dark, then steps `t` from 0.05 in 0.05s while
`contrast(out, panel2) < 4.5`. `contrast` is built on `linOf`, the sRGB-to-linear
luminance; the older gamma-space `lumOf` stays for `inkOn`, where "is this
button face light or dark" is a judgement rather than a standard. The version it
replaced was `lumOf(h) < 0.35 ? lift(h, 0.35) : h` (#131).

## What made it real

Under the fixed lift, Minmus, Jool and Eeloo sat under 4.5:1 on the dark
`panel2`; in light, Pol, Moho and Kerbin needed darkening, which a lift cannot
do. With the walk, most of the sixteen body hues are untouched and those six
move by exactly as much as they must. The only contrast failures left on the
page were five _cut here_ labels in `rule` on `panel` at 1.7:1 — a token misuse,
not a hue — and with them recoloured axe's `color-contrast` was zero in both
themes.

## Key takeaway

Do not guess how far to move a colour; state the ratio it must clear on its
hardest ground, compute it the way the auditor does, and step until it does.
