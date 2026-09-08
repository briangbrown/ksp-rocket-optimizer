// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import Boundary from "../src/ui/components/boundary.jsx";

/* The last line, #174: a render that throws shows a way back and clears the
   address it probably came from, instead of a blank page. */

afterEach(() => {
  cleanup();
  location.hash = "";
  vi.restoreAllMocks();
});

function Thrower(): never {
  throw new Error("a design nobody could build");
}

describe("the error boundary", () => {
  it("shows the fallback and clears the hash", () => {
    location.hash = "#c=whatever";
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Boundary>
        <Thrower />
      </Boundary>,
    );
    expect(document.querySelector("[role=alert]")?.textContent).toMatch(
      /could not be shown/,
    );
    expect(document.querySelector("button")?.textContent).toBe("Reload");
    expect(location.hash).toBe("");
  });

  it("renders its children when nothing throws", () => {
    render(
      <Boundary>
        <p>fine</p>
      </Boundary>,
    );
    expect(document.body.textContent).toBe("fine");
  });
});
