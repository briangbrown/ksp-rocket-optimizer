import { fmt, hms } from "../format.js";
import { C, RADIUS, SPACE } from "../tokens.js";
import { Callout, Stat } from "./primitives.jsx";
import type { CSSProperties } from "react";
import type { Vehicle, Turn } from "../../core/ascent.js";

/* A flown ascent as the panel needs it: what the simulator returned, the
   vehicle that flew it, and where from. A design that cannot reach orbit is
   worth saying out loud, which is why the failure is a variant of this rather
   than a null. */
type Ascent =
  | (Turn & { veh: Vehicle; bodyName: string; target: number })
  | { ok: false; veh: Vehicle; bodyName: string; target: number };

/* The one sentence a pilot needs under the profile table. The rest of what
   the table used to say beneath itself is `FLYING_IT`, disclosed. */
const FLY_THE_CLOCK =
  "Fly the clock, not the altimeter, and hold the circularisation burn level — 0° on the navball.";

/* How to read the profile table, at the length it used to run to under it. */
const FLYING_IT =
  "Pitch is degrees above the horizon on the navball, flying east. A shallow " +
  "upper stage will level off and may nose slightly below the horizon while it " +
  "builds horizontal speed, so altitude stops rising monotonically near the end " +
  "and is a poor thing to steer by. If you are slow at a given time you are " +
  "climbing too steeply: pitch further down rather than waiting for prograde to " +
  "come to you. After cutoff there is nothing to fly until apoapsis; start the " +
  "circularisation half its duration early so it straddles the mark. Hold that " +
  "burn level rather than on prograde: a long circularisation lifts you as it " +
  "runs, so prograde tilts upward and following it pushes apoapsis ahead of you " +
  "instead of raising periapsis behind you. Level is the attitude that closes " +
  "the orbit. The circularisation figure assumes you arrive at apoapsis on this " +
  "profile — a few hundred m/s short there costs far more than that to fix.";

/* What the simulator did to get a flight, for the disclosure at the foot of
   the section. The atmosphere line is the body's, so it is one paragraph per
   flight. */
const methodology = (a: Ascent) => {
  const atm = (a.veh.atmo.p(0) / 101.325).toFixed(2);
  return (
    `Simulated from ${a.bodyName}: the atmosphere is its own stock pressure and ` +
    `temperature spline — ${atm} atm at the surface — and density and speed of ` +
    "sound fall straight out of it with nothing fitted. Isp follows a three-key " +
    "curve pinned to each engine's vacuum and sea-level figures. Drag takes the " +
    "widest cross-section still attached plus any live boosters, on the stock " +
    "transonic Cd hump — that part is an approximation, since the game bakes " +
    "drag cubes per part and occludes them by how you stack."
  );
};

/* The whole point of simulating is to hand back something flyable, so this is a
   flight card, not a readout: five steps in the order you do them. Numbering is
   load-bearing here — it really is a sequence. */
function AscentPanel({ a, color }: { a: Ascent; color: string }) {
  const atm = (a.veh.atmo.p(0) / 101.325).toFixed(2);
  if (!a.ok) {
    const m0 =
      a.veh.stages.reduce(
        (t, x) => t + x.wet + (x.boosters ? x.boosters.n * x.boosters.wet : 0),
        0,
      ) + a.veh.payload;
    return (
      <Callout
        severity="bad"
        title={`This design never reaches orbit from ${a.bodyName}.`}
        more={
          <>
            The stages above were sized on vacuum Isp, but {a.bodyName} sits at{" "}
            {atm} atm on the surface, where engines deliver a fraction of their
            rated thrust and efficiency. The Δv map figure already assumes
            losses the rocket equation on its own cannot see. Add stages, choose
            engines with a flatter Isp curve, or expect a far heavier vehicle
            than the parts list suggests.
          </>
        }
      >
        No pitch programme gets {fmt(m0, 1)} t up to{" "}
        {Math.round(a.target / 1000)} km.
      </Callout>
    );
  }
  const handed = a.handT >= 0;
  const hot = a.maxQ > 40000;
  /* Named as numbers rather than as truthiness, so the throttle settings below
     can be read without asking again whether they are there. */
  const limit = a.limit ?? 1;
  const core = a.core ?? 1;
  /* Null where no stage was still live to circularise on. */
  const circBurn = a.circBurn ?? 0;
  const limited = limit < 0.999;
  const cored = core < 0.999;
  /* TWR of the stage that has to finish the job, at the moment it lights. Below
     1.0 the ascent is unforgiving and the flight card should say so. */
  /* The two numbers side by side: what this flight costs, and what the rocket
     has. They used to be a map estimate and a simulated cost with nothing tying
     them together, so a vehicle built to 3 740 could sit next to a 4 062 flight
     and look fine. */
  const lowUpper = (() => {
    const st = a.veh && a.veh.stages[a.veh.stages.length - 1];
    if (!st) return null;
    const m = st.wet + a.veh.payload;
    const twr = (st.mdot * st.isp(0) * 9.80665) / (m * a.veh.body.g0);
    return twr < 1 ? twr : null;
  })();
  const limitOn =
    a.veh.stages[0] && a.veh.stages[0].boosters
      ? "the boosters"
      : "the first stage";
  const steps = [
    ...(limited
      ? [
          [
            `Set ${limitOn} to ${Math.round(limit * 100)}% thrust`,
            "in the VAB, before you launch",
          ],
        ]
      : []),
    ...(cored
      ? [
          [
            `Fly the core at ${Math.round(core * 100)}% throttle`,
            "boosters stay at full — they cannot be throttled",
          ],
        ]
      : []),
    [
      a.bodyName === "Kerbin"
        ? "Full throttle, release the clamps"
        : "Full throttle, lift off",
      "straight up, SAS on",
    ],
    [`At ${a.vKick} m/s, pitch ${a.kick}° east`, "then hold that attitude"],
    handed
      ? [
          `Hold it until T+${hms(a.handT)}`,
          `the prograde marker rises to meet your nose at ~${Math.round(a.handV)} m/s, ${(a.handAlt / 1000).toFixed(1)} km — switch SAS to prograde then`,
        ]
      : [
          "Hold that attitude all the way up",
          "prograde never catches your nose on this one",
        ],
    /* The achieved apoapsis, not the target — drag on the way out of the air
       costs some of it — and the time the engine actually stops, not the moment
       the integration hands over to the coast. */
    [
      `Cut engines at T+${hms(a.tMeco != null ? a.tMeco : a.t)}`,
      `apoapsis will settle at ${(a.apo / 1000).toFixed(1)} km`,
    ],
    [
      `Coast ${
        a.tApo != null && a.tMeco != null ? hms(a.tApo - a.tMeco) : ""
      } to apoapsis`,
      a.tApo
        ? `apoapsis at T+${hms(a.tApo)} — warp through it`
        : "nothing to fly",
    ],
    [
      `Circularise with ${fmt(a.circ)} m/s, held level`,
      a.circBurn
        ? a.circBurn < 4
          ? `a ${a.circBurn.toFixed(1)} second tap right on the mark`
          : `${hms(a.circBurn)} of burn — start it ${hms(a.circBurn / 2)} early so it straddles apoapsis`
        : "circularised",
    ],
  ];
  /* The steps are the stylesheet's — `.steps` — since they are laid out
     twice over. On the phone each is a box with its number beside the words:
     a step is a line or two, and the phone stacks seven of them. On a wide
     screen the seven are one row, a numbered timeline with a line joining
     the numbers, which is what a sequence looks like when there is room to
     show one; `--n` is how many across, and `--accent` lights the two steps
     that are the launch. #137 */
  return (
    <div>
      <div
        className="steps"
        style={{ "--n": steps.length, "--accent": color } as CSSProperties}
      >
        {steps.map(([main, sub], i) => (
          <div
            key={i}
            className="step"
            data-hot={i === 1 || i === 2 ? "1" : undefined}
          >
            <div className="label step-n">{i + 1}</div>
            <div>
              <div className="body" style={{ marginBottom: 2 }}>
                {main}
              </div>
              <div className="note">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* As many across as fit at a figure's width. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
          gap: `${SPACE.md}px ${SPACE.lg}px`,
          marginBottom: hot ? 12 : 0,
        }}
      >
        <Stat
          label="Ascent costs"
          value={fmt(a.total)}
          unit="m/s"
          color={color}
        />
        {a.carried != null && (
          <Stat
            label="Vehicle carries"
            value={fmt(a.carried)}
            unit="m/s"
            color={a.carried >= a.total ? C.mint : C.rust}
          />
        )}
        <Stat label="Gravity loss" value={fmt(a.gLoss)} unit="m/s" small />
        <Stat label="Drag loss" value={fmt(a.dLoss)} unit="m/s" small />
        <Stat label="Steering loss" value={fmt(a.sLoss)} unit="m/s" small />
        <Stat
          label="Max Q"
          value={(a.maxQ / 1000).toFixed(1)}
          unit={`kPa at ${(a.maxQalt / 1000).toFixed(1)} km`}
          small
        />
        <Stat label="Peak Mach" value={a.maxMach.toFixed(2)} unit="" small />
      </div>

      {circBurn > 90 && (
        <Callout
          severity="info"
          title={`That circularisation runs ${Math.round(circBurn)} s on a low-thrust stage.`}
          style={{ marginBottom: SPACE.lg }}
          more="Centring it still helps, but over a burn that long the apoapsis drifts while you push."
        >
          Expect to arrive slightly elliptical and trim it on the next pass.
        </Callout>
      )}
      {a.circShort && (
        <Callout severity="warn" style={{ marginBottom: SPACE.lg }}>
          The stage that reaches orbit runs dry partway through this burn — the
          timing above assumes it continues on the stage above.
        </Callout>
      )}
      {a.marks && a.marks.length > 2 && (
        <div
          style={{
            border: `1px solid ${C.rule}`,
            borderRadius: RADIUS.sm,
            padding: 11,
            marginBottom: SPACE.lg,
          }}
        >
          <div className="label" style={{ marginBottom: 7 }}>
            Fly this profile
          </div>
          {/* Four figures a row, and a row is one line: at 390 px the widest
              — a time, a pitch, a speed and an altitude — is 27 characters
              of the figure face, which fits with the cutoff and apoapsis
              tags on a line of their own under the time. The cells' padding
              is the stylesheet's. #136 */}
          <table
            className="profile"
            style={{ width: "100%", borderCollapse: "collapse" }}
          >
            <thead>
              <tr className="label">
                <th style={{ textAlign: "left" }}>T+</th>
                <th style={{ textAlign: "right" }}>Pitch</th>
                <th style={{ textAlign: "right" }}>Speed</th>
                <th style={{ textAlign: "right" }}>Altitude</th>
              </tr>
            </thead>
            <tbody className="figure">
              {a.marks.map((w, i) => (
                <tr
                  key={i}
                  style={{
                    borderTop:
                      w.meco || w.apoMark ? `1px solid ${C.rule}` : "none",
                  }}
                >
                  <td
                    style={{
                      color: w.meco || w.apoMark ? color : C.paper,
                    }}
                  >
                    {hms(w.t)}
                    {(w.meco || w.apoMark) && (
                      <span style={{ display: "block", color: C.dim }}>
                        {w.meco ? "cutoff" : "apoapsis"}
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      color: w.coast ? C.dim : color,
                      fontWeight: w.coast ? 400 : 600,
                    }}
                  >
                    {w.apoMark
                      ? "burn level"
                      : w.coast
                        ? "coast"
                        : (w.nav ?? 0) >= 0
                          ? `${w.nav ?? 0}° up`
                          : `${-(w.nav ?? 0)}° down`}
                  </td>
                  <td style={{ textAlign: "right", color: C.muted }}>
                    {w.v} m/s
                  </td>
                  <td style={{ textAlign: "right", color: C.dim }}>
                    {(w.h / 1000).toFixed(1)} km
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="note" style={{ color: C.dim, marginTop: SPACE.md }}>
            {FLY_THE_CLOCK}
          </div>
        </div>
      )}
      {lowUpper && (
        <Callout
          severity="warn"
          title="Upper stage cannot hover."
          style={{ marginBottom: SPACE.lg }}
          more={`It lights at TWR ${lowUpper.toFixed(2)}, so it will not hold altitude pointed upward. If you keep following prograde while still climbing steeply it will bleed the whole stage climbing and arrive at apoapsis far too slow to circularise.`}
        >
          Fly it nearly level to build speed.
        </Callout>
      )}
      {cored && (
        <Callout
          severity="good"
          title={`Hold the core at ${Math.round(core * 100)}% until the boosters burn out.`}
          style={{ marginBottom: SPACE.lg }}
          more="Solids have no shutdown, so at full throttle this stack carries its apoapsis well past the mark before you can stop it. Throttling the liquid core lands the two together."
        >
          Worth about {fmt(Math.round((a.fullThrottle || 0) - a.total))} m/s.
        </Callout>
      )}
      {limited && (
        <Callout
          severity="good"
          title={`Throttled to ${Math.round(limit * 100)}% on ${limitOn}.`}
          style={{ marginBottom: SPACE.lg }}
          more="At full thrust this stack passes 40 kPa, where a real one tends to flip or shed parts. The limiter cuts fuel flow with the thrust, so the stage simply burns longer at lower thrust and loses no Δv."
        >
          Right-click the part in the VAB and drag the thrust limiter — peak is
          now {(a.maxQ / 1000).toFixed(0)} kPa.
        </Callout>
      )}
      {hot && (
        <Callout
          severity="bad"
          title={`Nothing stays under 40 kPa — peak is ${(a.maxQ / 1000).toFixed(0)} kPa at ${(a.maxQalt / 1000).toFixed(1)} km.`}
          more={
            Number(atm) > 1.5
              ? `${atm} atm at the surface makes high dynamic pressure unavoidable, and this is the gentlest trajectory that still reaches orbit. Treat the drag figure as indicative — it is well outside where the model was checked against Kerbin ascents.`
              : "This vehicle is over-thrusted for the air it climbs through, where a real stack tends to flip or shed parts."
          }
        >
          {Number(atm) > 1.5
            ? `That is ${a.bodyName} rather than your rocket.`
            : "Drop a booster, throttle the first stage back, or fly a shallower turn and accept the extra gravity loss."}
        </Callout>
      )}
    </div>
  );
}

export { AscentPanel, FLYING_IT, methodology };
export type { Ascent };
