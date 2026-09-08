// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import EngineGallery from "../src/ui/components/gallery.jsx";
import { DATA } from "../src/core/catalogue.js";

/* The engine gallery, #85: a page for looking at every engine's drawn shape.
   jsdom draws none of it, so what is held is that it mounts, names every
   engine in the catalogue once, and says why there is no drawing. */

afterEach(cleanup);

describe("the engine gallery", () => {
  it("names every engine once, and says when it cannot draw", () => {
    const { container } = render(<EngineGallery />);
    const labels = [...container.querySelectorAll(".note")].filter((el) =>
      el.querySelector(".figure"),
    );
    expect(labels.length).toBe(DATA.engines.length);
    const numbers = labels.map((l) => l.querySelector(".figure")?.textContent);
    expect(numbers).toEqual(labels.map((_, i) => String(i + 1)));
    expect(container.textContent).toMatch(/no WebGL/);
  });
});
