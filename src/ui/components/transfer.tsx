import { SYS } from "../../core/orbits.js";
import { DAY, orbitPoints } from "../../core/kepler.js";
import { bodyLabel, fmt, kerbalDateLabel } from "../format.js";
import { C, SPACE } from "../tokens.js";
import { Stat } from "./primitives.jsx";
import type { Window } from "../../core/transfer.js";

/* The transfer, as the pilot flies it: when to leave, where on the parking
   orbit to burn and how hard, and where the two planets stand about the Sun
   when you do. Two drawings, top-down, and the numbers under them. Both are
   diagrams rather than renderings — SVG in the page's own tokens — and both
   are described for a reader who cannot see them.

   The departure drawing is turned so the body's direction of travel is up:
   the burn is then where the pilot looks for it, so many degrees round from
   prograde, on the night side for a transfer outward. The escape hyperbola
   leaves from the burn and the Sun's direction is marked at the edge. */

const size = 220;
const half = size / 2;

/* Rotate the ecliptic frame so `up` points up the page; SVG's y runs down. */
const turn = (up: [number, number]) => {
  const th = Math.PI / 2 - Math.atan2(up[1], up[0]);
  const c = Math.cos(th),
    s = Math.sin(th);
  return (x: number, y: number): [number, number] => [
    half + (x * c - y * s),
    half - (x * s + y * c),
  ];
};
const path = (pts: Array<[number, number]>) =>
  pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
const deg = (x: number) => `${Math.round(x)}°`;

function Departure({ w, color }: { w: Window; color: string }) {
  const rp = 62; // the parking orbit, in px
  const k = rp / w.rPark;
  const Rb = Math.max(5, SYS[w.from].R * k);
  const P = turn(w.vDir);
  const burn = P(w.burnDir[0] * rp, w.burnDir[1] * rp);
  const sunDir: [number, number] = [-w.r1[0], -w.r1[1]];
  const sn = Math.hypot(sunDir[0], sunDir[1]) || 1;
  const sun = P((sunDir[0] / sn) * 96, (sunDir[1] / sn) * 96);
  /* The hyperbola out of the burn: r = p / (1 + e·cos ν), ν from periapsis
     towards the asymptote, drawn while it fits the box. */
  const e =
    1 +
    (w.rPark * w.vinfOut ** 2) /
      (SYS[w.from].gee * 9.80665 * SYS[w.from].R ** 2);
  const p = w.rPark * (1 + e);
  const thInf = Math.acos(-1 / e);
  const hyper: Array<[number, number]> = [];
  for (let i = 0; i <= 60; i++) {
    const nu = ((thInf - 0.02) * i) / 60;
    const r = (p / (1 + e * Math.cos(nu))) * k;
    if (r > 150) break;
    const c = Math.cos(nu),
      s = Math.sin(nu);
    const d: [number, number] = [
      w.burnDir[0] * c - w.burnDir[1] * s,
      w.burnDir[0] * s + w.burnDir[1] * c,
    ];
    hyper.push(P(d[0] * r, d[1] * r));
  }
  /* The angle from the reference direction to the burn, the short way. */
  const ref: [number, number] =
    w.ref === "prograde" ? w.vDir : [-w.vDir[0], -w.vDir[1]];
  const a0 = Math.atan2(ref[1], ref[0]);
  const a1 = Math.atan2(w.burnDir[1], w.burnDir[0]);
  let sweep = a1 - a0;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const ra = rp * 0.42;
  const arc: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    const a = a0 + (sweep * i) / 24;
    arc.push(P(Math.cos(a) * ra, Math.sin(a) * ra));
  }
  const mid = a0 + sweep / 2;
  const label = P(Math.cos(mid) * (ra + 14), Math.sin(mid) * (ra + 14));
  /* Prograde is up by construction of `turn`, so the arrow is drawn there
     rather than rotated — the first draft rotated an unrotated point. */
  const top: [number, number] = [half, half - rp - 8],
    tip: [number, number] = [half, half - rp - 30];
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: "block", color: C.paper }}
      role="img"
      aria-label={`Leaving ${bodyLabel(w.from)}: burn ${fmt(w.eject)} m/s at ${deg(w.angle)} from ${w.ref} on the parking orbit, the escape leaving towards ${bodyLabel(w.to)}.`}
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
      <text
        className="note"
        x={sun[0]}
        y={sun[1]}
        fill={C.dim}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        ☉
      </text>
      {/* The parking orbit and the body. */}
      <circle cx={half} cy={half} r={rp} fill="none" stroke={C.edge} />
      <circle cx={half} cy={half} r={Rb} fill={C.panel2} stroke={C.edge} />
      {/* Prograde, up. */}
      <line x1={top[0]} y1={top[1]} x2={tip[0]} y2={tip[1]} stroke={C.dim} />
      <polygon
        points={`${tip[0]},${tip[1] - 5} ${tip[0] - 4},${tip[1] + 3} ${tip[0] + 4},${tip[1] + 3}`}
        fill={C.dim}
      />
      <text className="note" x={tip[0] + 7} y={tip[1] + 4} fill={C.dim}>
        prograde
      </text>
      {/* The escape. */}
      <path d={path(hyper)} fill="none" stroke={color} strokeWidth={1.5} />
      {/* The angle round to the burn, and the burn. */}
      <path d={path(arc)} fill="none" stroke={C.dim} strokeDasharray="3 3" />
      <text
        className="note"
        x={label[0]}
        y={label[1]}
        fill={C.paper}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {deg(w.angle)}
      </text>
      <circle cx={burn[0]} cy={burn[1]} r={4.5} fill={color} />
    </svg>
  );
}

function Heliocentric({ w, color }: { w: Window; color: string }) {
  const o1 = orbitPoints(w.from, 120).map(
    (p) => [p[0], p[1]] as [number, number],
  );
  const o2 = orbitPoints(w.to, 120).map(
    (p) => [p[0], p[1]] as [number, number],
  );
  const far = Math.max(
    ...[...o1, ...o2, ...w.arc].map((p) => Math.hypot(p[0], p[1])),
  );
  const k = 98 / far;
  const P = (p: [number, number]): [number, number] => [
    half + p[0] * k,
    half - p[1] * k,
  ];
  const a0 = Math.atan2(w.r1[1], w.r1[0]);
  const ra = 22;
  const arc: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    const a = a0 + ((w.phase * Math.PI) / 180) * (i / 24);
    arc.push([half + Math.cos(a) * ra, half - Math.sin(a) * ra]);
  }
  const mid = a0 + (w.phase * Math.PI) / 180 / 2;
  const label: [number, number] = [
    half + Math.cos(mid) * (ra + 12),
    half - Math.sin(mid) * (ra + 12),
  ];
  const from = P(w.r1),
    toDep = P(w.r2dep),
    toArr = P(w.r2);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: "block", color: C.paper }}
      role="img"
      aria-label={`About Kerbol: ${bodyLabel(w.from)} and ${bodyLabel(w.to)} at departure, ${deg(w.phase)} apart, and the transfer arc to where ${bodyLabel(w.to)} will be.`}
    >
      <path d={path(o1.map(P))} fill="none" stroke={C.rule} />
      <path d={path(o2.map(P))} fill="none" stroke={C.rule} />
      <path
        d={path(w.arc.map(P))}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      <path d={path(arc)} fill="none" stroke={C.dim} strokeDasharray="3 3" />
      <text
        className="note"
        x={label[0]}
        y={label[1]}
        fill={C.paper}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {deg(w.phase)}
      </text>
      <circle cx={half} cy={half} r={5} fill={C.amber} />
      <circle cx={toDep[0]} cy={toDep[1]} r={4} fill="none" stroke={C.paper} />
      <circle cx={toArr[0]} cy={toArr[1]} r={4} fill={C.paper} />
      <circle cx={from[0]} cy={from[1]} r={4} fill={color} />
    </svg>
  );
}

/* The card: the two drawings side by side where there is room, the
   numbers under them. `captured` says whether the route burns into orbit
   at the far end; a fly-by does not. */
function TransferPanel({
  w,
  color,
  captured,
}: {
  w: Window;
  color: string;
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
          <Departure w={w} color={color} />
          <div className="note" style={{ textAlign: "center" }}>
            Leaving {bodyLabel(w.from)}
          </div>
        </div>
        <div style={{ flex: "1 1 200px", maxWidth: size }}>
          <Heliocentric w={w} color={color} />
          <div className="note" style={{ textAlign: "center" }}>
            About Kerbol at departure
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
        <Stat small label="Phase angle" value={deg(w.phase)} />
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
