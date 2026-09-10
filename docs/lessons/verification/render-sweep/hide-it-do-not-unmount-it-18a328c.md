# Hide It, Don't Unmount It

**Why it matters:** any interface that puts explanations one tap away, and any
test that scans the rendered text for bad values.

## The concept

There are two ways to make a paragraph appear on demand: mount it when opened,
or render it always and mark it `hidden`. The reader cannot tell them apart.
Everything else can. Text that is in the DOM while hidden is reachable by
find-in-page, by a screen reader that lists regions, and by any test that reads
`textContent` — so a scan for `NaN` or `undefined` covers every hidden
paragraph without a test having to know where each disclosure is or how to open
it. What the closed scan cannot see is a value composed _at_ opening, in a
handler or a lazily-run formatter; so the sweep opens each disclosure once and
scans again. The closed scan is the wide net; the open scan is the check that
opening changes nothing. Disclosures have to be discoverable generically for
that to work, and the accessibility contract provides it: a
`button[aria-controls][aria-expanded]` is one, whoever wrote it.

## In this codebase

`Disclosure` in `src/ui/components/primitives.tsx` renders its content as a
`role="region"` with `hidden={!open}` and an `aria-controls` from the button to
it; on the phone the open state is a `Sheet` instead. `test/disclosure.test.tsx`
walks every such button on the solved page, asserts its region is hidden and
holds more than five words. The render sweep in `test/render-sweep.test.tsx`
scans on mount, then opens every disclosure and scans again for
`NaN|Infinity|undefined|null`. The layout suite in a real browser opens each
one where it stands and asserts the box has an area — jsdom cannot tell a
popover that rendered from one that rendered off the page.

## What made it real

Visible words on the solved default page went from 1,119 to 663 on the phone
and 1,120 to 664 on the desktop, with no sentence rewritten — and the render
sweep's coverage of those words did not fall by a single one, because every
paragraph it read before it still reads, hidden. At least nine disclosures are
asserted present and closed on the page.

## Key takeaway

Render what is disclosed and hide it rather than mounting it on open — the text
stays where every scan can reach it, and one generic pass can open the lot to
check that opening adds nothing.
