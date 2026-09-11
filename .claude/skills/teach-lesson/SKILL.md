---
name: teach-lesson
description: Write a lesson under docs/lessons — a moment lesson right after finishing a non-trivial fix, feature, refactor or investigation, or a concept lesson from a row of the syllabus in docs/lessons/README.md. Use when work just done turned on an idea worth teaching, when the user asks for a lesson, a write-up or to be taught something, or when the user asks for a syllabus row to be written.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Teach a lesson

Explain an idea so that a person who was not here understands it and could
apply it somewhere else. Never a summary of what was done.

There are two kinds, for two readers. Decide which before writing anything.

| Kind        | Reader                             | Written from           | Length              | Filed                                                 |
| ----------- | ---------------------------------- | ---------------------- | ------------------- | ----------------------------------------------------- |
| **Moment**  | the person who just did the work   | the task just finished | under a screen      | `<category>/<topic>/<name>-<hash>.md`, never revised  |
| **Concept** | a person who has not done the work | a row of the syllabus  | as long as it needs | `<category>/<topic>/<name>.md`, revised as code moves |

A moment lesson can be short because the reader supplies the concrete case:
they just lived it. A concept lesson has no such reader and must supply the
concrete case itself, first, before anything abstract. Writing a moment lesson
for a reader who did not have the moment produces an aphorism about a bug, and
that is the failure this skill was reworked to stop.

## The reader, and the rule on terms

Both kinds are written for a competent programmer who is not a physicist, a
graphics programmer or a Kerbal player. Any term such a reader would not already
know is defined in the sentence where it first appears. Ordinary programming
vocabulary — cache, thread, JSON, module — is not.

The syllabus, `docs/lessons/README.md`, has a _Defines_ column on every row
naming the terms that lesson owns. A concept lesson defines exactly the terms in
its row's cell, and may use a term from an earlier row by linking to the lesson
that owns it. A moment lesson defines whatever it uses that the syllabus does not
already own; if a concept lesson owns the term, link to it instead. Words this
repository uses in a plain-English sense — cut, group, core, column, the brief,
the still — are terms.

## Rules for both kinds

- **The title names the concept.** A reader scanning a list of titles should
  know what each one is about. "The gravity turn", "Lambert's problem",
  "Discriminated unions and narrowing". Not an aphorism, however apt: "A
  Constant Cannot Look Wrong" tells the reader nothing until they have read it.
- **_Why it matters_ is a complete sentence with a because.** It says what the
  application cannot do without the idea, not where the idea applies. "The
  gravity turn matters because without it every ascent the solver prices is a
  vertical climb, and a vertical climb costs a third more Δv than the rocket
  can carry." Not: "Any time an ascent is simulated." The reader should finish
  the sentence knowing why to spend the next ten minutes.
- **Numbers, not adjectives.** Every claim that can carry a measurement does — a
  Δv, a count, a page height, an unchanged snapshot. Where nothing was measured,
  say so and give the reasoning.
- **Plain voice.** Explain; do not perform. The repository's prose is terse and
  allusive by design, and that is the wrong register for teaching. Short
  sentences, one idea each, the ordinary word.
- **No narration of the task.** Not what was tried, in what order, or which
  files were touched. The idea, where it lives, what proved it.
- **Code only where it carries the point** better than prose can, and short.
- **Prettier.** Run `npx prettier --write` on the file. CI checks `docs/`.

## Moment lessons

### 1. Decide whether there is one

There is one when the work turned on something a competent reader would not
already know: a piece of physics, why the solver reaches a design the obvious
approach does not, a three.js or GLSL behaviour, a React or layout pattern that
was not the first thing tried, an architectural line and what it buys, a
measurement that overturned a plausible assumption.

**Skip it** for mechanical work — renames, formatting, dependency bumps, copy
edits, a fix whose whole content is "there was a typo" — and when the insight
is only "this repository happens to do X". A thin lesson costs more than none.

### 2. Route it first

A lesson is the third home for what you learn, not the first. Read `CLAUDE.md`
§ _Recording what you learn_.

| What you have                 | Where it goes                                              |
| ----------------------------- | ---------------------------------------------------------- |
| A trap that will bite again   | the rules file for the area, `.claude/rules/<area>.md`     |
| A trap a check could catch    | **write the check.** A rule a test enforces needs no prose |
| A concept worth understanding | a lesson — this skill                                      |
| Work still outstanding        | a filed issue, not prose                                   |

They are not exclusive. The excess-velocity clamp (#223) took a rule, a test and
a lesson. But a lesson never stands in for a rule, or the guard is lost.

### 3. Write it

Under a screen. Prefer cutting to compressing.

```markdown
# <Title — the concept>

**Why it matters:** <one complete sentence: the application cannot ... because ...>

**Concept:** <link to the syllabus row or concept lesson this illustrates, if one exists>

## The idea

Two to four sentences. Stated so it holds outside this repository. Every term
the reader might not know defined as it appears.

## In this codebase

Where it appeared: the file, the function, the issue number. A short snippet
only where the code carries the point.

## What made it real

The measurement. The number that showed the old answer wrong and the new one
right. If nothing was measured, say what was reasoned and why it holds.

## Key takeaway

One sentence worth remembering on its own.
```

### 4. Save it

Commit the work first, so the hash names the right change. Then:

```bash
git rev-parse --short HEAD
```

```
docs/lessons/<category>/<topic>/<name>-<short-hash>.md
```

Category from `reference.md`; topic reused where one fits; name kebab-case, the
concept. Say the takeaway inline when you report back, with the path.

## Concept lessons

### 1. Take the row

A concept lesson is written from one row of `docs/lessons/README.md` and only
on request. The row supplies the title, the _because_, the prerequisites, the
terms to define and the code to point at. Read the rows it _Needs_ — and their
lessons, if written — before starting, so the reader who has followed the order
is not told twice.

Read `reference.md` § _The concept lesson_ before the first one: it has the
worked example this template was calibrated on and the reasons the sections are
in this order.

### 2. Write it

Concrete first, then the idea, then the code. As long as it needs, usually two
or three screens; cut anything that does not teach.

```markdown
# <Title — the syllabus row's>

**Why it matters:** <the row's because, as one complete sentence>

**Before this:** <links to the lessons the row Needs, or "nothing">

## A worked case

One concrete situation with real Kerbal numbers — a named engine, Kerbin's
gravity, a 70 km atmosphere — worked through by hand. Small enough to redo with
a calculator or a five-line node snippet, and the snippet given where it helps.
The reader meets the idea here, in a case, before it is named.

## The idea

The general concept, from first principles: the equation and where it comes
from, the intuition for its shape, the derivation where a derivation is what
makes it stick. A diagram wherever geometry is involved — a mermaid block or a
small ASCII figure. Every term in the row's _Defines_ cell defined in the
sentence where it first appears.

## In this codebase

Which function is which term of the idea. An annotated snippet. Where the code
departs from the textbook, why.

## What made it real

The measurement that settled it here: from the flown-in-game table, a snapshot
that did or did not move, a profile, an issue's numbers.

## Where it breaks

The trap, explained rather than only guarded, with a pointer to the rule in
`.claude/rules/` or the test that holds it.

## Try it

One concrete action in the repository: run a named test, change a constant and
watch which number moves, plot something.

## Check yourself

Two or three questions answered from memory, each with its answer folded:

<details><summary>Q1 ...</summary>

...

</details>

## Further reading

One to three references: a textbook chapter, a specification section, a paper.

## Key takeaway

One sentence.

_As of <short hash of main when the lesson was last checked against the code>._
```

### 3. Save it, and link it from the syllabus

```
docs/lessons/<category>/<topic>/<name>.md
```

No hash in the filename; the _As of_ line carries it. Category from the row's
area; topic reused where one fits. Then make the row's title in
`docs/lessons/README.md` a link to the file, so the syllabus shows what is
written.

### 4. One at a time

Write one concept lesson, report its path and takeaway, and stop for review
before the next. The template survives on the strength of the lessons the user
has read and accepted, not on how many exist.

## Checklist

Both kinds:

- [ ] The title names the concept, in plain words
- [ ] _Why it matters_ is a complete sentence and says what the application cannot do without the idea
- [ ] Every term the reader might not know is defined at first use, or linked to the lesson that owns it
- [ ] _What made it real_ carries a number, or says plainly that it does not
- [ ] Nothing narrates the task
- [ ] Prettier has run

Moment lessons:

- [ ] Anything that could bite again is in `.claude/rules/`, or is a test
- [ ] The hash is the commit the work landed in
- [ ] The takeaway is quoted in the conversation with the path

Concept lessons:

- [ ] The worked case comes first and can be reproduced by the reader
- [ ] The terms defined are exactly the row's _Defines_ cell
- [ ] The prerequisites are linked and not re-taught
- [ ] There is a diagram wherever there is geometry
- [ ] _Check yourself_ has questions with folded answers, and _Try it_ has one action
- [ ] The syllabus row now links to the file
- [ ] The user has reviewed it before the next one is started
