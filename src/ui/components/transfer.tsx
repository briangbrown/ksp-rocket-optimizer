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
   drawn at departure — the planets where they are, the phase angle between
   them — with the ship at the far end of the transfer arc, the arc its
   trail: the arc is the ship's orbit, and fades behind it like any other. */

const size = 220;
const half = size / 2;
type Pt = [number, number];

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
function Ship({
  at,
  heading,
  label,
}: {
  at: Pt;
  heading: Pt;
  label: { at: Pt; anchor: "start" | "end" };
}) {
  const a = (Math.atan2(heading[1], heading[0]) * 180) / Math.PI + 90;
  return (
    <g>
      <g transform={`translate(${at[0]} ${at[1]}) rotate(${a})`}>
        <polygon
          points="0,-7 3.5,-1 3.5,4 -3.5,4 -3.5,-1"
          fill={C.paper}
          stroke={C.ink}
          strokeWidth={0.75}
        />
        <rect x={-4.5} y={4} width={9} height={2} fill={C.amber} />
      </g>
      <text
        className="note"
        paintOrder="stroke"
        stroke={C.panel}
        strokeWidth={3}
        strokeLinejoin="round"
        x={label.at[0]}
        y={label.at[1]}
        fill={C.paper}
        textAnchor={label.anchor}
      >
        Ship
      </text>
    </g>
  );
}

/* A name beside a point, on the side with room: away from the centre, but
   flipped to the inner side near the edge, where the first draft lost
   "Kerbol" and "Duna at launch" to the frame. */
const beside = (
  q: Pt,
  dy = 4,
  text = "Ship",
  inwardDy = 14,
): { at: Pt; anchor: "start" | "end" } => {
  const right = q[0] >= half;
  /* Outward if the name fits between the point and the frame; a note-role
     glyph is about six pixels. */
  const width = 6.3 * text.length + 9;
  const outward = right ? q[0] + width <= size - 2 : q[0] - width >= 2;
  const anchor = right === outward ? "start" : "end";
  /* Flipped inward, the name drops under the point rather than running
     back over whatever the point stands beside. */
  const y = outward || dy < 0 ? q[1] + dy : q[1] + inwardDy;
  return {
    at: [
      q[0] + (anchor === "start" ? 7 : -7),
      Math.min(size - 4, Math.max(10, y)),
    ],
    anchor,
  };
};
/* A name under a point near the frame's edge, kept inside it — Kerbol's,
   placed as it is in the Sun's-system drawing. */
const below = (q: Pt): Pt => [
  Math.min(size - 24, Math.max(24, q[0])),
  Math.min(size - 4, q[1] + 17),
];

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
  const sunDir: Pt = [-w.r1[0], -w.r1[1]];
  const sn = Math.hypot(sunDir[0], sunDir[1]) || 1;
  const sun = P((sunDir[0] / sn) * 80, (sunDir[1] / sn) * 80);
  const sunLabel = below(sun);
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
  const label = P(Math.cos(mid) * (ra + 14), Math.sin(mid) * (ra + 14));
  const refEnd = P(ref[0] * rp, ref[1] * rp);
  /* Prograde is up by construction of `turn`. */
  const top: Pt = [half, half - rp - 8],
    tip: Pt = [half, half - rp - 30];
  const shipLabel = beside(burn, burn[1] > half ? 14 : -8);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: "block", color: C.paper }}
      role="img"
      aria-label={`Leaving ${bodyLabel(w.from)}: the ship on its parking orbit at the burn, ${fmt(w.eject)} m/s at ${deg(w.angle)} from ${w.ref}, the escape leaving towards ${bodyLabel(w.to)}; Kerbol's direction marked.`}
    >
      {/* The Sun's direction, at the edge. */}
      <line
        x1={half}
        y1={half}
        x2={sun[0]}
        y2={sun[1]}
        stroke={C.rule}
        strokeDasharray="2 4"
      />
      <circle cx={sun[0]} cy={sun[1]} r={5} fill={hueFor("Sun", theme)} />
      <Name at={sunLabel} text="Kerbol" color={C.dim} anchor="middle" />
      {/* The parking orbit, fading behind the ship, and the body. */}
      <Trail pts={ring} at={0} color={hue} />
      <circle cx={half} cy={half} r={Rb} fill={hue} fillOpacity={0.9} />
      <Name
        at={[half, half + 4]}
        text={bodyLabel(w.from)}
        color={inkOn(hue)}
        anchor="middle"
        halo={false}
      />
      {/* Prograde, up. */}
      <line x1={top[0]} y1={top[1]} x2={tip[0]} y2={tip[1]} stroke={C.dim} />
      <polygon
        points={`${tip[0]},${tip[1] - 5} ${tip[0] - 4},${tip[1] + 3} ${tip[0] + 4},${tip[1] + 3}`}
        fill={C.dim}
      />
      <Name at={[tip[0] + 7, tip[1] + 4]} text="prograde" color={C.dim} />
      {/* The escape, planned: dashed, as the map draws it. */}
      <path
        d={hyper
          .map(
            (q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`,
          )
          .join(" ")}
        fill="none"
        stroke={ink}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      {/* The angle round to the burn: a ray to each of its two points — the
          reference direction on the parking orbit and the burn — and the
          arc between them. */}
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
      <path
        d={arc
          .map(
            (q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`,
          )
          .join(" ")}
        fill="none"
        stroke={C.dim}
        strokeDasharray="3 3"
      />
      <text
        className="note"
        paintOrder="stroke"
        stroke={C.panel}
        strokeWidth={3}
        strokeLinejoin="round"
        x={label[0]}
        y={label[1]}
        fill={C.paper}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {deg(w.angle)}
      </text>
      <Ship at={burn} heading={heading} label={shipLabel} />
    </svg>
  );
}

function Heliocentric({ w, theme }: { w: Window; theme: Theme }) {
  const hue1 = hueFor(w.from, theme),
    hue2 = hueFor(w.to, theme);
  const o1 = orbitPoints(w.from, 120).map((q) => [q[0], q[1]] as Pt);
  const o2 = orbitPoints(w.to, 120).map((q) => [q[0], q[1]] as Pt);
  const far = Math.max(
    ...[...o1, ...o2, ...w.arc].map((q) => Math.hypot(q[0], q[1])),
  );
  const k = 84 / far;
  /* Turned so the body being left lies to the right of Kerbol, on the
     horizontal; the phase angle then opens counter-clockwise from there to
     the body being gone to, the way it is measured. */
  const th = -Math.atan2(w.r1[1], w.r1[0]);
  const ct = Math.cos(th),
    st = Math.sin(th);
  const P = (q: Pt): Pt => [
    half + (q[0] * ct - q[1] * st) * k,
    half - (q[0] * st + q[1] * ct) * k,
  ];
  /* Where each body is along its sampled orbit: the nearest sample. */
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
  const a0 = 0; // the body being left is on the horizontal, by the turn above
  const ra = 22;
  const arc: Array<Pt> = [];
  for (let i = 0; i <= 24; i++) {
    const a = a0 + ((w.phase * Math.PI) / 180) * (i / 24);
    arc.push([half + Math.cos(a) * ra, half - Math.sin(a) * ra]);
  }
  const mid = a0 + (w.phase * Math.PI) / 180 / 2;
  const label: Pt = [
    half + Math.cos(mid) * (ra + 12),
    half - Math.sin(mid) * (ra + 12),
  ];
  const from = P(w.r1),
    toDep = P(w.r2dep),
    toArr = P(w.r2);
  const trail = w.arc.map(P);
  const last = trail[trail.length - 1],
    prev = trail[trail.length - 2];
  const heading: Pt = [last[0] - prev[0], last[1] - prev[1]];
  /* The ship a little short of the body it arrives at, so both are seen. */
  const hn = Math.hypot(heading[0], heading[1]) || 1;
  const ship: Pt = [
    last[0] - (heading[0] / hn) * 9,
    last[1] - (heading[1] / hn) * 9,
  ];
  const l1 = beside(toDep, 4, `${bodyLabel(w.to)} at launch`),
    l2 = beside(toArr, 14, bodyLabel(w.to)),
    /* The body being left sits on the horizontal with Kerbol's name to its
       left; flipped inward its own name goes over it, not under. */
    l3 = beside(from, 4, bodyLabel(w.from), -8),
    l4 = beside(ship, -7);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: "block", color: C.paper }}
      role="img"
      aria-label={`About Kerbol: ${bodyLabel(w.from)} and ${bodyLabel(w.to)} at departure, ${deg(w.phase)} apart, and the ship at the end of its transfer arc where ${bodyLabel(w.to)} will be on arrival.`}
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
      {/* The phase angle: a ray from Kerbol to each body at departure, and
          the arc between them. */}
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
      <path
        d={arc
          .map(
            (q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`,
          )
          .join(" ")}
        fill="none"
        stroke={C.dim}
        strokeDasharray="3 3"
      />
      <text
        className="note"
        paintOrder="stroke"
        stroke={C.panel}
        strokeWidth={3}
        strokeLinejoin="round"
        x={label[0]}
        y={label[1]}
        fill={C.paper}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {deg(w.phase)}
      </text>
      <circle cx={half} cy={half} r={5} fill={hueFor("Sun", theme)} />
      <Name
        at={[half, half + 17]}
        text="Kerbol"
        color={C.dim}
        anchor="middle"
      />
      <circle
        cx={toDep[0]}
        cy={toDep[1]}
        r={4}
        fill="none"
        stroke={hue2}
        strokeWidth={1.5}
      />
      <Name
        at={l1.at}
        text={`${bodyLabel(w.to)} at launch`}
        color={edgeOf(hue2, theme)}
        anchor={l1.anchor}
      />
      <circle cx={toArr[0]} cy={toArr[1]} r={4} fill={hue2} />
      <Name
        at={l2.at}
        text={bodyLabel(w.to)}
        color={edgeOf(hue2, theme)}
        anchor={l2.anchor}
      />
      <circle cx={from[0]} cy={from[1]} r={4} fill={hue1} />
      <Name
        at={l3.at}
        text={bodyLabel(w.from)}
        color={edgeOf(hue1, theme)}
        anchor={l3.anchor}
      />
      <Ship at={ship} heading={heading} label={l4} />
    </svg>
  );
}

/* The card: the two drawings side by side where there is room, the
   numbers under them. `captured` says whether the route burns into orbit
   at the far end; a fly-by does not. */
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
            About Kerbol at departure, the ship on arrival
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
          value={`${fmt(w.ejectPro)} · ${fmt(Math.abs(w.ejectNor))}`}
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
