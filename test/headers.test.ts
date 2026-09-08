import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* The security headers Cloudflare Pages serves from public/_headers (#176).
   Vite copies public/ into dist/ as it is, so the file read here is the one
   deployed. What is held: the policy exists, allows nothing from another
   origin, keeps the two things the app needs — inline styles and same-origin
   workers — and refuses framing. */
const text = readFileSync("public/_headers", "utf8");
const line = (name: string) =>
  text
    .split("\n")
    .find((l) => l.trim().startsWith(name + ":"))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();

describe("the security headers", () => {
  const csp = line("Content-Security-Policy") ?? "";
  const directive = (d: string) =>
    csp
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(d + " ") || x === d)
      ?.slice(d.length)
      .trim();

  it("apply to every path", () => {
    expect(text).toMatch(/^\/\*$/m);
  });
  it("let scripts, workers, fonts and fetches come only from this origin", () => {
    expect(directive("default-src")).toBe("'self'");
    expect(directive("script-src")).toBe("'self'");
    expect(directive("worker-src")).toBe("'self'");
    expect(directive("font-src")).toBe("'self'");
    expect(directive("connect-src")).toBe("'self'");
    expect(csp).not.toMatch(/https?:/);
    expect(csp).not.toMatch(/'unsafe-eval'/);
  });
  it("allow the inline styles the components render, and nothing else inline", () => {
    expect(directive("style-src")).toBe("'self' 'unsafe-inline'");
    expect(directive("script-src")).not.toMatch(/unsafe-inline/);
  });
  it("refuse framing, objects and form posts", () => {
    expect(directive("frame-ancestors")).toBe("'none'");
    expect(directive("object-src")).toBe("'none'");
    expect(directive("form-action")).toBe("'none'");
    expect(line("X-Frame-Options")).toBe("DENY");
  });
  it("set the rest of the usual headers", () => {
    expect(line("X-Content-Type-Options")).toBe("nosniff");
    expect(line("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(line("Permissions-Policy")).toMatch(/camera=\(\)/);
    expect(line("Strict-Transport-Security")).toMatch(/max-age=\d{7,}/);
  });
});
