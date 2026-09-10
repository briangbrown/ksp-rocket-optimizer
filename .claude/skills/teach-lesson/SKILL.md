---
name: teach-lesson
description: Write a short teaching lesson from an insight worked out while doing a task, saved under docs/lessons and tied to the commit it came from. Use after finishing a non-trivial fix, feature, refactor or investigation, or when the user asks for a lesson, a write-up, or to be taught something about work just done.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Teach a lesson

Take one thing you had to work out, and teach it. Not a summary of what you
did — an explanation of the idea, so a reader who was not here understands it
and could apply it somewhere else.

## 1. Decide whether there is a lesson

There is one when the work turned on something a competent reader would not
already know:

- a piece of orbital mechanics, atmosphere or ascent physics the fix depended on
- why the solver reaches a design the obvious approach does not
- a three.js, GLSL or WebGL behaviour that decided how the drawing had to work
- a React, layout or design-system pattern that was not the first thing tried
- an architectural line — the `planMission` seam, the worker boundary, the two
  part-data tables — and what it buys
- a measurement that overturned a plausible assumption

**Skip it** for mechanical work: renames, formatting, dependency bumps,
copy edits, or a fix whose whole content is "there was a typo". Skip it also
when the insight is only "this repository happens to do X" with nothing
transferable behind it. A thin lesson costs more than no lesson.

## 2. Route it — a lesson is not the only place learning goes

This repository already has two homes for what you learn, and a lesson is the
third. Read `CLAUDE.md` § _Recording what you learn_ before writing, and put
it where it belongs:

| What you have                 | Where it goes                                              |
| ----------------------------- | ---------------------------------------------------------- |
| A trap that will bite again   | the rules file for the area, `.claude/rules/<area>.md`     |
| A trap a check could catch    | **write the check.** A rule a test enforces needs no prose |
| A concept worth understanding | a lesson — this skill                                      |
| Work still outstanding        | a filed issue, not prose                                   |

They are not exclusive, and the best insights earn more than one. The
excess-velocity clamp in #223 took all three: a rule so it cannot come back, a
test that pins every planetary window to six decimals, and a lesson explaining
why a negative characteristic energy is not an error to floor at zero.

The difference is the audience. **Rules are for the agent** and load when
someone opens that part of the code; they are terse, and they exist to stop a
repeat. **Lessons are for a person**, they are read once, and they exist to
teach. Never write a lesson in place of a rule — you will lose the guard.

## 3. Write it

Under a screen. Prefer cutting to compressing.

```markdown
# <Title — the idea, not the ticket>

**Why it matters:** one sentence on when this knowledge applies.

## The concept

Two to four sentences. The idea itself, stated so it holds outside this
repository.

## In this codebase

Where it appeared, named: the file, the function, the issue number. A short
snippet only where the code carries the point better than prose.

## What made it real

The measurement. The number that showed the old answer wrong and the new one
right — a Δv, an unchanged snapshot, a frame time, a part count, a page height.
If nothing was measured, say what was reasoned and why it holds.

## Key takeaway

One sentence worth remembering on its own.
```

`reference.md` in this directory has the category list, a worked example, and
the failure modes to avoid. Read it if you are unsure where a lesson belongs or
what one should feel like.

## 4. Save it

```bash
git rev-parse --short HEAD
```

```
docs/lessons/<category>/<topic>/<name>-<short-hash>.md
```

- **category** — `physics`, `solver`, `renderer`, `ui`, `architecture`,
  `verification`, `part-data`, `typescript`
- **topic** — the subject within it: `patched-conics`, `tank-packing`,
  `layout-budgets`, `the-seam`
- **name** — kebab-case, the idea: `energy-not-excess-velocity`
- **short-hash** — the commit the lesson is about, which is `HEAD` once the
  work is committed. Write the lesson after committing, not before, or the
  hash points at the wrong thing.

Reuse an existing category and topic where one fits. A new topic is fine; a new
category should be rare.

## 5. Say the takeaway in the conversation

Quote the takeaway line inline when you report back, with the path. The reader
should get the point without opening the file, and know where it went.

## Checklist

- [ ] The insight is transferable, not just a note about this repository
- [ ] Anything that could bite again is in `.claude/rules/`, or is a test
- [ ] The lesson explains an idea rather than narrating the task
- [ ] _What made it real_ carries a number, or says plainly that it does not
- [ ] The path's category and topic already existed, or genuinely needed to
- [ ] The hash is the commit the work landed in
- [ ] The takeaway is quoted in the conversation with the path
