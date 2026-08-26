import { fmt } from "../format.js";
import { C, SYSTEMS, edgeOf, hueFor, inkOn } from "../tokens.js";

function RouteMap({ route, cuts, onToggle, color, stages, onPlaneMode }) {
  /* Which stage actually falls away at a cut. Every solved stage carries the route
     index its segment starts at, so the count through a cut is just the stages
     whose segment began at or before it. The label used to read off the cut's own
     ordinal, so the first cut always claimed "stage 1" even when four stages had
     already burned. */
  const stagesThrough = (i) => stages.filter((s) => s.sol && s.key <= i).length;
  const shown = route.filter((l) => !l.free);
  const rows = [...route].reverse();
  const cutIdx = [...cuts].sort((a, b) => a - b);

  return (
    <div>
      {rows.map((leg, ri) => {
        const i = route.length - 1 - ri;
        const last = i === shown.length - 1;
        const isCut = cuts.has(i);
        return (
          <div key={i}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "26px 1fr auto",
                gap: 10,
                alignItems: "center",
                minHeight: 34,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  position: "relative",
                  height: 34,
                }}
              >
                <div
                  style={{
                    width: 3,
                    background: leg.free ? C.rule : color,
                    height: "100%",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    background: C.ink,
                    border: `3px solid ${leg.free ? C.rule : color}`,
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.3,
                  color: leg.free ? C.dim : C.paper,
                }}
              >
                {leg.label}
                {leg.chuted && (
                  <span style={{ color: C.mint, fontSize: 10 }}> · chutes</span>
                )}
                {/* The one leg whose cost is a choice rather than a number: pay it
                    in Δv now, or in waiting for a launch window. */}
                {leg.kind === "plane" && leg.cheap < leg.costly && (
                  <button
                    className="chip"
                    onClick={() => onPlaneMode(!leg.planeNow)}
                    style={{ marginLeft: 8, fontSize: 10, padding: "1px 7px" }}
                    title={
                      leg.planeNow
                        ? "Switch to timing the encounter at a node — far cheaper, but you wait for the window"
                        : "Switch to burning it out of low orbit — costs more, goes whenever you like"
                    }
                  >
                    {leg.planeNow ? "burning it now" : "timed at a node"}
                  </button>
                )}
                {leg.note && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {leg.note}
                  </div>
                )}
              </div>
              <div
                className="mono"
                style={{ fontSize: 13, color: leg.free ? C.dim : C.paper }}
              >
                {leg.dv === 0 ? "free" : `${fmt(leg.dv)}`}
              </div>
            </div>
            {!leg.free && !last && (
              <button
                onClick={() => onToggle(i)}
                aria-label={
                  isCut ? "Remove staging event" : "Add staging event"
                }
                style={{
                  display: "grid",
                  gridTemplateColumns: "26px 1fr",
                  gap: 10,
                  width: "100%",
                  alignItems: "center",
                  padding: "2px 0",
                }}
              >
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <div
                    style={{
                      width: isCut ? 22 : 3,
                      height: isCut ? 3 : 12,
                      background: isCut ? C.amber : color,
                      transition: ".15s",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: ".14em",
                    textTransform: "uppercase",
                    color: isCut ? C.amber : C.rule,
                    fontFamily: "'IBM Plex Mono',monospace",
                    textAlign: "left",
                  }}
                >
                  {isCut
                    ? stagesThrough(i)
                      ? `▲ stage ${stagesThrough(i)} separates`
                      : "▲ separates here"
                    : "cut here"}
                </div>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BodyPicker({ options, value, onPick, color }) {
  // DEST calls it "Jool orbit" where SYS calls it "Jool", so match loosely
  const find = (b) => options.find((o) => o === b || o.startsWith(b + " "));
  const named = new Set();
  SYSTEMS.forEach(([pl, ms]) =>
    [pl, ...ms].forEach((b) => {
      const o = find(b);
      if (o) named.add(o);
    }),
  );
  const extras = options.filter((o) => !named.has(o));

  const planetBtn = (b, on, live) => {
    const h = hueFor(b);
    return {
      padding: "7px 11px",
      borderRadius: 3,
      minWidth: 84,
      textAlign: "left",
      fontFamily: "inherit",
      fontSize: 14.5,
      fontWeight: 650,
      letterSpacing: "-0.01em",
      cursor: live ? "pointer" : "default",
      opacity: live ? 1 : 0.4,
      background: on ? h : C.panel2,
      color: on ? inkOn(h) : C.paper,
      border: `1.5px solid ${on ? h : edgeOf(h)}`,
    };
  };
  const moonBtn = (b, on) => {
    const h = hueFor(b);
    return {
      padding: "3px 9px",
      borderRadius: 3,
      fontFamily: "inherit",
      fontSize: 11.5,
      fontWeight: 400,
      cursor: "pointer",
      background: on ? h : "transparent",
      color: on ? inkOn(h) : C.muted,
      border: `1px solid ${on ? h : edgeOf(h)}`,
    };
  };

  return (
    <div style={{ display: "grid", gap: 4 }}>
      {extras.length > 0 && (
        <div
          style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}
        >
          {extras.map((o) => (
            <button
              key={o}
              className="chip"
              data-on={o === value ? 1 : 0}
              onClick={() => onPick(o)}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {SYSTEMS.map(([pl, ms]) => {
        const po = find(pl),
          mo = ms.map((b) => [b, find(b)]).filter(([, o]) => o);
        if (!po && !mo.length) return null;
        return (
          <div
            key={pl}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 7,
              flexWrap: "nowrap",
            }}
          >
            <button
              style={{ ...planetBtn(pl, po === value, !!po), flexShrink: 0 }}
              onClick={() => po && onPick(po)}
              disabled={!po}
            >
              {pl}
            </button>
            {mo.length > 0 && (
              <>
                <span style={{ color: C.rule, fontSize: 12, marginTop: 7 }}>
                  ─
                </span>
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    flexWrap: "wrap",
                    flex: 1,
                    minWidth: 0,
                    marginTop: 4,
                  }}
                >
                  {mo.map(([b, o]) => (
                    <button
                      key={b}
                      style={moonBtn(b, o === value)}
                      onClick={() => onPick(o)}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { BodyPicker, RouteMap };
