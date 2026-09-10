# A Select Keeps `:focus-visible` After a Tap

**Why it matters:** whenever a native `<select>` is dressed as a button or a
label and shows a focus ring after a pointer or a finger has chosen from it,
where a button would not.

## The concept

`:focus-visible` is a heuristic, not a state. A focused button matches it only
when focus arrived from the keyboard, on the reasoning that a click has already
shown the user what they are pointing at. An element that accepts keyboard input
while it has focus — a text field, a `<select>` — matches it however focus
arrived, because a keyboard could act on it next. So a select in a chip's
clothes gets the ring after every tap, and no stylesheet can take it away
without taking it from the keyboard user too: the same selector matches both.
What can change is whether the select stays focused. Let a choice made by
pointer or touch release focus once it is made, and keep it for a choice made by
key. The modality is the last event before the change, not a property of the
element.

## In this codebase

`Picker` in `src/ui/components/primitives.tsx` is a native select in the `label`
role's clothes, the phone's view chooser over each drawing. It records
`byPointer` on `pointerdown`, clears it on `keydown`, and in `onChange` blurs
the select when the last event was a pointer. `test/primitives.test.tsx` holds
both modalities: after `ArrowDown` and a change the select is still
`document.activeElement`; after `pointerDown` and a change it is not.

## What made it real

Nothing was measured. The ring stayed round the picker after a tap chose a view
in headless Chrome at the phone's width, and was gone once the change blurred
it. The reasoning is the platform's — a focused select is keyboard-operable, so
the ring is correct for as long as focus remains — and the test pins the two
modalities so neither regresses into the other.

## Key takeaway

You cannot style `:focus-visible` off a select without taking it from the
keyboard user too; decide instead whether a pointer-made choice should leave the
element focused at all.
