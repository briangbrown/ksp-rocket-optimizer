/* ------------------------------- design tokens ------------------------------- */
/* One palette, two themes. Every colour in the app is one of these tokens or
   is derived from a body hue, and each token has the same job in both themes —
   `docs/design.md` §4 lists the jobs and the contrast every pair clears: text
   4.5:1 on every surface it sits on, an outline or a drawn fill 3:1.

   Dark is the design; light is the same design with the values swapped. The
   application reads the tokens as CSS custom properties (`C`, below), so a
   theme change is the stylesheet's business — except in the drawing, where a
   shader is handed a number and has to be handed the live one (`palette()`). */
const DARK = {
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
type Palette = typeof DARK;
type Token = keyof Palette;

/* The same jobs on a white card. The accents are the dark set's hues taken
   down until they clear 4.5:1 as text on `panel`; `shroud` is the deliberate
   exception at 2:1, a fairing being a ghost under its outline. */
const LIGHT: Palette = {
  ink: "#E9EDF2",
  panel: "#FFFFFF",
  panel2: "#EDF1F6",
  rule: "#CFD8E3",
  edge: "#6F8399",
  paper: "#0F1720",
  muted: "#4B5D72",
  dim: "#58697E",
  amber: "#9A5A00",
  mint: "#157A5A",
  rust: "#B23A1B",
  moss: "#4E7A14",
  violet: "#6A3FB5",
  sky: "#1B64B3",
  ice: "#0E7080",
  tank: "#7A8FA4",
  engine: "#4E6176",
  payloadFill: "#2A9A72",
  shroud: "#AEBBC8",
  onLight: "#0B1119",
  onDark: "#F2EFE9",
};

type Theme = "dark" | "light";
/* What the reader asked for: the OS's choice, or one of the two by name. */
type ThemePref = "system" | Theme;
const PALETTE: Readonly<Record<Theme, Palette>> = { dark: DARK, light: LIGHT };

/* The tokens as the stylesheet and every inline style read them: `C.paper` is
   `var(--paper)`, and the theme decides what that is. Anything that needs the
   number — a shader, a canvas, a luminance — asks `palette()` instead. */
const C: Readonly<Record<Token, string>> = Object.fromEntries(
  Object.keys(DARK).map((k) => [k, `var(--${k})`]),
) as Record<Token, string>;

/* Which theme the page is showing. The root carries `data-theme` when the
   reader chose one; otherwise it is the OS's, read the way the stylesheet's
   media query reads it. jsdom has no `matchMedia`, so a test is dark. */
const themeNow = (): Theme => {
  if (typeof document === "undefined") return "dark";
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
};
const palette = (theme: Theme = themeNow()) => PALETTE[theme];

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
    size: [28, 34],
    weight: 600,
    tracking: ".06em",
    caps: true,
    line: 1.2,
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
    size: [12, 11],
    weight: 500,
    tracking: ".14em",
    caps: true,
    line: 1.4,
  },
  body: {
    family: FONTS.sans,
    size: [14, 13.5],
    weight: 400,
    tracking: "0",
    caps: false,
    line: 1.5,
  },
  figure: {
    family: FONTS.mono,
    size: [13, 13],
    weight: 500,
    tracking: "0",
    caps: false,
    line: 1.4,
  },
  "figure-lg": {
    family: FONTS.mono,
    size: [22, 24],
    weight: 600,
    tracking: "0",
    caps: false,
    line: 1.1,
  },
  note: {
    family: FONTS.sans,
    size: [13, 12.5],
    weight: 400,
    tracking: "0",
    caps: false,
    line: 1.5,
  },
};

/* The 4 px scale. `xs` is the gap inside a chip and between a figure and its
   unit; `xxxl` is between sections. */
const SPACE = { xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 24, xxxl: 32 };

/* Two radii, round, and none. `sm` for chips, fields and cards; `lg` for
   sheets, popovers and the overlay's rail; `round` for a dot; `none` for a
   bar bled to the page's edges, which has no corners to round. */
const RADIUS = { none: 0, sm: 3, lg: 8, round: 999 };

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
const KIND_TOKEN: Readonly<Record<string, Token>> = {
  tank: "tank",
  engine: "engine",
  coupler: "violet",
  adapter: "violet",
  decoupler: "dim",
  payload: "payloadFill",
  shroud: "shroud",
  hardware: "muted",
};
const KIND: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(KIND_TOKEN).map(([k, t]) => [k, C[t]]),
);
/* The same table as numbers, for the drawing, in the theme it is handed. */
const fills = (pal: Palette): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(KIND_TOKEN).map(([k, t]) => [k, pal[t]]));

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
const shade = (h: string, t: number) =>
  "#" +
  rgbOf(h)
    .map((v) =>
      Math.round(v * (1 - t))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
/* A hex either way, because a body hue is handed to the drawing. The
   fallback is the theme's `sky`, so it has to know which. */
const hueFor = (b: string, theme: Theme = themeNow()) =>
  BODY_HUE[b] || palette(theme).sky;
/* The ink on a button filled with a body hue: the button is the hue whatever
   is behind it, so this does not depend on the theme. */
const inkOn = (h: string) => (lumOf(h) > 0.45 ? C.onLight : C.onDark);
/* WCAG relative luminance and contrast — the numbers axe checks, which the
   gamma-space `lumOf` above only approximates. */
const linOf = (h: string) => {
  const [r, g, b] = rgbOf(h)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [linOf(a), linOf(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/* The hue as an outline or as text on the panel: walked toward the theme's
   paper until it clears 4.5:1 on `panel2`, the harder of the two grounds it
   lands on. A fixed lift left Minmus, Jool and Eeloo under the bar in dark,
   and the light theme needs the opposite move for Pol, Moho and Kerbin — so
   the number is checked rather than the hue guessed at. */
const edgeOf = (h: string, theme: Theme = themeNow()) => {
  const on = palette(theme).panel2;
  const toward = theme === "light" ? shade : lift;
  let out = h;
  for (let t = 0.05; contrast(out, on) < 4.5 && t <= 1; t += 0.05)
    out = toward(h, t);
  return out;
};

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
  PALETTE,
  RADIUS,
  SCRIM,
  SEVERITY,
  SHADOW,
  SPACE,
  SYSTEMS,
  TYPE,
  Z,
  edgeOf,
  fills,
  hueFor,
  inkOn,
  lift,
  lumOf,
  palette,
  rgbOf,
  shade,
  themeNow,
};
export type { Palette, Role, Severity, Theme, ThemePref };
