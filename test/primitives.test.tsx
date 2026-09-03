// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import {
  Choice,
  Disclosure,
  Sheet,
  Toggle,
} from "../src/ui/components/primitives.jsx";

/* The idioms the guide promises, checked where the page does not yet use
   them. `Sheet` and `Disclosure` have no call site until the setup and the
   hints move into them (#135), so nothing in the render sweep opens one, and
   the focus and keyboard behaviour below is what the guide's accessibility
   bar rests on. jsdom has no viewport, so `matchMedia` is absent and every
   disclosure here takes the desktop path — the popover. */

afterEach(cleanup);

function Picker() {
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
    render(<Picker />);
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
