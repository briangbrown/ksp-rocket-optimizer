import { existsSync, readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";

/* The icon's PNGs from its SVG. The SVG carries a prefers-color-scheme rule
   and no background, so a browser that takes an SVG icon draws it for the
   OS's theme on the tab's own ground. The PNGs cannot switch: the 32 px
   one, for browsers that do not take SVG icons, is the light-scheme drawing
   on transparent — the tab bar is light more often than not — and the
   180 px home-screen icon sits on an ink tile, since iOS paints black
   behind anything transparent. Rendered by Chromium, so both are the
   drawing in public/favicon.svg and nothing else. */

const exe =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  (process.platform === "linux" && process.arch === "arm64"
    ? ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync)
    : undefined);
const svg = readFileSync("public/favicon.svg", "utf8");
const browser = await puppeteer.launch({
  executablePath: exe,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const sized = (px, inset = 0) =>
  svg.replace(
    "<svg ",
    `<svg width="${px - 2 * inset}" height="${px - 2 * inset}" style="position:absolute;left:${inset}px;top:${inset}px" `,
  );
for (const [px, file, scheme, tile] of [
  [32, "public/favicon-32.png", "light", false],
  [180, "public/apple-touch-icon.png", "dark", true],
]) {
  await page.setViewport({ width: px, height: px, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: scheme },
  ]);
  const ground = tile
    ? `<div style="position:absolute;inset:0;background:#0A1017;border-radius:${px * 0.19}px"></div>`
    : "";
  await page.setContent(
    `<!doctype html><body style="margin:0;background:transparent">${ground}${sized(px, tile ? px * 0.12 : 0)}</body>`,
  );
  const buf = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: px, height: px },
  });
  writeFileSync(file, buf);
  console.log(
    `${file}: ${buf.length} bytes, ${scheme}${tile ? ", on a tile" : ""}`,
  );
}
await browser.close();
