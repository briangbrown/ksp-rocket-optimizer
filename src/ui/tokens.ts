/* ------------------------------- design tokens ------------------------------- */
/* Single palette. Every colour in the app comes from here or is derived from a
   body hue, so the whole thing can be retoned by editing this block.
   Contrast is checked against WCAG: body text clears 4.5:1 on every surface it
   sits on, interactive borders and drawn shapes clear 3:1. */
const C = {
  // surfaces, darkest first
  ink: "#0A1017",
  panel: "#111A25",
  panel2: "#16212F",
  // lines: rule divides, edge outlines anything you can click or must see
  rule: "#2E4258",
  edge: "#52708F",
  // type
  paper: "#E6EDF6", // 14.9:1 on panel
  muted: "#7E93AD", //  5.6:1 on panel
  dim: "#7389A6", //  4.9:1 on panel — was #4E637C at 2.8:1, below the floor
  // accents
  amber: "#F5A623",
  mint: "#4FD1A5",
  rust: "#E2603F",
  moss: "#86B24A",
  violet: "#A177DB",
  sky: "#4A9BE0",
  ice: "#6FD7E8",
  // drawing fills, all clear of the panel behind them
  tank: "#5F7488",
  engine: "#9FB0C4",
  payloadFill: "#4FD1A5",
  shroud: "#3F5064",
  // labels printed on top of a filled body hue
  onLight: "#0B1119",
  onDark: "#F2EFE9",
};

/* The type stack, here with the palette because it is the same kind of
   decision — and because the build view's full-screen overlay is rendered
   through a portal to `document.body`. That is a second root, outside the one
   that sets this, and `button { font-family: inherit }` in the style block
   inherits the browser's default there rather than Inter. #99 */
const FONT = "'Inter',system-ui,-apple-system,sans-serif";

const BODY_HUE: Readonly<Record<string, string>> = {
  Moho: "#EEB688",
  Eve: "#6C20E4",
  Gilly: "#A27E6E",
  Kerbin: "#8ACAC2",
  Mun: "#9CA0B4",
  Minmus: "#8E74A0",
  Duna: "#A33F28",
  Ike: "#858A9A",
  Dres: "#5A4432",
  Jool: "#548513",
  Laythe: "#44569C",
  Vall: "#6E9BB4",
  Tylo: "#D3AAAA",
  Bop: "#BAA07E",
  Pol: "#DCE4AC",
  Eeloo: "#686A6A",
};
const rgbOf = (h: string) =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lumOf = (h: string) => {
  const [r, g, b] = rgbOf(h).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const lift = (h: string, t: number) =>
  "#" +
  rgbOf(h)
    .map((v) =>
      Math.round(v + (255 - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const hueFor = (b: string) => BODY_HUE[b] || C.sky;
const inkOn = (h: string) => (lumOf(h) > 0.45 ? C.onLight : C.onDark);
const edgeOf = (h: string) => (lumOf(h) < 0.35 ? lift(h, 0.35) : h);

const SYSTEMS: ReadonlyArray<[string, Array<string>]> = [
  ["Moho", []],
  ["Eve", ["Gilly"]],
  ["Kerbin", ["Mun", "Minmus"]],
  ["Duna", ["Ike"]],
  ["Dres", []],
  ["Jool", ["Laythe", "Vall", "Tylo", "Bop", "Pol"]],
  ["Eeloo", []],
];

export { BODY_HUE, C, FONT, SYSTEMS, edgeOf, hueFor, inkOn, lift, lumOf, rgbOf };
