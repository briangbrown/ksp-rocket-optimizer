# React effects, refs, and drafts

**Syllabus:** [L7](../../README.md#part-3--language-and-platform)

**Why it matters:** These three facts matter because most of the rules in
the interface's rules file are one of them in a particular place: an effect
runs after the render it belongs to, so anything read inside it sees the
page as it is after the commit and anything computed for that same render
cannot come from it; a ref installed by an effect keeps pointing at the
element that was there, so when the element is unmounted and rebuilt the ref
watches a ghost that reports a zero box; and a text field that renders its
committed value fights the reader over "1." on the way to "1.5", so it must
render a draft instead, which means a value on screen is not evidence that
a value reached state; each was learned by a bug that a green suite did not
catch.

**Before this:** nothing.

## A worked case

Type a payload into the brief's field. What the input shows and what the
application knows part company for as long as the field has focus:

| Moment           | The input shows | Values committed to state |
| ---------------- | --------------- | ------------------------- |
| Before           | `2.5`           |                           |
| Focus, type `1.` | `1.`            | none                      |
| Blur             | `1`             | `[1]`                     |

Between the second and third rows the field is showing something that is not
a number and that state has never seen. That is the draft, and it is the
only way a numeric field can accept `1.` on the way to `1.5`: a field that
rendered its committed value would parse `1.` to `1`, write `1` back into
the input, and the reader could never type the decimal point. The
consequence for anyone testing the page is in the rules file: "a typed
number therefore looks accepted whether or not it ever reached state, so
'the value updated' is not evidence that anything did — the slider moving
is, because the range input renders the committed value." Two fixes were
built on the wrong reading of that before the real cause turned up.

Because the component is React, the snippet is a test file with a jsdom
environment. Save it as `test/draft-try.test.tsx` and run
`npx vitest run test/draft-try.test.tsx --reporter=verbose`:

```tsx
// @vitest-environment jsdom
import { it } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { Field } from "../src/ui/components/primitives.js";
it("the field shows its draft, and commits on blur", () => {
  const seen: number[] = [];
  function Harness() {
    const [v, setV] = useState(2.5);
    return (
      <Field
        label="Payload"
        value={v}
        min={0}
        max={20}
        step={0.1}
        onChange={(x) => {
          seen.push(x);
          setV(x);
        }}
      />
    );
  }
  const { container } = render(<Harness />);
  const input = container.querySelector("input.field-in") as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "1." } });
  console.log(
    "while typing:",
    JSON.stringify(input.value),
    "committed so far:",
    JSON.stringify(seen),
  ); // "1." []
  fireEvent.blur(input);
  console.log(
    "after blur:",
    JSON.stringify(input.value),
    "committed:",
    JSON.stringify(seen),
  ); // "1" [1]
});
```

## The idea

A **render** is React computing what the page should show: a component
function runs, returns a description of elements, and React reconciles it
against what is on the page and commits the differences. A render is pure in
the sense that matters here: it may read props and state, and it may not
touch the page, because the page it would touch is the one before the
commit.

An **effect** is code React runs after a render, for things outside React:
installing a listener, measuring an element, starting a solve, moving focus.
Two consequences are the source of half the rules. First, an effect sees the
page after the commit, so it can read `document.activeElement` or an
element's box; but anything the same render needs to show cannot come from
its effect, because the effect has not run yet when the render's output is
computed. The build view's `data-motion` attribute is computed in render
rather than read from state for exactly that reason: on the render that
shows a new rocket, the effect that starts the arrival has not run, and a
test waiting on the attribute would otherwise see the wrong state for one
frame. Second, an effect re-runs when any value in its dependency list
changes, and a function is a new value every render unless it is stabilised.
The sheet's `onClose` is a dependency of the effect that installs its
keyboard handling and moves focus into it; passed as an inline arrow, the
effect re-ran on every render and re-focused the panel on every keystroke
inside it. `useCallback` is how a function is made the same value across
renders.

A **ref** is a handle to a real element, or a value that survives renders
without causing one. The element kind is where the second rule comes from.
A ref object filled in by React, `ref={someRef}`, and then read inside an
effect with an empty dependency list, is read once: the effect observes the
element that was there on the first render and goes on observing it. The
build view's drawing row is unmounted and rebuilt inside a portal every time
full screen is toggled, so the observed element left the page, its box
reads as zero, and both panels came out one pixel. A callback ref, a
function passed as `ref`, is called with the new element when one mounts and
with `null` when it leaves, which is the shape that case needs: disconnect
from the old, observe the new. The desktop's sticky column measures its
height the same way, because the column is only in the tree on a wide
screen. The value kind of ref is for state that should not be in the
dependency arrays: whether the reader has touched the brief is a ref, set by
any control on it and read by the solve effect, because putting it in state
would make an effect about the mission depend on a fact about the form.

```
   render (pure: props + state → elements)  ──commit──►  effect (after: may read and touch the page)
        │                                                     │
        │  what this render shows must be computed HERE       │  what is measured or installed happens HERE
        │  (data-motion for the arrival's first frame)        │  (useTrap records document.activeElement)
        ▼                                                     ▼
   ref={obj}  filled at commit; an effect with [] reads it once and keeps the old element
   ref={fn}   called with each new element and with null on the way out — the shape for an element that moves
   useRef(v)  a value across renders that triggers none — "has the reader touched the brief"
```

A **draft** is the text a field shows while it is being typed, before it is
a value. A controlled input in React shows whatever it is given on every
render; give it the committed number and every keystroke is parsed,
normalised and written back, so `1.` becomes `1` under the reader's finger.
The field therefore holds a draft string while it has focus, shows that,
and commits on blur or Enter; while unfocused the draft is null and the
input shows the committed value again. The cost is the one in the table:
what is on screen is not what is in state until the commit, and every test
of the field has to know it. The project's test helper knows three things
about that: React ignores a plain `.value =` assignment, so the native
setter is needed; the draft commits on blur, not on input; and React's
`onBlur` is delegated from `focusout`, which bubbles, not from `blur`, which
does not, so a dispatched `blur` never reaches the handler and the draft is
silently dropped.

## In this codebase

`Field` in [`src/ui/components/primitives.tsx`](../../../../src/ui/components/primitives.tsx)
is the draft:

```tsx
/* Null while the field is not being edited, which is what makes the input
   render the committed value rather than a draft of it. */
const [draft, setDraft] = useState<string | null>(null);
const commit = (raw: string) => {
  const v = parseFloat(raw);
  if (isFinite(v)) onChange(Math.min(cap, Math.max(min, v)));
  setDraft(null);
};
// ...
<input
  value={draft ?? value}
  onChange={(e) => setDraft(e.target.value)}
  onFocus={(e) => {
    setDraft(String(value));
    e.target.select();
  }}
  onBlur={(e) => commit(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      commit(e.currentTarget.value);
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      setDraft(null);
      e.currentTarget.blur();
    }
  }}
/>;
```

`useTrap` in the same file is the effect that reads the page after the
commit: it records `document.activeElement` to return focus to on close,
and takes a fourth argument, `back`, for the case where the control that
opened the trap has unmounted by the time the effect runs and there is
nothing to record; `onClose` is in its dependency list and so has to be
stable. `Choice` uses a callback ref per chip, `ref={(el) => { refs.current[i] = el; }}`,
to keep the array of elements current as chips come and go. `useStickyTop`
in [`src/ui/app.tsx`](../../../../src/ui/app.tsx) is the callback ref that
observes an element that moves: it disconnects its `ResizeObserver` from the
old element and attaches to the new on every call. The rules that these
lines are the fixes for are in [`.claude/rules/ui.md`](../../../../.claude/rules/ui.md):
_A ref that an effect installs stops working when the element moves_,
_`Sheet`'s `onClose` is an effect dependency_, _A text field renders its
draft, not its value_, _The brief folds itself exactly once_, and _The
build view names its motion_.

## What made it real

Each rule has its bug. The one-pixel panels: an effect with an empty
dependency list went on observing an element that had left the page through
a portal toggle, and the zero box it reported sized both drawing panels to
one pixel. The re-focusing sheet: an inline `onClose` re-ran the trap's
effect on every render and put focus back on the panel on every keystroke
typed inside it. The two wrong fixes: a payload typed into the field looked
accepted and was taken as evidence that state had updated, when the draft
was showing and state had not moved. The gap frame: the phone's layout
screenshot was taken between one separation landing and the next starting,
a render with nothing in flight, and showed step 2 of a walk to the pad
until `data-motion` was computed in render and held through the gap.

[`test/resolve-wiring.test.tsx`](../../../../test/resolve-wiring.test.tsx)
carries the draft's lesson in its `typeInto` helper, whose comment names
the three things that have to be right, and the snippet above reproduces
the table: `"1."` shown with nothing committed, then `"1"` and `[1]` after
the blur. The trap's return-focus case is held in the rules under _A control
that unmounts as it opens a trap has to say where focus goes back_, and the
layout suite walks every focus stop in a real browser, which is where an
effect that fought the reader for focus would show.

## Where it breaks

- **Reading in render what only an effect can know.** The element's box,
  the focused element, whether the arrival has started: none exists until
  after the commit. Compute in render what the render must show; measure in
  the effect.
- **A ref object read by an effect with no dependencies.** It watches the
  first element forever. When the element can be unmounted and rebuilt, a
  callback ref is the only shape that follows it.
- **An unstable function in a dependency list.** A new arrow every render
  re-runs the effect every render; the trap re-focused on every keystroke.
  `useCallback`, or move the function out of the list.
- **Taking the field's text as the state's value.** The draft is a string
  the reader is still typing. The slider shows the committed value; the
  field does not, until blur or Enter.
- **Dispatching `blur` to commit a draft in a test.** React listens for
  `focusout`, which bubbles; `blur` does not, and the handler never runs.
  The helper dispatches what React listens for, and sets the value through
  the native setter React does not ignore.

## Try it

Run the test file above and read the two lines. Then change the
`fireEvent.blur(input)` to `input.dispatchEvent(new Event("blur"))`: the
second line now shows the draft still `"1."` and nothing committed, which is
the `focusout` fact the helper's comment records. Then open the
application, type `1.` into the payload field without leaving it, and watch
the slider: it has not moved, because the field is showing its draft and
state has not changed.

## Check yourself

<details><summary>Why is the build view's `data-motion` computed during render rather than read from state set in an effect?</summary>

Because on the render that shows a new rocket, the effect that starts the
arrival has not run yet; state set there would not exist until the next
render. A test waiting on the attribute would see a frame with the wrong
value, and the phone's screenshot did. What a render must show has to be
computed in that render.

</details>

<details><summary>Why did the drawing panels come out one pixel wide after full screen was toggled?</summary>

Because an effect with an empty dependency list installed a
`ResizeObserver` on the element the ref held at first render, and full
screen unmounts and rebuilds that element inside a portal. The observer went
on watching the element that had left, which reports a zero box. A callback
ref is called with the new element and with null for the old, and can move
the observer.

</details>

<details><summary>A test types `1.5` into the payload field and reads `1.5` back from the input. Has the payload changed?</summary>

Not necessarily. The field shows its draft while focused, so the input
reads back whatever was typed whether or not it was committed. The commit
happens on blur or Enter, and the evidence that state moved is the slider,
which renders the committed value, or the design re-solving.

</details>

## Further reading

- The React documentation, "Synchronizing with Effects" and "You Might Not
  Need an Effect", for what belongs in render and what after it.
- The React documentation, "Manipulating the DOM with Refs", for ref
  objects, callback refs and when each is called.
- The React documentation on controlled inputs, for why a controlled field
  shows exactly what it is given on every render.

## Key takeaway

A render computes what the page shows and an effect runs after it, so
measure and install in effects and never read there what the same render
must display; a ref object read once by an effect keeps the element that
was there, so an element that moves needs a callback ref; and a numeric
field renders a draft while it has focus, so what it shows is not what state
holds until the blur, which a test must know and the slider will tell.

_As of 29950f8._
