import { existsSync, readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";

/* The icon's PNGs from its SVG: 32 px for browsers that do not take an SVG
   icon, 180 px for the home screen. Rendered by Chromium so the two are the
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
for (const [px, file] of [
  [32, "public/favicon-32.png"],
  [180, "public/apple-touch-icon.png"],
]) {
  await page.setViewport({ width: px, height: px, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><body style="margin:0;background:transparent">${svg.replace(
      "<svg ",
      `<svg width="${px}" height="${px}" `,
    )}</body>`,
  );
  const buf = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: px, height: px },
  });
  writeFileSync(file, buf);
  console.log(`${file}: ${buf.length} bytes`);
}
await browser.close();
