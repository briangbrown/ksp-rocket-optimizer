# Design guide

How the application looks and behaves, and the one place a size, a colour, a
spacing or a role is decided. `src/ui/tokens.ts` is this document as code; when
the two disagree the code is wrong and the fix goes in both.

The refresh this guide belongs to is [#127](../../../issues/127). The
measurements it starts from are in that issue: thirteen font sizes, 166 text
elements under 12 px, 28 of 58 controls under 24 px, 1,755 words on a solved
page. The guide exists so that none of those numbers can grow back.

`.claude/rules/design.md` is the short form — the must-nots an agent reads
before touching `src/ui/`. This is the reference.

---

## 1. Principles

For the person building a component, in the order they should win an argument:

1. **Ask, then get out of the way.** The brief is the only thing on the page
   that wants input. Once it has it, it folds to a line and the page is result.
2. **The phone is the design; the desktop is the phone with room.** Lay a thing
   out at 390 px first. A second column is earned at 1024, not assumed.
3. **Utility in reading order.** What the reader does with a result decides
   where it sits: the rocket, how to build it, how to fly it, where it goes.
4. **One idiom per job.** A boolean is a `Toggle`. A choice is a `Choice`. A
   warning is a `Callout`. A paragraph you might want is a `Disclosure`. Do
   not invent a fourth way to show a chip.
5. **A role, not a size.** Nothing sets a font size, a colour or a radius. It
   names the role and the token supplies the value.
6. **Over a sentence, disclosed.** The voice stays — the craft names, the
   subtitles, the asides — but an explanation longer than one sentence is one
   tap away, never on the page by default.
7. **An icon where one is established, a word where it is not.** Copy, paste,
   share, settings, close, chevrons, scissors: icons. "Return trip", "auto",
   "3": words.
8. **Budgets are measured.** Page height, word count, target size, type floor,
   contrast: the layout suite holds a number for each and a PR moves the number
   it improved.

---

## 2. Information architecture

The page as the reader meets it. Everything below the brief is a `Section`
that folds to a one-line summary (#134). The first three open; the route
starts folded unless the mission has a cut, since a cut is the one thing on
it that changes the rocket. Their lines: _Your rocket_ is the craft name and
the liftoff mass; _How to build it_ is `4 stages · 22 parts · 70.6 t`; _How to
fly it_ is `3,723 m/s · MECO T+00:05:17 · circularise 111 m/s`; _Where it
goes_ is `7 legs · 7,216 m/s · one span`. The build section is two lists
behind one `Choice` in its `aside`: _By stage_ is the design, with the
stage-count picker; _Build order_ is the bill.

```
BRIEF        where to · what kind · what it carries · how much margin
             ↓ set →  Kerbin → Mun · land & return · 2.5 t · cheapest   [edit] [share]
YOUR ROCKET  the drawing, its name, the headline figures, any warning about it
HOW TO       stages | build order
BUILD IT
HOW TO       the flight card, the profile table, the return ascent
FLY IT
WHERE IT     the transit line and its scissors
GOES
footer       source and licence, one line
```

Setup — which expansions are installed, the tech tree, the theme, copy and
load — is the reader's install rather than their mission. It lives behind a
`Settings` icon in the header, in a `Sheet`, and the data sources and the
list of what is still approximate — the old footer's two paragraphs — are a
`Disclosure` at its foot, _About the numbers_.

### Phone, 390 px

```
┌──────────────────────────────────┐
│ KSP ROCKET OPTIMIZER         [⚙] │  header: title and setup only
├──────────────────────────────────┤
│ Kerbin → Mun · land & return     │  brief, set — sticky under the
│ 2.5 t · cheapest        [✎] [⇪]  │  solving bar
├──────────────────────────────────┤
│ YOUR ROCKET                      │
│ ┌──────────────────────────────┐ │
│ │                              │ │  the elevation, square-ish,
│ │        (elevation)           │ │  full width
│ │                              │ │
│ └──────────────────────────────┘ │
│ Kerbal Express ✦ "the tall one"  │  display name, note subtitle
│ 70.6 t   4 stg   31 m   √48k     │  figure-lg row
│ [⚠ 12.4 : 1 — long for its width]│  callout, headline only
├──────────────────────────────────┤
│ HOW TO BUILD IT   (stages|order) │
│ 4 stages · 22 parts   ▸          │  folded summary
├──────────────────────────────────┤
│ HOW TO FLY IT                    │
│ 3,723 m/s · MECO T+05:17   ▸     │
├──────────────────────────────────┤
│ WHERE IT GOES                    │
│ 7 legs · 7,216 m/s · one span ▸  │
├──────────────────────────────────┤
│ [rocket] [build] [fly] [route] ↑ │  jump bar, once scrolled past
└──────────────────────────────────┘  the brief
```

### Desktop, ≥1024 px

```
┌───────────────────────────────────────────────────────────────┐
│ KSP ROCKET OPTIMIZER                                      [⚙] │
├────────────────────┬──────────────────────────────────────────┤
│ BRIEF   (sticky)   │ YOUR ROCKET                              │
│ Kerbin → Mun       │ ┌──────────────┬────────┐ Kerbal Express │
│ land & return      │ │  elevation   │  plan  │ 70.6 t · 4 stg │
│ 2.5 t · cheapest   │ │              │        │ 31 m · √48k    │
│ [✎] [⇪]            │ └──────────────┴────────┘                │
│                    │ HOW TO BUILD IT          (stages | order)│
│ WHERE IT GOES      │ ┌ stage 4 ──┐ ┌ stage 3 ──┐              │
│  Kerbin            │ │           │ │           │              │
│   ✂ ── 950 m/s     │ └───────────┘ └───────────┘              │
│  Mun orbit         │ HOW TO FLY IT                            │
│   ── 580 m/s       │ ①──②──③──④──⑤──⑥──⑦   timeline           │
│  Mun surface       │ profile table                            │
│                    │                                          │
└────────────────────┴──────────────────────────────────────────┘
      360 px                          the rest
```

The left column is the two things that are inputs — the brief and the route,
since a cut changes the rocket. The right column is the three things that are
results. Between 640 and 1024 the phone flow holds with wider cards; nothing
goes side by side until both halves have room.

---

## 3. Type

Three families, six roles, one size per role per breakpoint. Nothing else.

| Role      | Family           | Phone | Desktop | Weight | Case, tracking   | For                                                               |
| --------- | ---------------- | ----- | ------- | ------ | ---------------- | ----------------------------------------------------------------- |
| `display` | Barlow Condensed | 28    | 34      | 600    | caps, `.06em`    | the title; the craft name on the rocket                           |
| `heading` | Barlow Condensed | 15    | 15      | 600    | caps, `.06em`    | section and stage names; the flight card's step titles            |
| `label`   | IBM Plex Mono    | 12    | 11      | 500    | caps, `.14em`    | field and stat labels, table heads, the eyebrow over a section    |
| `body`    | Inter            | 14    | 13.5    | 400    | sentence, `0`    | reading text, chips, buttons, callout headlines, field values     |
| `figure`  | IBM Plex Mono    | 13    | 13      | 500    | tabular numerals | any number a reader compares: Δv, mass, cost, T+, the typed value |
| `note`    | Inter            | 13    | 12.5    | 400    | sentence, `0`    | secondary text: subtitles, disclosed hints, units beside a figure |

`figure` has one larger form, **`figure-lg`** at 24 (phone 22), for the
headline statistics under the rocket and nowhere else. `body` at weight 600 is
emphasis; it is not a seventh role.

Line height: `1.2` for `display` and `heading`, `1.5` for `body` and `note`,
`1` for `figure` inside a stat, `1.4` in a table.

### Floors

On the phone nothing renders under 12 px and nothing in `body` under 13. On
desktop nothing under 11. The layout suite asserts both.

### Where every current size goes

The migration is a lookup. Every `fontSize` in `src/ui` today, and the role
that replaces it:

| Today | Where                                                                                                                                | Becomes                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 9.5   | part count beside a tech node                                                                                                        | `note`                                                                     |
| 10    | `.eyebrow`; table heads; the Iso chip; the plane-change chip; the cut label; step numbers; hint under the tech tree; picker chevron  | `label` (heads, cut label, step numbers) · `note` (hints) · `body` (chips) |
| 10.5  | slider hints; parts legend; config textarea; expansion part counts; stage-count chips; profile-table heads; `above the slider range` | `note` · `label` (heads) · `body` (chips)                                  |
| 11    | craft subtitle; route leg notes; objective explainer; footer; stage-card item lines                                                  | `note`                                                                     |
| 11.5  | the solving bar's second line; callout body; picker summary                                                                          | `note`                                                                     |
| 12    | `.chip`; unit beside a Stat; exclusion count; parts table cells                                                                      | `body` (chips) · `note` (units) · `figure` (cells)                         |
| 12.5  | reading text in cards; checkbox labels; the solving bar's first line; stage summary                                                  | `body`                                                                     |
| 13    | callout headline; flight step text; `sol.n`                                                                                          | `body` · `figure` (`sol.n`)                                                |
| 13.5  | craft subtitle in the header                                                                                                         | `note` — the name is `display`                                             |
| 14    | the typed value beside a slider                                                                                                      | `figure`                                                                   |
| 14.5  | planet buttons                                                                                                                       | `body` 600                                                                 |
| 15    | stage headings                                                                                                                       | `heading`                                                                  |
| 19    | `Stat` when `small`                                                                                                                  | `figure`                                                                   |
| 24    | `Stat`                                                                                                                               | `figure-lg`                                                                |
| 34    | the title                                                                                                                            | `display`                                                                  |

Tracking today is `.22em` (eyebrow), `.18em` (panel heads), `.14em` (cut
label), `.08em` (profile heads), `-0.01em` (planet buttons). All caps labels
take `.14em`; nothing else tracks.

### Loading

Self-hosted `woff2` subsets in `public/fonts/`, `font-display: swap`, the body
face preloaded. Every face declares its fallback: `Impact, sans-serif` for
Barlow, `system-ui, -apple-system, sans-serif` for Inter, `ui-monospace, Menlo,
monospace` for Plex. `FONT` in `tokens.ts` is the body stack and the reason it
is a token is the portal trap in `.claude/rules/ui.md`.

---

## 4. Colour

One palette, both themes, every token with a job. A colour is used for its
semantics or it is not used.

### Surfaces and ink

| Token    | Job                                         | Dark      | Light     | Must clear                                |
| -------- | ------------------------------------------- | --------- | --------- | ----------------------------------------- |
| `ink`    | the page ground; the well behind a textarea | `#0A1017` | `#E9EDF2` | —                                         |
| `panel`  | the card                                    | `#111A25` | `#FFFFFF` | —                                         |
| `panel2` | a raised thing on a card: a chip, a field   | `#16212F` | `#EDF1F6` | —                                         |
| `rule`   | a divider                                   | `#2E4258` | `#CFD8E3` | nothing — decorative                      |
| `edge`   | the outline of anything you can press       | `#52708F` | `#6F8399` | 3:1 on `panel` and `panel2` (3.2 / 3.4)   |
| `paper`  | primary text                                | `#E6EDF6` | `#0F1720` | 4.5:1 everywhere (13.8 / 15.3 at worst)   |
| `muted`  | secondary text                              | `#7E93AD` | `#4B5D72` | 4.5:1 everywhere (5.2 / 5.7)              |
| `dim`    | tertiary text: labels, notes, hints         | `#7389A6` | `#58697E` | 4.5:1 on `panel` and `panel2` (4.5 / 5.0) |

The two numbers after each bar are the worst case in dark and in light. `dim`
in dark is at the floor on `panel2` and should not be used on `ink`.

A selected chip inverts: `paper` ground, `ink` text. That pair is 16:1 in both
themes and is the only place `ink` is a text colour.

### Severity

Four, each with an icon so that colour is never the only carrier. The icon is
the `lucide` name.

| Token  | Icon            | Dark    | Light   | Text on `panel` | For                                                              |
| ------ | --------------- | ------- | ------- | --------------- | ---------------------------------------------------------------- |
| `info` | `Info`          | `sky`   | `sky`   | 5.9 / 6.0       | something to know: a stage runs dry early, the core is held      |
| `good` | `CircleCheck`   | `mint`  | `mint`  | 9.2 / 5.3       | copied, loaded, saved                                            |
| `warn` | `TriangleAlert` | `amber` | `amber` | 8.6 / 5.5       | it works, but: slenderness, a hover margin, max Q near the limit |
| `bad`  | `OctagonAlert`  | `rust`  | `rust`  | 5.0 / 6.0       | it does not work: no solution, never reaches orbit               |

`amber` is also the focus ring and the range-input accent, the two places the
palette says "this is the live thing". It is not decoration.

### Accents

| Token    | Dark      | Light     | Text on `panel` | Job                                                 |
| -------- | --------- | --------- | --------------- | --------------------------------------------------- |
| `amber`  | `#F5A623` | `#9A5A00` | 8.6 / 5.5       | `warn`; focus; the range accent; a cut on the route |
| `mint`   | `#4FD1A5` | `#157A5A` | 9.2 / 5.3       | `good`; the payload fill                            |
| `rust`   | `#E2603F` | `#B23A1B` | 5.0 / 6.0       | `bad`                                               |
| `sky`    | `#4A9BE0` | `#1B64B3` | 5.9 / 6.0       | `info`; the fallback body hue                       |
| `violet` | `#A177DB` | `#6A3FB5` | 5.2 / 7.0       | the adapter and coupler fill; the plane-change chip |
| `moss`   | `#86B24A` | `#4E7A14` | 7.1 / 5.1       | reserved — unused today                             |
| `ice`    | `#6FD7E8` | `#0E7080` | 10.5 / 5.8      | reserved — unused today                             |

The destination's body hue (`BODY_HUE`, `hueFor`) is the one colour the page
takes from its data: the selected planet button, the solving pill's dot, the
booster fill. It is emphasis, never structure — nothing is laid out by it.

### Part kinds

The drawing and the parts list share one table, `KIND`, so a swatch in the list
is the fill in the elevation.

| Kind        | Dark         | Light     | Fill on `panel` | Note                                                                                                       |
| ----------- | ------------ | --------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `tank`      | `#5F7488`    | `#7A8FA4` | 3.6 / 3.3       |                                                                                                            |
| `engine`    | `#9FB0C4`    | `#4E6176` | 7.9 / 6.4       |                                                                                                            |
| `adapter`   | `violet`     | `violet`  | 5.2 / 7.0       | couplers too                                                                                               |
| `decoupler` | `dim`        | `dim`     | 4.9 / 5.6       |                                                                                                            |
| `booster`   | the body hue | the same  | —               | outlined by `edgeOf`, which lifts a dark hue on dark and darkens a light hue on light                      |
| `payload`   | `mint`       | `#2A9A72` | 9.2 / 3.5       |                                                                                                            |
| `shroud`    | `#3F5064`    | `#AEBBC8` | 2.1 / 2.0       | **deliberate exception** — a fairing sits under its outline and reads as a ghost; 3:1 would make it a part |
| `hardware`  | `muted`      | `muted`   | —               | list only; it is not drawn                                                                                 |

### The two-space trap

A bare `ShaderMaterial` draws the hex it is given; `setClearColor` converts it.
`panelClear(pal)` in `shaders.ts` exists so the panel behind the drawing is
the card's colour and not a third-as-bright version of it. The stylesheet sees
the palette as custom properties (`C.panel` is the string `var(--panel)`), and
the renderer cannot: every shader takes the resolved palette, `palette(theme)`,
and a theme change is a rebuild of the scene, not a re-render —
`.claude/rules/renderer.md`.

### Body hues on a light panel

`inkOn(h)` picks the ink for a filled planet button and is theme-independent —
the button is the hue, whatever is behind it. `edgeOf(h, theme)` is not: it
walks the hue toward the theme's paper — lifting in dark, shading in light —
until it clears 4.5:1 on `panel2`, and stops there. Most hues are untouched;
Minmus, Jool and Eeloo lift in dark, and Pol, Moho and Kerbin darken in light.
The number is checked rather than the hue guessed at.

### Choosing

The theme follows the operating system unless the reader says otherwise. The
control is a three-way `Choice` — _System · Dark · Light_ — at the top of
setup, and the choice is stored beside the roster. `system` sets no attribute,
so the `prefers-color-scheme` rule decides; the other two set `data-theme` on
the root and win over it. The `theme-color` meta follows whichever is in
force.

---

## 5. Space and shape

### Spacing

A 4 px scale: **2 · 4 · 8 · 12 · 16 · 24 · 32**. `2` is for the gap inside a
chip and between a figure and its unit; `32` is between sections. Today's
values run through every integer from 1 to 26; the mapping is nearest-on-scale,
rounding down inside a component and up between components. `60px` (the
solving bar's height, as the page's top padding) is a layout constant in `Z`'s
neighbour, not a spacing.

### Radius

Two: **`r-sm` 3** for chips, fields and cards; **`r-lg` 8** for sheets,
popovers and the full-screen overlay's rail. Dots are round, and a bar bled
to the page's edges — the set brief — has `none`. Today's `1` and `2` on
chips become `3`.

### Z

| Token     | Value | What                                                                                |
| --------- | ----- | ----------------------------------------------------------------------------------- |
| `brief`   | 10    | the set brief, sticky under the solving bar                                         |
| `jump`    | 20    | the phone's jump bar                                                                |
| `pill`    | 30    | the solving pill, sticky inside the veil                                            |
| `overlay` | 40    | the full-screen build view, portaled to `body`                                      |
| `solving` | 50    | the solving bar — above the overlay, so a rocket about to be replaced still says so |
| `sheet`   | 60    | the setup sheet and the paste sheet                                                 |
| `popover` | 70    | a disclosure's popover                                                              |

Today: 40 (pill), 45 (overlay), 50 (bar). The bar stays where it is because
`.claude/rules/ui.md` says why.

### Containers

The card is the only container: `panel` ground, `rule` border, `r-sm`,
`16` padding on the phone and `16 20` on desktop. A section is a card with a
heading. A callout is a card with a severity edge. Nothing nests a card in a
card; a raised thing inside one is `panel2`.

---

## 6. Components

The inventory, in `src/ui/components/primitives.tsx`. One per idiom. What each
is for and what it is not for.

**`Section`** — a card with a `heading`, an optional one-line summary, and an
optional fold. Folded, it shows the heading and the summary; open, the
children. The chevron is the fold's only control and the whole header is its
target. An optional `aside` sits at the header's right in both states,
beside the fold's button rather than inside it, so it may be a control: the
brief's Δv budget, the build section's tabs. Beside a summary or an aside
the heading holds its line and the rest wraps. Sections are `<section
aria-labelledby>`. Not for: grouping fields inside the brief (that is a
`Field` group with a `label`).

The brief is a `Section` with three rules of its own (#133). It opens as the
form and folds itself the first time a design solves; once the reader has
touched it — opened it, or changed anything — it stays wherever they put it
across every re-solve, until they say _Done_. Set, it is stuck to the top of
the visual viewport, bled to the page's edges under the header, so the
mission is one tap away from anywhere on the page. Its line is `briefLine` in
`format.ts`: _origin → destination · profile & trip · payload · objective_,
with the profile and trip left out when the destination is an orbit of the
origin, because there is no arrival to describe.

**`Toggle`** — a boolean. A chip with `aria-pressed`, whose label never changes:
_Return trip_ is on or off; it does not become _One way_. Not for: a choice
between two named things (that is a `Choice` of two).

**`Choice`** — one of several. A row of chips with `role="radiogroup"`, arrow
keys between them, the selected one inverted. Each chip may carry a one-sentence
`hint`, shown as a tooltip under the pointer where there is one; where there is
not, the same sentences go in a `Disclosure` beside the group's label, as the
objectives' do. Not for: more than five options (use a `Field` with a select) or
booleans.

**`IconButton`** — a `lucide` icon, an `aria-label`, and a tooltip that works
on touch (the label shows on long-press and in the sheet). A 44 px square on
the phone, 32 on desktop, the icon 20 px. Not for: an action that has no
established icon — that is a text button.

**`Disclosure`** — the _i_. An `Info` glyph beside a label or at the foot of a
section; a popover anchored to it on desktop, a bottom `Sheet` on the phone;
dismissed by tapping away or Escape. Its content is in the DOM whether open or
not, hidden, so the render sweep's text scan still reaches it. With a
`caption` — _How this was computed_, _About the numbers_ — the words are part
of the target; without one the glyph is an `IconButton` square, pulled into
the row by its wrapper's negative margin, which needs room beside it
(`.claude/rules/ui.md`). Not for: a warning (that is a `Callout`) or a
first-run explanation (that is copy).

**`Callout`** — a severity, its icon, a headline sentence, and optionally a
`Disclosure` for the rest, in the `more` slot, standing in a third column so
its target overflows into the callout's padding rather than the text. Sits at
the top of the section it is about. Not for:
confirming a click (that is the `IconButton` swapping to `Check` for a beat) or
a status (that is the solving pill).

**`Field`** — a `label`, a `figure` value that can be typed, a range input, and
a `Disclosure` for the hint. The typed value is a draft while focused
(`.claude/rules/ui.md`). Not for: anything without a numeric value.

**`Stat`** — a `label` over a `figure-lg` and its unit in `note`. The six under
the rocket. Not for: a figure in running text (that is a `figure` span).

**`Check`** — a native checkbox with its label wrapped round it, for a list
where several things can be on at once: the installed expansions, the parts
excluded from a tech node. The whole label is the target. Not for: a single
boolean standing alone (that is a `Toggle`) or one-of-several (a `Choice`).

**`Sheet`** — a panel that slides up from the bottom on the phone and in from
the right on desktop, with a scrim, focus trapped and returned, Escape to
close. Setup, paste, and every disclosure on the phone. Not for: anything the
reader needs to see the page behind.

Everything else on the page is composed of these. A component that needs an
idiom not on this list adds it here first.

---

## 7. Icons

`lucide-react`, already in the bundle. 16 px inside a chip, 20 px standing
alone, stroke width 1.75 throughout. Every icon-only control has an
`aria-label` and a touch-reachable tooltip; a `title` attribute is not either.

| Action                    | Icon                                                | Note                                                                               |
| ------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| copy                      | `Copy` → `Check`                                    | the check for 1.6 s, then back                                                     |
| load from clipboard       | `ClipboardPaste`                                    |                                                                                    |
| share a link              | `Share2`                                            |                                                                                    |
| setup                     | `Settings`                                          |                                                                                    |
| fold / unfold             | `ChevronRight`                                      | rotates 90° when open                                                              |
| close / cancel / clear    | `X`                                                 | with the count when clearing exclusions                                            |
| cut the route here        | `Scissors` → `ScissorsLineDashed`                   | `dim` when uncut; `amber`, with the cut line, when cut — lucide has no closed pair |
| isometric                 | `Box`                                               | a `Toggle`                                                                         |
| play / pause the staging  | `Play` / `Pause`                                    | in use today                                                                       |
| full screen / leave it    | `Maximize2` / `Minimize2`                           | in use today                                                                       |
| a disclosure              | `Info`                                              |                                                                                    |
| back to the top           | `ArrowUp`                                           | the jump bar                                                                       |
| return to Kerbin (origin) | `Undo2` + word                                      | it is a destination, not a verb — the word stays                                   |
| severity                  | `Info` `CircleCheck` `TriangleAlert` `OctagonAlert` | see Colour                                                                         |

Words stay where no icon is established: _Return trip_, _Gimbal_, _Solid
boosters_, _Parachutes_ (toggles), the stage count `auto 1 2 3 4 5`, the
objectives, the profiles, every planet. A checkbox stays a checkbox where there
is a list of them.

---

## 8. Motion

Two durations and three easings, all in `tokens.ts`:

| Token     | Value   | For                                                      |
| --------- | ------- | -------------------------------------------------------- |
| `quick`   | 120 ms  | a chip changing state, a chevron turning, a tooltip      |
| `settle`  | 400 ms  | a fold opening, a sheet sliding, the figures counting up |
| `STEP_MS` | 800 ms  | one staging step, stepped by hand (`build.tsx`)          |
| `PLAY_MS` | 1600 ms | one staging step, played (`build.tsx`)                   |

Easings: `smooth` (`t²(3−2t)`) for anything the camera does or a panel that
moves; `pushed` (ease-out) for a thing given one shove; `falls` (`t²`) for a
thing released. They are in `separation.ts` and are the physics, not the
styling — do not add a fourth for a chip.

What animates: state changes on controls, folds, sheets, the staging, and the
rocket's arrival after a solve. What does not: layout — nothing reflows with a
transition, and the solving veil's fast-in slow-out is the one exception,
because a solve that returns in 40 ms should not flash.

`prefers-reduced-motion: reduce` turns off every transition and the arrival,
and makes the staging step instant. The staging can still be played; it
cross-fades.

---

## 9. Accessibility bar

What every component clears before it is merged. The layout suite asserts the
measurable ones at both viewports and both themes.

- **Targets**: 44 × 44 on the phone, 24 × 24 on desktop, for anything that
  responds to a press. A chip grows; it does not get a bigger hit area.
- **Keyboard**: everything a click reaches, Tab reaches, in reading order.
  Escape closes the topmost thing that can close. Arrow keys move within a
  `Choice` and along the staging scrubber.
- **Focus**: the `amber` 2 px ring, offset 2, on every surface — including a
  filled planet button, where it needs a `panel` halo to be seen.
- **Contrast**: per the tables in Colour. `axe-core` with the contrast rule on
  is the check.
- **Not colour alone**: every severity has its icon; a cut has its scissors; a
  selected chip inverts, it does not just tint.
- **Not hover alone**: every tooltip has a touch path; nothing appears only on
  hover.
- **Names**: every `IconButton` has an `aria-label`; every `Section` is a
  landmark with a heading; the solving state is a live region; the canvases
  carry a text alternative naming the step and the figures beside them.
- **Motion**: see above.
- **Zoom**: numeric inputs are 16 px on the phone so iOS does not zoom on
  focus; the page never needs horizontal scroll at 320 px.

---

## 10. Voice

The application has a voice and it stays. Where it lives:

- **Craft names and subtitles** — `craftName` in `format.ts`. This is the joke
  and it is one line.
- **Section summaries** — plain figures, no adjectives.
- **Callout headlines** — one sentence, declarative: _This design never
  reaches orbit from Kerbin._ The advice is disclosed.
- **Disclosed text** — the long form, in the register it already has. A reader
  who opened it asked for it.

Where it does not: labels, which are nouns; buttons, which are verbs; errors,
which are facts. Nothing on the page by default is longer than a sentence
unless it is a table.

---

## Appendix: today's inventory

Measured on `main` at the start of the refresh, for the migration and for
step 2's budgets. See #127 for the method.

- Font sizes: 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 19,
  24, 34 — mapped above.
- Families set inline: `FONT` ×2, `'IBM Plex Mono'` ×2, `inherit` ×2,
  `monospace` ×3 — the last are the config textareas and become `figure`.
- Weights: 400, 600, 650, 700 → 400, 500, 600.
- Colour references: `dim` 43, `muted` 34, `rule` 25, `paper` 22, `amber` 19,
  `mint` 12, `rust` 10, `panel2` 9, `panel` 6, `ink` 6, `violet` 4, `sky` 4,
  `edge` 2. Literals outside `tokens.ts`: two `rgba(0,0,0,…)` scrims, which
  become a `scrim` token.
- Radii: 3 ×16, 1 ×3, 2 ×2, 8 ×2 (dots), `50%` ×1.
- Z: 40, 45, 50.
- Media queries: one, `prefers-reduced-motion`.
- `title=` attributes: 12; `aria-label`: 3. Since #135 there is no `title=`
  on anything but a link — `test/disclosure.test.tsx` holds that — and the
  solved default page is 663 visible words on the phone, from 1,119 at the
  end of step 7 and 1,755 on `main` before the refresh.
