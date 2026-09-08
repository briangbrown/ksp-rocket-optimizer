// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  act,
  render,
  cleanup,
  fireEvent,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { Info } from "lucide-react";
import {
  Choice,
  Disclosure,
  IconButton,
  Picker,
  Sheet,
  Toggle,
} from "../src/ui/components/primitives.jsx";
import { MOTION } from "../src/ui/tokens.js";

/* The idioms the guide promises, checked where the page does not yet use
   them. `Sheet` and `Disclosure` have no call site until the setup and the
   hints move into them (#135), so nothing in the render sweep opens one, and
   the focus and keyboard behaviour below is what the guide's accessibility
   bar rests on. jsdom has no viewport, so `matchMedia` is absent and every
   disclosure here takes the desktop path — the popover. */

afterEach(cleanup);

function Picks() {
  const [v, setV] = useState("b");
  return (
    <Choice
      label="Letter"
      value={v}
      onChange={setV}
      options={[
        { value: "a", label: "A" },
        { value: "b", label: "B" },
        { value: "c", label: "C" },
      ]}
    />
  );
}

describe("Choice", () => {
  it("is a radiogroup with one chip in the Tab order and arrows between them", () => {
    render(<Picks />);
    const group = screen.getByRole("radiogroup", { name: "Letter" });
    const chips = group.querySelectorAll("button");
    expect(chips).toHaveLength(3);
    expect([...chips].map((c) => c.tabIndex)).toEqual([-1, 0, -1]);
    expect(chips[1].getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(chips[1], { key: "ArrowRight" });
    expect(chips[2].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(chips[2]);
    /* Round the end. */
    fireEvent.keyDown(chips[2], { key: "ArrowRight" });
    expect(chips[0].getAttribute("aria-checked")).toBe("true");
  });
});

describe("Picker", () => {
  it("is a named select of its options that reports the one chosen", () => {
    const seen: Array<string> = [];
    render(
      <Picker
        label="View 1"
        options={[
          { value: "side", label: "Front" },
          { value: "plan", label: "Plan" },
        ]}
        value="side"
        onChange={(v) => seen.push(v)}
      />,
    );
    const sel = screen.getByLabelText("View 1") as HTMLSelectElement;
    expect(sel.tagName).toBe("SELECT");
    expect([...sel.options].map((o) => o.textContent)).toEqual([
      "Front",
      "Plan",
    ]);
    expect(sel.value).toBe("side");
    fireEvent.change(sel, { target: { value: "plan" } });
    expect(seen).toEqual(["plan"]);
  });

  it("lets focus go after a choice by pointer, and keeps it after one by key", () => {
    render(
      <Picker
        label="View 2"
        options={[
          { value: "side", label: "Front" },
          { value: "plan", label: "Plan" },
        ]}
        value="side"
        onChange={() => {}}
      />,
    );
    const sel = screen.getByLabelText("View 2") as HTMLSelectElement;
    sel.focus();
    fireEvent.keyDown(sel, { key: "ArrowDown" });
    fireEvent.change(sel, { target: { value: "plan" } });
    expect(document.activeElement).toBe(sel);
    fireEvent.pointerDown(sel);
    fireEvent.change(sel, { target: { value: "side" } });
    expect(document.activeElement).not.toBe(sel);
  });
});

describe("Toggle", () => {
  it("keeps its label whichever way it is", () => {
    function Bool() {
      const [on, setOn] = useState(false);
      return <Toggle label="Return trip" on={on} onChange={setOn} />;
    }
    render(<Bool />);
    const b = screen.getByRole("button", { name: "Return trip" });
    expect(b.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(b);
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(b.textContent).toBe("Return trip");
  });
});

describe("Sheet", () => {
  function Host() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <Sheet open={open} onClose={() => setOpen(false)} title="Setup">
          <button>Inside</button>
          <button>Last</button>
        </Sheet>
      </>
    );
  }

  it("is a dialog that takes focus, holds it, and gives it back", () => {
    render(<Host />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Setup" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe("hidden");

    /* Tab wraps inside the sheet rather than leaving it. */
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close" }),
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });

  it("closes on the scrim and not on the panel", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("IconButton", () => {
  /* A finger has no hover to leave, so the tooltip a tap shows is on a
     clock: up at once, fading after `linger`, gone a `settle` later, and
     cleared the moment focus goes — the sheet a tap opened has the reader.
     The stylesheet draws it off `data-tip`; this holds the clock. #184 */
  it("shows a tapped tooltip for a beat, then lets it go", () => {
    vi.useFakeTimers();
    try {
      render(<IconButton icon={Info} label="About" onClick={() => {}} />);
      const b = screen.getByRole("button", { name: "About" });
      expect(b.dataset.tip).toBeUndefined();
      fireEvent.pointerUp(b, { pointerType: "mouse" });
      expect(
        b.dataset.tip,
        "a mouse click showed the tap tooltip",
      ).toBeUndefined();
      fireEvent.pointerUp(b, { pointerType: "touch" });
      expect(b.dataset.tip).toBe("1");
      act(() => vi.advanceTimersByTime(MOTION.linger));
      expect(b.dataset.tip, "not fading after linger").toBe("2");
      act(() => vi.advanceTimersByTime(MOTION.settle));
      expect(b.dataset.tip, "still up after the fade").toBeUndefined();
      fireEvent.pointerUp(b, { pointerType: "touch" });
      expect(b.dataset.tip).toBe("1");
      fireEvent.blur(b);
      expect(b.dataset.tip, "held through a blur").toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Disclosure", () => {
  it("keeps its text in the DOM closed, shows it open, and closes on Escape", () => {
    render(
      <Disclosure label="What margin means">
        Reserve over the map value.
      </Disclosure>,
    );
    const b = screen.getByRole("button", { name: "What margin means" });
    const region = document.getElementById(b.getAttribute("aria-controls")!)!;
    expect(region.textContent).toContain("Reserve over the map value.");
    expect(region.hidden).toBe(true);
    fireEvent.click(b);
    expect(region.hidden).toBe(false);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(region.hidden).toBe(true);
  });
});
