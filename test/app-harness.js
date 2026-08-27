import { act } from "react";

/* Driving the app in jsdom.

   Shared because three suites need it and a fourth copy of `settle` is how the
   two `fitStructure` callers drifted apart — see "Where the bodies are buried"
   in docs/DEVELOPMENT.md. */

/* The veil is always mounted; `busy` only changes opacity and toggles the pulse
   animation on the dot. The animation is the honest "still solving" signal,
   because opacity is transitioned and lags behind the state. */
export const solving = () => !!document.querySelector('[style*="pulse"]');

export const byText = (label) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === label,
  );

export const allByText = (label) =>
  [...document.querySelectorAll("button")].filter(
    (b) => b.textContent.trim() === label,
  );

export async function click(target) {
  const el = typeof target === "string" ? byText(target) : target;
  if (!el) throw new Error(`no button labelled "${target}"`);
  await act(async () => {
    el.click();
  });
}

/* The solve effect debounces by 120 ms before it starts, so checking
   immediately would read the previous design as though it were the new one.
   Wait past the debounce first, then for the veil to clear. */
export async function settle(timeoutMs = 120_000) {
  const started = Date.now();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
  while (solving()) {
    if (Date.now() - started > timeoutMs)
      throw new Error("solve did not settle");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
  }
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

/* Stat renders <div class="eyebrow">label</div> followed by the value div,
   whose trailing span holds the unit. */
export function stat(label) {
  for (const el of document.querySelectorAll(".eyebrow")) {
    if (el.textContent.trim() !== label) continue;
    const value = el.nextElementSibling;
    if (!value) return null;
    const unit = value.querySelector("span");
    const text = value.textContent;
    return unit
      ? text.slice(0, text.length - unit.textContent.length).trim()
      : text.trim();
  }
  return null;
}

/* A fingerprint of the solved design, for asserting that something changed
   without pinning what it changed to.

   Only values the solver produces. An earlier version also hashed the parts
   table, which made it useless for exactly the case it was written for:
   changing the payload alters text the table merely echoes back, so the
   fingerprint moved whether or not a re-solve had happened, and removing
   `payload` from the effect's dependency array still passed.

   Height and aspect are excluded for the same reason, and it is subtler:
   `geom` is a useMemo over [stages, payload], so the stack geometry recomputes
   from the payload directly. Those two move when the payload changes whether or
   not the solver ran, which again passed a test whose whole point was catching
   the case where it had not.

   What is left is four values that can only come from a solve. Fewer than
   before, but two designs sharing all of mass, cost, part count and stage count
   are near enough the same design. */
export function design() {
  return [
    stat("Liftoff mass"),
    stat("Stages"),
    stat("Cost"),
    stat("Parts"),
  ].join("~");
}
