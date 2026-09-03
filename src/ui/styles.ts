import {
  BREAK,
  C,
  FONTS,
  MOTION,
  PALETTE,
  RADIUS,
  SEVERITY,
  SPACE,
  TYPE,
  Z,
} from "./tokens.js";
import type { Palette } from "./tokens.js";

/* The stylesheet, written from the tokens rather than beside them. Every role
   in `TYPE` becomes a class of the same name, so a component says what a piece
   of text is and never how big it is; the media query below is the only place
   the phone and desktop sizes part. Mounted once by the application's root and
   global from there, which is what lets the build view's portal — a second
   root — still find `.chip`. */

/* Everything about a role except its size, which the breakpoint decides. */
const face = (name: string) => {
  const r = TYPE[name];
  return (
    `font-family:${r.family}; font-weight:${r.weight}; ` +
    `letter-spacing:${r.tracking}; line-height:${r.line}; ` +
    (r.caps ? "text-transform:uppercase; " : "") +
    (r.family === FONTS.mono ? "font-variant-numeric:tabular-nums; " : "")
  );
};
const size = (name: string, i: 0 | 1) => `font-size:${TYPE[name].size[i]}px;`;

const role = (name: string, i: 0 | 1) => `.${name} { ${size(name, i)} }`;
const roleBase = (name: string) => `.${name} { ${face(name)}}`;

const roles = Object.keys(TYPE);

/* A palette as custom properties. `color-scheme` beside them so the native
   controls — the checkboxes, the range thumbs, the scrollbars — follow. */
const vars = (pal: Palette, scheme: "dark" | "light") =>
  Object.entries(pal)
    .map(([k, v]) => `--${k}:${v};`)
    .join(" ") + ` color-scheme:${scheme};`;

/* Dark is the design and the default. The OS's preference selects light
   unless the reader chose dark by name, and choosing light by name wins over
   an OS that says dark — `data-theme` on the root is the choice. */
const THEMES = `
:root { ${vars(PALETTE.dark, "dark")} }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { ${vars(PALETTE.light, "light")} } }
:root[data-theme="light"] { ${vars(PALETTE.light, "light")} }
`;

const STYLES = `
${THEMES}
* { box-sizing: border-box; }
${roles.map(roleBase).join("\n")}
${roles.map((n) => role(n, 0)).join("\n")}
@media (min-width: ${BREAK}px) {
${roles.map((n) => "  " + role(n, 1)).join("\n")}
}
.label { color:${C.dim}; }
.note { color:${C.muted}; }
button { font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; }
button:disabled { cursor:default; }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline:2px solid ${C.amber}; outline-offset:2px; }
input[type=range]{ accent-color:${C.amber}; width:100%; }
/* A chip is a body-role button; data-on is how it shows it is selected, and
   the aria attribute beside it is how a reader hears the same thing. */
.chip { ${face("body")}${size("body", 0)} border:1px solid ${C.edge}; border-radius:${RADIUS.sm}px;
        display:inline-flex; align-items:center; gap:${SPACE.xs}px; line-height:1.2; padding:5px 10px; background:${C.panel2}; color:${C.muted}; transition:${MOTION.quick}ms; }
.chip:disabled { opacity:.4; }
/* Hover only where there is a pointer to hover with: a tap leaves :hover set
   on a phone until the next tap lands somewhere else. And the selected rule is
   repeated with :hover so it outranks the hover rule, which has three parts to
   its selector against this one's two — without it a chip under the pointer
   was paper on paper. #146 */
@media (hover: hover) { .chip:hover:not(:disabled) { border-color:${C.dim}; color:${C.paper}; } }
.chip[data-on="1"], .chip[data-on="1"]:hover { background:${C.paper}; color:${C.ink}; border-color:${C.paper}; font-weight:600; }
.card { background:${C.panel}; border:1px solid ${C.rule}; border-radius:${RADIUS.sm}px; }
/* An icon-only control: a square target, 44 on the phone and 32 on desktop,
   with the icon standing in the middle of it. The tooltip is the label the
   button already carries, shown while hovered or focused. */
.iconbtn { position:relative; display:inline-flex; align-items:center; justify-content:center;
           width:44px; height:44px; flex-shrink:0; border-radius:${RADIUS.sm}px; color:${C.muted};
           transition:${MOTION.quick}ms; }
.iconbtn:hover:not(:disabled), .iconbtn:focus-visible { color:${C.paper}; background:${C.panel2}; }
.iconbtn:disabled { opacity:.4; }
.iconbtn[data-on="1"] { color:${C.ink}; background:${C.paper}; }
/* Not merely transparent while hidden: an absolutely positioned box still
   counts towards its parent's scrollWidth, and the layout suite would read
   every tooltip as the row scrolling sideways. */
.iconbtn::after { content:attr(aria-label); display:none; position:absolute; top:100%; left:50%;
                  transform:translate(-50%, ${SPACE.sm}px); white-space:nowrap;
                  font-family:${FONTS.sans}; font-size:${TYPE.note.size[1]}px; font-weight:400;
                  text-transform:none; letter-spacing:0; color:${C.paper}; background:${C.panel2};
                  border:1px solid ${C.rule}; border-radius:${RADIUS.sm}px; padding:${SPACE.xs}px ${SPACE.md}px;
                  pointer-events:none; z-index:${Z.popover}; }
.iconbtn:hover::after, .iconbtn:focus-visible::after { display:block; }
/* A disclosure's i beside a label: the same square target, its wrapper
   pulled in by negative margins so it takes 28 px of the row it sits in —
   primitives.tsx says why the wrapper and not the button. With a caption the
   words are the target and it is as tall as the square. */
.disc { margin:-8px -6px; }
.disc-cap { display:inline-flex; align-items:center; gap:${SPACE.xs}px; min-height:44px;
            color:${C.muted}; transition:${MOTION.quick}ms; }
.disc-cap:hover, .disc-cap:focus-visible { color:${C.paper}; }
/* A chip's one-sentence hint, for a pointer; the group's disclosure is the
   finger's path to the same words. Hidden as the icon tooltip is, and only
   where there is a pointer to hover with. */
.chip { position:relative; }
/* The body picker's dash and moons, hung level with the planet's name. */
.dash { margin-top:7px; }
.moons { margin-top:4px; }
/* The flight profile: a row is one line, whatever the screen. */
.profile th { padding:0 0 4px; white-space:nowrap; vertical-align:bottom; }
.profile td { padding:2px 0 2px ${SPACE.md}px; white-space:nowrap; vertical-align:top; }
.profile td:first-child { padding-left:0; }
/* The bill of parts. Five columns on desktop; on the phone, below, a row
   is the part and then its figures. */
.parts th { text-align:left; padding:6px 8px; border-bottom:1px solid ${C.rule}; white-space:nowrap; }
.parts td { padding:6px 8px; border-bottom:1px solid ${C.panel2}; }
.parts td.under { padding-left:22px; }
.parts .num { text-align:right; }
/* The rocket's name and its headline figures, one wrapping row; on the
   phone, below, the name is a line of its own and the figures sit closer. */
.hero { gap:26px; }
/* A checkbox and its words as one row, the row being the target. */
.check { display:flex; gap:6px; align-items:flex-start; }
.check > input { margin-top:2px; }
.chip[data-hint]::after { content:attr(data-hint); display:none; position:absolute; top:100%; left:0;
                          transform:translateY(${SPACE.sm}px); width:max-content; max-width:260px; white-space:normal; text-align:left;
                          font-family:${FONTS.sans}; font-size:${TYPE.note.size[1]}px; font-weight:400; line-height:1.4;
                          color:${C.paper}; background:${C.panel2}; border:1px solid ${C.rule}; border-radius:${RADIUS.sm}px;
                          padding:${SPACE.xs}px ${SPACE.md}px; pointer-events:none; z-index:${Z.popover}; }
@media (hover: hover) { .chip[data-hint]:hover::after { display:block; } }
@media (min-width: ${BREAK}px) { .iconbtn { width:32px; height:32px; } .disc { margin:-4px; } .disc-cap { min-height:32px; } .chip { ${size("body", 1)} } }
/* The page's foot: room for the footer's last line, and on the phone for
   the jump bar over it. */
.page { padding-bottom:60px; }
.jump { display:flex; }
/* The phone's targets: 44 px on anything a finger presses. A chip grows
   to it; a fold's header button, a checkbox's label row, a planet, a moon
   and the cut row take it as a minimum height through \`tap\`; a link in
   running text takes it as padding its negative margin gives back to the
   line, so the box is 44 tall without the line being. A number field is
   16 px so iOS does not zoom into it on focus, and a slider is as tall as
   the thumb needs. #136 */
@media (max-width: ${BREAK - 1}px) {
  .chip, .tap { min-height:44px; }
  .page { padding-bottom:calc(104px + env(safe-area-inset-bottom)); }
  .check { align-items:center; }
  .dash { margin-top:11px; }
  .moons { margin-top:0; }
  .check > input { margin-top:0; }
  .fold { min-height:44px; margin:-10px 0; }
  a { display:inline-block; padding:14px 0; margin:-14px 0; }
  .field-in { font-size:16px; min-height:44px; }
  input[type=range] { height:44px; margin:0; }
  /* The bill, a row at a time: the stage number down the left, the part
     across the top, and under it \`qty × each t = total t\` — the glue and
     the units are drawn here, since the header that named the columns is
     not. A note row is its words alone; a hardware row is \`qty · in
     payload\`. */
  .hero { gap:${SPACE.lg}px; }
  .hero-name { flex-basis:100%; }
  .parts thead { display:none; }
  .parts tr { display:grid; grid-template-columns:24px max-content max-content 1fr; column-gap:${SPACE.xs}px; padding:${SPACE.md}px 0; border-bottom:1px solid ${C.panel2}; }
  .parts td { padding:0; border:0; }
  .parts .num { text-align:left; }
  .parts td:nth-child(1) { grid-row:1 / 3; }
  .parts td:nth-child(2) { grid-column:2 / 5; }
  .parts td.under { padding-left:0; }
  .parts td:nth-child(4)::before { content:"× "; }
  .parts td:nth-child(4)::after, .parts td:nth-child(5)::after { content:" t"; }
  .parts td:nth-child(5)::before { content:"= "; }
  .parts tr.words td:nth-child(n+3) { display:none; }
  .parts tr.hw td:nth-child(4) { display:none; }
  .parts tr.hw td:nth-child(5)::before { content:"· "; }
  .parts tr.hw td:nth-child(5)::after { content:none; }
}
@media (min-width: ${BREAK}px) { .parts { min-width:460px; } }
/* The fold's header button on desktop: 24 px, the desktop's target; and no
   jump bar, the page being in view at once. */
@media (min-width: ${BREAK}px) { .fold { min-height:24px; margin:-3px 0; } .jump { display:none; }
                                 a { display:inline-block; padding:3px 0; margin:-3px 0; } }
/* The fold's chevron, turned by the section it belongs to. */
.chev { transition:transform ${MOTION.quick}ms; color:${C.dim}; flex-shrink:0; }
[aria-expanded="true"] > .chev { transform:rotate(90deg); }
/* A callout's edge and headline take its severity; the icon beside them is
   what says it without the colour. */
${Object.entries(SEVERITY)
  .map(
    ([k, v]) =>
      `.callout[data-severity="${k}"] { border-color:${v.color}; } ` +
      `.callout[data-severity="${k}"] > .callout-head { color:${v.color}; }`,
  )
  .join("\n")}
/* The only links in the application. Browser-default blue against this
   palette reads as a mistake, so they take the muted ink and earn their
   underline on hover rather than shouting by default. */
a { color:${C.muted}; text-decoration:underline; text-decoration-color:${C.edge};
    text-underline-offset:2px; transition:${MOTION.quick}ms; }
a:hover { color:${C.paper}; text-decoration-color:${C.amber}; }
@keyframes fadein { from { opacity:0; } to { opacity:1; } }
@keyframes pulse { 0%,100% { opacity:.35; } 50% { opacity:1; } }
@keyframes rise { from { transform:translateY(100%); } to { transform:none; } }
@keyframes slide { from { transform:translateX(100%); } to { transform:none; } }
@media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
`;

export { STYLES };
