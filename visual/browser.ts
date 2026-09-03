import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer";
import type { Page } from "puppeteer";

/* ------------------------- driving a real WebGL context -------------------------

   jsdom does not implement WebGL, so `canRender3D()` is false in every test in
   `test/` and the build view has been taking a path no user takes since #66.
   Three bugs shipped through that gap and a person found all three. This is the
   harness that closes it. #73

   Chrome renders WebGL through SwiftShader, ANGLE's software rasteriser. The
   flag most write-ups give — `--use-gl=swiftshader` — is stale: Chromium
   deprecated the automatic fallback, because SwiftShader JITs code inside the
   GPU process, and it now has to be opted into by name. Without
   `--enable-unsafe-swiftshader` a recent Chrome creates no context at all
   rather than falling back, which would leave these tests quietly checking the
   no-WebGL path — the exact thing they exist to escape. */
const ARGS = [
  "--no-sandbox", // no user namespaces in the container; this is a local page
  "--use-gl=angle",
  "--use-angle=swiftshader-webgl",
  "--enable-unsafe-swiftshader",
  "--hide-scrollbars",
];

/* Which browser, and why it is not simply puppeteer's own.

   Chrome for Testing publishes no linux-arm64 build. On an Apple Silicon dev
   container puppeteer's download is therefore an x86_64 binary that will not
   start: it dies inside Rosetta complaining about a loader that is not there,
   which reads like anything except a wrong architecture. Debian's `chromium`
   package is native on both, and pulls its own shared libraries, so it is one
   apt package rather than the thirty-odd puppeteer lists for a bare image.

   The choice is made on the architecture rather than by probing, so it is the
   same answer every time and can be explained when it is wrong. A runner that
   is amd64 gets puppeteer's own browser, which is pinned alongside the library.
   `PUPPETEER_EXECUTABLE_PATH` overrides both. */
export function browserPath() {
  const named = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (named) return named;
  if (process.platform !== "linux" || process.arch !== "arm64")
    return undefined; // puppeteer's own, downloaded with the package
  for (const p of ["/usr/bin/chromium", "/usr/bin/chromium-browser"])
    if (existsSync(p)) return p;
  throw new Error(
    "No chromium on linux-arm64, and Chrome for Testing publishes no build " +
      "for it. Install one with `sudo apt-get install -y chromium`, or point " +
      "PUPPETEER_EXECUTABLE_PATH at a browser.",
  );
}

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

/* The built application, over http rather than file:// — the solver runs in a
   module worker and a file:// origin is opaque, so the worker never starts and
   nothing is ever solved to draw. */
export async function serve(root = "dist") {
  const missed: Array<string> = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rel = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
    /* The browser asks for this unprompted and the build ships none, so
       without an answer every run logs a console error that has nothing to do
       with the application. */
    if (rel === "/favicon.ico") return res.writeHead(204).end();
    const file = join(root, rel === "/" ? "index.html" : rel);
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] || "application/octet-stream",
      });
      res.end(body);
    } catch {
      missed.push(url.pathname);
      res.writeHead(404).end("not found");
    }
  });
  await new Promise<void>((r) => {
    server.listen(0, "127.0.0.1", () => r());
  });
  const at = server.address();
  /* A TCP listener always reports an object; the string form is a unix socket,
     which this never asks for. */
  const port = at && typeof at === "object" ? at.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    missed,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/* Two, so the panel is drawn at a devicePixelRatio above one. At one the canvas
   sizing bug from #66 — a drawing buffer scaled by the ratio with no CSS size
   to lay it out at — is invisible, because the two numbers agree. */
export const SCALE = 2;

/* The two screens the layout suite measures on. The phone is a 390-wide
   device with touch, which is what the application is actually tested on; the
   desktop is a laptop. `isMobile` matters beyond the width: it is what makes
   Chrome honour the viewport meta and report touch, and changing it after the
   page has loaded reloads the page — so it is set here, before `goto`, and
   never again. */
export const PHONE = {
  width: 390,
  height: 844,
  isMobile: true,
  hasTouch: true,
};
export const DESKTOP = { width: 1280, height: 900 };

export type Viewport = Partial<typeof PHONE> & {
  width: number;
  height: number;
};

export async function open(
  url: string,
  viewport: Viewport = { width: 1200, height: 1400 },
) {
  const browser = await puppeteer.launch({
    executablePath: browserPath(),
    args: ARGS,
  });
  const page = await browser.newPage();
  await page.setViewport({ deviceScaleFactor: SCALE, ...viewport });

  /* Anything the page complains about is a failure here. A shader that will not
     compile logs and draws nothing; there is no exception to catch and no
     element to inspect, so the console is the only witness. */
  const problems: Array<string> = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(String(e)));

  await page.goto(url, { waitUntil: "networkidle0" });
  return { browser, page, problems };
}

/* The veil is always mounted and only changes opacity, so the pulse animation
   on the dot is the honest "still solving" signal — the same reading
   `test/app-harness.js` takes in jsdom, for the same reason. */
export async function settle(page: Page, timeout = 120_000) {
  await page.waitForFunction(
    () => !document.querySelector('[style*="pulse"]'),
    { timeout, polling: 200 },
  );
  await page.waitForFunction(
    () => document.querySelectorAll("canvas").length >= 2,
    {
      timeout,
      polling: 200,
    },
  );
  /* One more frame after the last state change, so what is measured is what
     was drawn for it rather than the frame before. */
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}
