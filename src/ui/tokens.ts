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

/* The three families, each with the fallback it degrades to. `FONT` above is
   `FONTS.sans` under the name the portal trap made necessary. */
const FONTS = {
  sans: FONT,
  condensed: "'Barlow Condensed',Impact,sans-serif",
  mono: "'IBM Plex Mono',ui-monospace,Menlo,monospace",
};

/* Below this the page is a phone: one column, the phone size of every type
   role, 44 px targets. At or above it a second column is earned. */
const BREAK = 1024;

/* The six type roles, and the one larger figure. Nothing in a component sets
   a size; it names one of these, and `styles.ts` turns the table into the
   `.display` … `.note` classes with a media query at `BREAK` for the two
   sizes. `size` is [phone, desktop]. */
type Role = {
  family: string;
  size: [number, number];
  weight: number;
  /* Letter-spacing as a CSS length; the caps roles track, nothing else does. */
  tracking: string;
  caps: boolean;
  line: number;
};
const TYPE: Readonly<Record<string, Role>> = {
  display: {
    family: FONTS.condensed,
    size: [34, 34],
    weight: 700,
    tracking: ".06em",
    caps: true,
    line: 0.95,
  },
  heading: {
    family: FONTS.condensed,
    size: [15, 15],
    weight: 600,
    tracking: ".06em",
    caps: true,
    line: 1.2,
  },
  label: {
    family: FONTS.mono,
    size: [10, 10],
    weight: 400,
    tracking: ".22em",
    caps: true,
    line: 1.4,
  },
  body: {
    family: FONTS.sans,
    size: [12.5, 12.5],
    weight: 400,
    tracking: "0",
    caps: false,
    line: 1.5,
  },
  figure: {
    family: FONTS.mono,
    size: [12, 12],
    weight: 400,
    tracking: "0",
    caps: false,
    line: 1.4,
  },
  "figure-lg": {
    family: FONTS.mono,
    size: [24, 24],
    weight: 600,
    tracking: "0",
    caps: false,
    line: 1.1,
  },
  note: {
    family: FONTS.sans,
    size: [11, 11],
    weight: 400,
    tracking: "0",
    caps: false,
    line: 1.45,
  },
};

/* The 4 px scale. `xs` is the gap inside a chip and between a figure and its
   unit; `xxxl` is between sections. */
const SPACE = { xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 24, xxxl: 32 };

/* Two radii and round. `sm` for chips, fields and cards; `lg` for sheets,
   popovers and the overlay's rail; `round` for a dot. */
const RADIUS = { sm: 3, lg: 8, round: 999 };

/* The stacking order, named. The bar stays above the overlay so a full-screen
   rocket about to be replaced still says so — `.claude/rules/ui.md`. */
const Z = {
  brief: 10,
  jump: 20,
  pill: 30,
  overlay: 40,
  solving: 50,
  sheet: 60,
  popover: 70,
};

/* Motion, in milliseconds. `quick` is a chip changing state or a chevron
   turning; `settle` is a fold opening or a sheet sliding. The staging's own
   two paces live with the build view. */
const MOTION = { quick: 120, settle: 400 };

/* The two shadows, both on black whatever the theme: the solving bar's and the
   pill's, which sit over content rather than on a surface. */
const SHADOW = {
  bar: "0 2px 12px rgba(0,0,0,.45)",
  pill: "0 4px 18px rgba(0,0,0,.6)",
};
/* Behind a sheet. */
const SCRIM = "rgba(0,0,0,.6)";

/* Four severities, each with the lucide icon that carries it where colour
   cannot. `primitives.tsx` resolves the names to components. */
type Severity = "info" | "good" | "warn" | "bad";
const SEVERITY: Readonly<
  Record<
    Severity,
    {
      color: string;
      icon: "Info" | "CircleCheck" | "TriangleAlert" | "OctagonAlert";
    }
  >
> = {
  info: { color: C.sky, icon: "Info" },
  good: { color: C.mint, icon: "CircleCheck" },
  warn: { color: C.amber, icon: "TriangleAlert" },
  bad: { color: C.rust, icon: "OctagonAlert" },
};

/* What each kind of part is drawn in, shared by the elevation and the parts
   list so a swatch in one is the fill in the other. A booster takes the body
   hue, which is not a constant, and `hardware` is listed and never drawn. */
const KIND = {
  tank: C.tank,
  engine: C.engine,
  coupler: C.violet,
  adapter: C.violet,
  decoupler: C.dim,
  payload: C.payloadFill,
  shroud: C.shroud,
  hardware: C.muted,
};

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

export {
  BODY_HUE,
  BREAK,
  C,
  FONT,
  FONTS,
  KIND,
  MOTION,
  RADIUS,
  SCRIM,
  SEVERITY,
  SHADOW,
  SPACE,
  SYSTEMS,
  TYPE,
  Z,
  edgeOf,
  hueFor,
  inkOn,
  lift,
  lumOf,
  rgbOf,
};
export type { Role, Severity };
