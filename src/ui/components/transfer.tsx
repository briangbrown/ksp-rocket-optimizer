import { SYS } from "../../core/orbits.js";
import { DAY, orbitPoints } from "../../core/kepler.js";
import { bodyLabel, fmt, kerbalDateLabel } from "../format.js";
import { C, SPACE, edgeOf, hueFor, inkOn } from "../tokens.js";
import { Stat } from "./primitives.jsx";
import type { Theme } from "../tokens.js";
import type { Window } from "../../core/transfer.js";

/* The transfer, as the pilot flies it: when to leave, where on the parking
   orbit to burn and how hard, and where the two planets stand about the Sun
   when you do. Two drawings, top-down, and the numbers under them. Both are
   diagrams rather than renderings — SVG in the page's own tokens — and both
   are described for a reader who cannot see them.

   Drawn the way the game's map draws them. An orbit is its body's hue and
   fades behind the body: fully saturated just behind it, dimmer the further
   back, dimmest just ahead — which is how the map says which way a thing is
   going without an arrow. Bodies are their picker hues and are named; the
   ship is a capsule, headed the way it is moving.

   The departure drawing is turned so the body's direction of travel is up:
   the burn is then where the pilot looks for it, so many degrees round from
   prograde, on the night side for a transfer outward. The ship sits at the
   burn with its parking orbit fading behind it; the escape it is about to
   fly is dashed, as the map dashes a planned trajectory. The Sun's system is
   turned so the body being left lies to Kerbol's right, with the phase angle
   opening counter-clockwise from there; the planets are drawn at departure
   and the ship at the far end of its transfer arc, the arc its trail.

   Names are placed, not put: each tries eight positions about its point and
   takes the one clear of the names already down, the markers, the rays and
   the frame, with a short leader where it had to move away. Fixed offsets
   put "Kerbol", "Kerbin" and "Kerbin at launch" on top of one another for
   every pair whose inner orbit is small (#200). */

const size = 220;
const half = size / 2;
type Pt = [number, number];
type Box = { x: number; y: number; w: number; h: number };
type Seg = [Pt, Pt];

/* Rotate the ecliptic frame so `up` points up the page; SVG's y runs down. */
const turn = (up: Pt) => {
  const th = Math.PI / 2 - Math.atan2(up[1], up[0]);
  const c = Math.cos(th),
    s = Math.sin(th);
  return (x: number, y: number): Pt => [
    half + (x * c - y * s),
    half - (x * s + y * c),
  ];
};
const deg = (x: number) => `${Math.round(x)}°`;
const path = (pts: Array<Pt>) =>
  pts
    .map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`)
    .join(" ");

/* ------------------------------ placement ------------------------------ */

/* A note-role glyph is about seven pixels wide and its box fifteen tall,
   measured in Chrome: an estimate a pixel short put names a pixel onto
   markers. */
const NOTE_H = 15;
const widthOf = (text: string) => 6.9 * text.length + 4;

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/* Whether a segment crosses a box: an endpoint inside, or an edge cut. */
function crosses(b: Box, [p, q]: Seg) {
  const inside = (r: Pt) =>
    r[0] >= b.x && r[0] <= b.x + b.w && r[1] >= b.y && r[1] <= b.y + b.h;
  if (inside(p) || inside(q)) return true;
  const edges: Array<Seg> = [
    [
      [b.x, b.y],
      [b.x + b.w, b.y],
    ],
    [
      [b.x + b.w, b.y],
      [b.x + b.w, b.y + b.h],
    ],
    [
      [b.x + b.w, b.y + b.h],
      [b.x, b.y + b.h],
    ],
    [
      [b.x, b.y + b.h],
      [b.x, b.y],
    ],
  ];
  const side = (a: Pt, c: Pt, d: Pt) =>
    (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]);
  return edges.some(([a, c]) => {
    const d1 = side(p, q, a),
      d2 = side(p, q, c),
      d3 = side(a, c, p),
      d4 = side(a, c, q);
    return d1 * d2 < 0 && d3 * d4 < 0;
  });
}

type Placed = {
  text: string;
  at: Pt;
  anchor: "start" | "middle" | "end";
  box: Box;
  /* From the point to the name, where the name had to stand off. */
  leader: Seg | null;
};

/* Eight directions about a point, the sideways ones first — a name reads
   best beside its point — at two stand-offs, the second with a leader. */
const DIRS: Array<[number, number, "start" | "middle" | "end", number]> = [
  [1, 0, "start", 0],
  [-1, 0, "end", 0],
  [0, 1, "middle", 1],
  [0, -1, "middle", 1],
  [1, 1, "start", 2],
  [-1, 1, "end", 2],
  [1, -1, "start", 2],
  [-1, -1, "end", 2],
];

/* Where a name goes: the least-cost of sixteen candidates, scored against
   what is already down. `avoid` are boxes (markers, other names), `lines`
   the rays a name should not sit across. */
function place(
  text: string,
  at: Pt,
  taken: Array<Box>,
  lines: Array<Seg>,
  prefer: "any" | "below" = "any",
): Placed {
  const w = widthOf(text),
    h = NOTE_H;
  let best: Placed | null = null,
    bestCost = Infinity;
  for (const ring of [0, 1, 2]) {
    const d = ring === 0 ? 7 : ring === 1 ? 19 : 31;
    for (const [dx, dy, anchor, pen] of DIRS) {
      const cx = at[0] + dx * d,
        cy = at[1] + dy * d;
      const box: Box = {
        x: anchor === "start" ? cx : anchor === "end" ? cx - w : cx - w / 2,
        y: dy === 0 ? cy - h / 2 : dy > 0 ? cy : cy - h,
        w,
        h,
      };
      /* Overlap costs by the pixel and the frame by the pixel over, both
         dearly: a name standing off on a leader is far better than one on
         top of another, and a leader costs a few points. */
      let cost = pen + ring * 4;
      if (prefer === "below" && dy <= 0) cost += 2;
      if (box.x < 1) cost += (1 - box.x) * 5;
      if (box.x + box.w > size - 1) cost += (box.x + box.w - size + 1) * 5;
      if (box.y < 1) cost += (1 - box.y) * 5;
      if (box.y + box.h > size - 1) cost += (box.y + box.h - size + 1) * 5;
      for (const t of taken) cost += overlap(box, t) * 2;
      for (const l of lines) if (crosses(box, l)) cost += 6;
      if (cost < bestCost) {
        bestCost = cost;
        /* The baseline the text is drawn on: middle of the box for a name
           beside its point, the box's foot otherwise. */
        const y = box.y + 12;
        const x =
          anchor === "start" ? box.x : anchor === "end" ? box.x + w : cx;
        best = {
          text,
          at: [x, y],
          anchor,
          box,
          leader:
            ring === 0
              ? null
              : [at, [cx - dx * 2, dy === 0 ? cy : dy > 0 ? box.y : box.y + h]],
        };
      }
    }
  }
  return best!;
}

const dot = (q: Pt, r: number): Box => ({
  x: q[0] - r,
  y: q[1] - r,
  w: 2 * r,
  h: 2 * r,
});

/* ------------------------------ elements ------------------------------ */

/* An orbit as the map draws it: one path per segment, the opacity falling
   from full just behind the body (`at`, an index into `pts`, which run the
   way the body moves) to a tenth just ahead of it. `open` is a trail with
   an end rather than a loop. */
function Trail({
  pts,
  at,
  color,
  width = 1,
  open = false,
}: {
  pts: Array<Pt>;
  at: number;
  color: string;
  width?: number;
  open?: boolean;
}) {
  const n = pts.length - 1;
  const segs = [];
  for (let k = 0; k < n; k++) {
    const behind = open ? (at - k) / at : ((((at - k) % n) + n) % n) / n;
    const alpha = 1 - 0.9 * Math.min(1, Math.max(0, behind));
    segs.push(
      <line
        key={k}
        x1={pts[k][0]}
        y1={pts[k][1]}
        x2={pts[k + 1][0]}
        y2={pts[k + 1][1]}
        stroke={color}
        strokeWidth={width}
        strokeOpacity={alpha.toFixed(2)}
        /* Butt ends: two round caps meeting at a joint paint it twice, and
           a translucent joint painted twice is a darker dot — seventy of
           them read as a dashed line. Butt ends meet exactly; the wedge
           they leave on the outside of the bend is a twentieth of a pixel. */
        strokeLinecap="butt"
      />,
    );
  }
  return <>{segs}</>;
}

/* The ship: a capsule the size of a body marker, its nose the way it is
   going. `heading` is the direction of travel on the page. */
function Ship({ at, heading }: { at: Pt; heading: Pt }) {
  const a = (Math.atan2(heading[1], heading[0]) * 180) / Math.PI + 90;
  return (
    <g transform={`translate(${at[0]} ${at[1]}) rotate(${a})`}>
      <polygon
        points="0,-7 3.5,-1 3.5,4 -3.5,4 -3.5,-1"
        fill={C.paper}
        stroke={C.ink}
        strokeWidth={0.75}
      />
      <rect x={-4.5} y={4} width={9} height={2} fill={C.amber} />
    </g>
  );
}

/* A name in the drawing. The halo is the panel painted behind the glyphs,
   for a name that lines cross; a name on a body's own disc stands on a
   solid fill and takes none — with one, Duna's light ink on its dark disc
   read as white on white in the light theme, whose panel is white. */
const Name = ({
  at,
  text,
  color,
  anchor = "start",
  halo = true,
}: {
  at: Pt;
  text: string;
  color: string;
  anchor?: "start" | "middle" | "end";
  halo?: boolean;
}) => (
  <text
    className="note"
    paintOrder={halo ? "stroke" : undefined}
    stroke={halo ? C.panel : undefined}
    strokeWidth={halo ? 3 : undefined}
    strokeLinejoin="round"
    x={at[0]}
    y={at[1]}
    fill={color}
    textAnchor={anchor}
  >
    {text}
  </text>
);

/* A placed name and, where it stood off, its leader. */
const Label = ({ p, color }: { p: Placed; color: string }) => (
  <>
    {p.leader && (
      <line
        x1={p.leader[0][0]}
        y1={p.leader[0][1]}
        x2={p.leader[1][0]}
        y2={p.leader[1][1]}
        stroke={C.dim}
        strokeWidth={0.75}
      />
    )}
    <Name at={p.at} text={p.text} color={color} anchor={p.anchor} />
  </>
);

/* ------------------------------ departure ------------------------------ */

function Departure({ w, theme }: { w: Window; theme: Theme }) {
  const hue = hueFor(w.from, theme);
  const ink = edgeOf(hue, theme);
  const rp = 56; // the parking orbit, in px
  const k = rp / w.rPark;
  const Rb = Math.max(5, SYS[w.from].R * k);
  const P = turn(w.vDir);
  const burn = P(w.burnDir[0] * rp, w.burnDir[1] * rp);
  /* The parking orbit, the way round the ship goes, with the ship's index. */
  const N = 72;
  const a0 = Math.atan2(w.burnDir[1], w.burnDir[0]);
  const ring: Array<Pt> = [];
  for (let i = 0; i <= N; i++) {
    const a = a0 + (2 * Math.PI * i) / N;
    ring.push(P(Math.cos(a) * rp, Math.sin(a) * rp));
  }
  /* Prograde on the parking orbit at the burn: a quarter turn on from the
     radius, counter-clockwise. */
  const tangent: Pt = [-w.burnDir[1], w.burnDir[0]];
  const tEnd = P(
    w.burnDir[0] * rp + tangent[0] * 10,
    w.burnDir[1] * rp + tangent[1] * 10,
  );
  const heading: Pt = [tEnd[0] - burn[0], tEnd[1] - burn[1]];
  /* The Sun's direction, marked at the edge — a little further in when
     the burn is on the Sun's side and the marker would land on the ship. */
  const sunDir: Pt = [-w.r1[0], -w.r1[1]];
  const sn = Math.hypot(sunDir[0], sunDir[1]) || 1;
  const sunAt = (d: number) => P((sunDir[0] / sn) * d, (sunDir[1] / sn) * d);
  let sun = sunAt(80);
  if (Math.hypot(sun[0] - burn[0], sun[1] - burn[1]) < 26) sun = sunAt(96);
  /* The hyperbola out of the burn: r = p / (1 + e·cos ν), ν from periapsis
     towards the asymptote, drawn while it fits the box. */
  const e =
    1 +
    (w.rPark * w.vinfOut ** 2) /
      (SYS[w.from].gee * 9.80665 * SYS[w.from].R ** 2);
  const p = w.rPark * (1 + e);
  const thInf = Math.acos(-1 / e);
  const hyper: Array<Pt> = [];
  for (let i = 0; i <= 60; i++) {
    const nu = ((thInf - 0.02) * i) / 60;
    const r = (p / (1 + e * Math.cos(nu))) * k;
    if (r > 150) break;
    const c = Math.cos(nu),
      s = Math.sin(nu);
    hyper.push(
      P(
        (w.burnDir[0] * c - w.burnDir[1] * s) * r,
        (w.burnDir[0] * s + w.burnDir[1] * c) * r,
      ),
    );
  }
  /* The angle from the reference direction to the burn, the short way. */
  const ref: Pt = w.ref === "prograde" ? w.vDir : [-w.vDir[0], -w.vDir[1]];
  const b0 = Math.atan2(ref[1], ref[0]);
  const b1 = Math.atan2(w.burnDir[1], w.burnDir[0]);
  let sweep = b1 - b0;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const ra = rp * 0.42;
  const arc: Array<Pt> = [];
  for (let i = 0; i <= 24; i++) {
    const a = b0 + (sweep * i) / 24;
    arc.push(P(Math.cos(a) * ra, Math.sin(a) * ra));
  }
  const mid = b0 + sweep / 2;
  const angleAt = P(Math.cos(mid) * (ra + 14), Math.sin(mid) * (ra + 14));
  const refEnd = P(ref[0] * rp, ref[1] * rp);
  /* Prograde is up by construction of `turn`. */
  const top: Pt = [half, half - rp - 8],
    tip: Pt = [half, half - rp - 30];
  /* Names, placed: the ship's and Kerbol's about their marks, clear of the
     rays, the arrow and each other. The angle and the body's own name are
     fixed and stood clear of. */
  const angleBox: Box = {
    x: angleAt[0] - widthOf(deg(w.angle)) / 2,
    y: angleAt[1] - NOTE_H / 2,
    w: widthOf(deg(w.angle)),
    h: NOTE_H,
  };
  const arrowBox: Box = { x: tip[0] - 5, y: tip[1] - 6, w: 70, h: 40 };
  const rays: Array<Seg> = [
    [[half, half], refEnd],
    [[half, half], burn],
    [[half, half], sun],
    [top, tip],
  ];
  const taken: Array<Box> = [dot(burn, 10), dot(sun, 5), angleBox, arrowBox];
  const shipName = place("Ship", burn, taken, rays);
  taken.push(shipName.box);
  const sunName = place("Kerbol", sun, taken, rays, "below");
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: "block", color: C.paper }}
      role="img"
      aria-label={`Leaving ${bodyLabel(w.from)}: the ship on its parking orbit at the burn, ${fmt(w.eject)} m/s at ${deg(w.angle)} from ${w.ref}, the escape leaving towards ${bodyLabel(w.to)}; Kerbol's direction marked.`}
    >
      <line
        x1={half}
        y1={half}
        x2={sun[0]}
        y2={sun[1]}
        stroke={C.rule}
        strokeDasharray="2 4"
      />
      <circle cx={sun[0]} cy={sun[1]} r={5} fill={hueFor("Sun", theme)} />
      <Trail pts={ring} at={0} color={hue} />
      <circle cx={half} cy={half} r={Rb} fill={hue} fillOpacity={0.9} />
      <Name
        at={[half, half + 4]}
        text={bodyLabel(w.from)}
        color={inkOn(hue)}
        anchor="middle"
        halo={false}
      />
      <line x1={top[0]} y1={top[1]} x2={tip[0]} y2={tip[1]} stroke={C.dim} />
      <polygon
        points={`${tip[0]},${tip[1] - 5} ${tip[0] - 4},${tip[1] + 3} ${tip[0] + 4},${tip[1] + 3}`}
        fill={C.dim}
      />
      <Name at={[tip[0] + 7, tip[1] + 4]} text="prograde" color={C.dim} />
      <path
        d={path(hyper)}
        fill="none"
        stroke={ink}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <line
        x1={half}
        y1={half}
        x2={refEnd[0]}
        y2={refEnd[1]}
        stroke={C.dim}
        strokeOpacity={0.8}
      />
      <line
        x1={half}
        y1={half}
        x2={burn[0]}
        y2={burn[1]}
        stroke={C.dim}
        strokeOpacity={0.8}
      />
      <path d={path(arc)} fill="none" stroke={C.dim} strokeDasharray="3 3" />
      <text
        className="note"
        paintOrder="stroke"
        stroke={C.panel}
        strokeWidth={3}
        strokeLinejoin="round"
        x={angleAt[0]}
        y={angleAt[1]}
        fill={C.paper}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {deg(w.angle)}
      </text>
      <Ship at={burn} heading={heading} />
      <Label p={shipName} color={C.paper} />
      <Label p={sunName} color={C.dim} />
    </svg>
  );
}

/* ----------------------------- heliocentric ----------------------------- */

/* Radii compressed: r^0.6 of the frame, so an inner orbit a sixth of the
   outer one is a third of the frame rather than a sixth, and the bodies
   about it have room for their names. Every sampled point takes the same
   map, so orbits, arc and bodies stay consistent with one another; the
   caption says the scale is compressed. */
const POWER = 0.6;

function Heliocentric({ w, theme }: { w: Window; theme: Theme }) {
  const hue1 = hueFor(w.from, theme),
    hue2 = hueFor(w.to, theme);
  const o1 = orbitPoints(w.from, 120).map((q) => [q[0], q[1]] as Pt);
  const o2 = orbitPoints(w.to, 120).map((q) => [q[0], q[1]] as Pt);
  const far = Math.max(
    ...[...o1, ...o2, ...w.arc].map((q) => Math.hypot(q[0], q[1])),
  );
  const R = 84;
  /* Turned so the body being left lies to the right of Kerbol, on the
     horizontal; the phase angle then opens counter-clockwise from there to
     the body being gone to, the way it is measured. */
  const th = -Math.atan2(w.r1[1], w.r1[0]);
  const ct = Math.cos(th),
    st = Math.sin(th);
  const P = (q: Pt): Pt => {
    const r = Math.hypot(q[0], q[1]);
    const k = r > 0 ? (R * (r / far) ** POWER) / r : 0;
    return [
      half + (q[0] * ct - q[1] * st) * k,
      half - (q[0] * st + q[1] * ct) * k,
    ];
  };
  const nearest = (pts: Array<Pt>, q: Pt) => {
    let best = 0,
      d = Infinity;
    pts.forEach((r, i) => {
      const dd = Math.hypot(r[0] - q[0], r[1] - q[1]);
      if (dd < d) {
        d = dd;
        best = i;
      }
    });
    return best;
  };
  const from = P(w.r1),
    toDep = P(w.r2dep),
    toArr = P(w.r2);
  const trail = w.arc.map(P);
  const last = trail[trail.length - 1],
    prev = trail[trail.length - 2];
  const heading: Pt = [last[0] - prev[0], last[1] - prev[1]];
  const hn = Math.hypot(heading[0], heading[1]) || 1;
  const ship: Pt = [
    last[0] - (heading[0] / hn) * 9,
    last[1] - (heading[1] / hn) * 9,
  ];
  /* The phase arc inside the inner orbit, its label outside the arc on the
     bisector. */
  const inner = Math.min(
    Math.hypot(from[0] - half, from[1] - half),
    Math.hypot(toDep[0] - half, toDep[1] - half),
  );
  const ra = Math.min(22, Math.max(10, inner * 0.45));
  const arc: Array<Pt> = [];
  for (let i = 0; i <= 24; i++) {
    const a = ((w.phase * Math.PI) / 180) * (i / 24);
    arc.push([half + Math.cos(a) * ra, half - Math.sin(a) * ra]);
  }
  const mid = (w.phase * Math.PI) / 180 / 2;
  const angleAt: Pt = [
    half + Math.cos(mid) * (ra + 11),
    half - Math.sin(mid) * (ra + 11),
  ];
  const angleText = deg(w.phase);
  /* Names, placed in order of how tied down each is: the angle about the
     arc's middle, the ship and the departure body, the arrival body, then
     Kerbol under its mark, and the ghost at launch last — it has the most
     room to give. */
  const rays: Array<Seg> = [
    [[half, half], from],
    [[half, half], toDep],
  ];
  const taken: Array<Box> = [
    dot([half, half], 6),
    dot(from, 5),
    dot(toDep, 5),
    dot(toArr, 5),
    dot(ship, 10),
  ];
  const put = (text: string, at: Pt, prefer: "any" | "below" = "any") => {
    const p = place(text, at, taken, rays, prefer);
    taken.push(p.box);
    return p;
  };
  const angleName = put(angleText, angleAt);
  const shipName = put("Ship", ship);
  const fromName = put(bodyLabel(w.from), from);
  const toName = put(bodyLabel(w.to), toArr);
  const sunName = put("Kerbol", [half, half], "below");
  const ghostName = put(`${bodyLabel(w.to)} at launch`, toDep);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: "block", color: C.paper }}
      role="img"
      aria-label={`About Kerbol: ${bodyLabel(w.from)} and ${bodyLabel(w.to)} at departure, ${deg(w.phase)} apart, and the ship at the end of its transfer arc where ${bodyLabel(w.to)} will be on arrival. Distances compressed.`}
    >
      <Trail pts={o1.map(P)} at={nearest(o1, w.r1)} color={hue1} />
      <Trail pts={o2.map(P)} at={nearest(o2, w.r2dep)} color={hue2} />
      <Trail
        pts={trail}
        at={trail.length - 1}
        color={C.paper}
        width={1.5}
        open
      />
      <line
        x1={half}
        y1={half}
        x2={from[0]}
        y2={from[1]}
        stroke={C.dim}
        strokeOpacity={0.8}
      />
      <line
        x1={half}
        y1={half}
        x2={toDep[0]}
        y2={toDep[1]}
        stroke={C.dim}
        strokeOpacity={0.8}
      />
      <path d={path(arc)} fill="none" stroke={C.dim} strokeDasharray="3 3" />
      <circle cx={half} cy={half} r={5} fill={hueFor("Sun", theme)} />
      {/* The ghost at launch: a ring filled with the panel, so the lines
          through it stop at its edge (#201). */}
      <circle
        cx={toDep[0]}
        cy={toDep[1]}
        r={4}
        fill={C.panel}
        stroke={hue2}
        strokeWidth={1.5}
      />
      <circle cx={toArr[0]} cy={toArr[1]} r={4} fill={hue2} />
      <circle cx={from[0]} cy={from[1]} r={4} fill={hue1} />
      <Ship at={ship} heading={heading} />
      <Label p={angleName} color={C.paper} />
      <Label p={shipName} color={C.paper} />
      <Label p={fromName} color={edgeOf(hue1, theme)} />
      <Label p={toName} color={edgeOf(hue2, theme)} />
      <Label p={sunName} color={C.dim} />
      <Label p={ghostName} color={edgeOf(hue2, theme)} />
    </svg>
  );
}

/* --------------------------------- card --------------------------------- */

function TransferPanel({
  w,
  theme,
  captured,
}: {
  w: Window;
  theme: Theme;
  captured: boolean;
}) {
  const days = w.tof / DAY;
  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: SPACE.lg,
          justifyContent: "center",
          marginBottom: SPACE.md,
        }}
      >
        <div style={{ flex: "1 1 200px", maxWidth: size }}>
          <Departure w={w} theme={theme} />
          <div className="note" style={{ textAlign: "center" }}>
            Leaving {bodyLabel(w.from)}
          </div>
        </div>
        <div style={{ flex: "1 1 200px", maxWidth: size }}>
          <Heliocentric w={w} theme={theme} />
          <div className="note" style={{ textAlign: "center" }}>
            About Kerbol at departure, the ship on arrival · distances
            compressed
          </div>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))",
          gap: `${SPACE.md}px ${SPACE.lg}px`,
        }}
      >
        <Stat small label="Leave" value={kerbalDateLabel(w.depart)} />
        <Stat
          small
          label="Ejection burn"
          value={fmt(w.eject)}
          unit="m/s"
          note={`${deg(w.angle)} from ${w.ref}`}
        />
        {/* The burn's parts from an equatorial parking orbit: what leaves
            the plane is the normal component, which a parking orbit
            launched into the escape's own inclination would not need. */}
        <Stat
          small
          label="Burn components"
          value={
            <>
              {fmt(w.ejectPro)}
              <span className="note" style={{ margin: "0 3px" }}>
                m/s
              </span>
              · {fmt(Math.abs(w.ejectNor))}
            </>
          }
          unit="m/s"
          note={`prograde · ${w.ejectNor < 0 ? "anti-normal" : "normal"}`}
        />
        <Stat small label="Phase angle" value={deg(w.phase)} />
        <Stat
          small
          label="Transfer"
          value={w.type === "plane" ? "mid-course" : "ballistic"}
          note={
            w.type === "plane"
              ? "in the plane, tilted on the way"
              : "inclination in the ejection"
          }
        />
        {w.plane && (
          <Stat
            small
            label="Plane change"
            value={fmt(w.plane.dv)}
            unit="m/s"
            note={`${w.plane.deg.toFixed(1)}° at ${kerbalDateLabel(w.plane.at)}`}
          />
        )}
        <Stat small label="Flight" value={fmt(days)} unit="days" />
        <Stat small label="Arrive" value={kerbalDateLabel(w.arrive)} />
        <Stat
          small
          label={captured ? "Capture burn" : "Arrival"}
          value={captured ? fmt(w.capture) : "fly-by"}
          unit={captured ? "m/s" : undefined}
        />
      </div>
    </div>
  );
}

export { TransferPanel };
