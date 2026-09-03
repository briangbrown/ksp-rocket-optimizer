import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Maximize, Minimize, Pause, Play } from "lucide-react";

import { payloadDiaOf, stackGeometry } from "../../core/geometry.js";
import { extentOf, modelOf } from "../../core/model.js";
import { framing, panelSizes } from "../views.js";
import { pose, separation } from "../separation.js";
import { C, FONT, RADIUS, SPACE, Z } from "../tokens.js";
import type { Theme } from "../tokens.js";
import { Choice, IconButton, Toggle } from "./primitives.jsx";
import type { ReactNode } from "react";
import type { PlanStage } from "../../core/plan.js";
import type { Solution } from "../../core/solution.js";

/* A stage the solver actually built. `stages` arrives with the unsolved ones
   still in it — a segment with no design is a row that says so — and every
   panel here works on what is left. */
type SolvedStage = PlanStage & { sol: Solution };
const isSolved = (s: PlanStage): s is SolvedStage => s.sol !== null;

/* One step of the stepper: what has been staged away, and whether what is left
   still has its boosters on. */
type Step = { label: string; drop: number; boost: boolean };

/* Loaded when the build view first draws, not with the application. three.js
   is about the size of everything else here put together, and nothing above
   this panel needs it — see #63. */
const ThreeView = lazy(() => import("./three-view.jsx"));
let webgl: boolean | null = null;
const canRender3D = () => {
  if (webgl === null)
    try {
      /* Ask whether the constructors exist before asking for a context.
         jsdom implements neither and logs a "not implemented" error for the
         call itself, which turns every suite that mounts the app into a wall
         of noise — and the answer is the same either way. */
      webgl =
        (typeof WebGL2RenderingContext !== "undefined" ||
          typeof WebGLRenderingContext !== "undefined") &&
        !!document
          .createElement("canvas")
          .getContext(
            typeof WebGL2RenderingContext !== "undefined" ? "webgl2" : "webgl",
          );
    } catch {
      webgl = false;
    }
  return webgl;
};

/* Holds the panel's space while the 3D chunk arrives, so the layout does not
   jump when it does. */
const Loading = ({ w, h }: { w: number; h: number }) => (
  <div
    style={{
      width: w,
      height: h,
      border: `1px solid ${C.rule}`,
      borderRadius: RADIUS.sm,
    }}
  />
);

/* Where there is no context to draw into. The stage stepper, the figures below
   the panels and the parts table are all still there and all still say what the
   rocket is, so this is a missing picture rather than a missing answer — which
   is why it is a line rather than a second drawing kept alive for it. #63. */
const NoWebGL = () => (
  <div
    className="body"
    style={{
      border: `1px solid ${C.rule}`,
      borderRadius: RADIUS.sm,
      padding: "18px 16px",
      color: C.muted,
      maxWidth: 460,
    }}
  >
    This browser has no WebGL, so the rocket cannot be drawn. Every part of it
    is in the stage table below.
  </div>
);

/* The steps the stepper offers. Boosters leave on a step of their own, before
   the stage that carries them, so `drop` and `boost` are separate: what has
   been staged away, and whether what is left still has its boosters on.

   Exported with `stepModels` because the model checks have to ask the build
   view what it draws rather than deriving it a second time. The walk is not a
   property of the solver — `planMission` knows nothing about a boosters-away
   step — so a test that slices the stages itself is checking a rocket the
   application never shows. #63 step 4. */
export function stagingSteps(solved: ReadonlyArray<SolvedStage>) {
  const steps: Array<Step> = [{ label: "On the pad", drop: 0, boost: true }];
  if (solved.length && solved[0].sol.boosters)
    steps.push({
      label: "Boosters away · core burns on",
      drop: 0,
      boost: false,
    });
  solved.forEach((_, i) =>
    steps.push({
      label: i === solved.length - 1 ? "Payload alone" : `Stage ${i + 1} spent`,
      drop: i + 1,
      boost: false,
    }),
  );
  return steps;
}

/* What a step draws: the whole vehicle for the elevation, and the bottom live
   stage for the plan. Boosters are filtered out once they have gone, so the
   panel is sized for the rocket on screen rather than for parts that left. */
export function stepModels(
  solved: ReadonlyArray<SolvedStage>,
  cur: Step,
  payload: number,
  payloadDia: number,
) {
  const live = solved.slice(cur.drop);
  const payD = payloadDiaOf(payload, payloadDia);
  const attached = (p: { ring?: number }) => cur.boost || p.ring === undefined;
  return {
    live,
    model: modelOf(live, payload, payD).filter(attached),
    planModel: modelOf(live.slice(0, 1), payload, payD).filter(attached),
  };
}

/* ------------------------------- the build view -------------------------------

   Layout constants, all in CSS pixels. */
/* Wide enough for the longest step label — "Boosters away · core burns on" —
   to stand on one line, so the rail reads as a list rather than a ragged
   column of one- and two-line chips. */
const RAIL = 200;
const GAP = 22;
/* The header line above each of the three columns, which is what makes their
   labels share one. */
const HEAD = 22;
/* How tall the drawings stand when this is not full screen: what they have
   always been. Full screen is where the space is. */
const INLINE_H = 300;
/* How long one stage separation takes.

   Two paces, because the two ways of asking for one are different questions.
   Clicking a step is a way of getting to it, and the motion is there to say
   what changed — long enough to read, short enough not to be in the way.
   Pressing play is asking to watch the thing, and at twice the length the
   boosters have time to tumble clear before the camera has finished closing
   in. #105 */
const STEP_MS = 800;
const PLAY_MS = 1600;

/* Motion is a preference. The stylesheet already honours it for every
   transition in the application; a separation is the same question asked of a
   render loop. Read once, because it is a property of the person and not of
   the frame. */
let still: boolean | null = null;
const reducedMotion = () => {
  if (still === null)
    still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return still;
};

/* The container width at which the staging chips move to a rail down the left.
   Width rather than aspect ratio, because what a rail needs is horizontal room
   for itself and a phone held either way has none. #99 */
const WIDE = 640;

/* The observed size of an element.

   Width is always safe to read: the row is as wide as the card, and the
   drawings never affect that. Height is read only in full screen, where the row
   is a flex child of a column of known height — inline it would be the
   drawings' own height coming back round to size them again.

   jsdom implements no ResizeObserver, and nothing there can see this anyway:
   `canRender3D()` is false, so the panels this sizes are never built. */
function useBox() {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const watching = useRef<ResizeObserver | null>(null);
  /* A callback ref, not a `useRef` and an effect. The row it measures is
     unmounted and rebuilt somewhere else every time full screen is toggled —
     the portal is a different place in the tree — and an effect with no
     dependencies would go on watching the element that left, which reports
     nothing and sizes both panels to a pixel. React calls this with the new
     element, and with null on the way out. */
  const ref = useCallback((el: HTMLDivElement | null) => {
    watching.current?.disconnect();
    watching.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      /* The same object back where nothing moved, or every scroll of the page
         would be a re-render and a repaint of two WebGL panels. */
      setBox((was) =>
        was.w === r.width && was.h === r.height
          ? was
          : { w: r.width, h: r.height },
      );
    });
    ro.observe(el);
    watching.current = ro;
  }, []);
  return { ref, w: box.w, h: box.h };
}

type BuildViewProps = {
  stages: ReadonlyArray<PlanStage>;
  payload: number;
  payloadDia: number;
  color: string;
  theme: Theme;
  maxAspect?: number;
};

function BuildView({
  stages,
  payload,
  payloadDia,
  color,
  theme,
  maxAspect = 14,
}: BuildViewProps) {
  const solved = useMemo(() => stages.filter(isSolved), [stages]);
  const steps = useMemo(() => stagingSteps(solved), [solved]);
  /* Where the stepper has settled, and where it is going. They differ only
     while a separation is running. */
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(0);
  const [playing, setPlaying] = useState(false);
  /* The transition in flight: which pair of steps, and how far through. Null
     between them, which is every frame that is not animating. */
  const [anim, setAnim] = useState<{ a: number; t: number } | null>(null);
  /* Locked cameras, not an orbit: a schematic that moves stops being a
     drawing. The three-quarter is the one angle that shows a ring of columns
     as a ring while still reading as an elevation. #63 step 5. */
  const [angle, setAngle] = useState("side");
  const [full, setFull] = useState(false);
  const box = useBox();

  const drawn = canRender3D();
  /* Nothing to animate where nothing is drawn — jsdom takes this path, and so
     does a browser with no WebGL and anyone who has asked for less motion.
     Steps are then instant, which is what they have always been. */
  const animates = drawn && !reducedMotion();

  const last = Math.max(0, steps.length - 1);
  const from = Math.min(step, last);
  const want = Math.min(goal, last);
  const moving = from !== want;
  const back = want < from;
  /* A transition is always between neighbours; `lo` is the lower of the pair,
     and a backward step is the same one played from the far end. */
  const lo = back ? from - 1 : from;

  /* One at a time, and the next begins where the last committed — so a jump of
     several steps plays each separation in turn, which is what a launch does.
     #105 */
  useEffect(() => {
    if (!moving) {
      setPlaying(false);
      return;
    }
    if (!animates) {
      setStep(back ? from - 1 : from + 1);
      return;
    }
    setAnim({ a: lo, t: back ? 1 : 0 });
    /* Read here and deliberately not a dependency: the pace belongs to the
       transition that is running, not to the state of the button. Stopping
       mid-play changes `playing` and `goal` without changing which pair of
       steps is in flight, so this effect is not rebuilt and the separation
       finishes at the speed it began. */
    const ms = playing ? PLAY_MS : STEP_MS;
    const t0 = performance.now();
    let id = requestAnimationFrame(function tick(now: number) {
      const u = Math.min(1, (now - t0) / ms);
      setAnim({ a: lo, t: back ? 1 - u : u });
      if (u < 1) id = requestAnimationFrame(tick);
      else {
        setAnim(null);
        setStep(back ? from - 1 : from + 1);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [moving, back, lo, from, animates]);

  /* Escape leaves, and the page behind does not scroll while it is covered. */
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = had;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  /* The two models a transition runs between, and the choreography joining
     them — built once for the transition, not once a frame. `stepModels`
     returns fresh arrays every call, and handing ThreeView a new one every
     frame would have it throw away every buffer on the card to move a part a
     metre. */
  const base = anim ? anim.a : from;
  const shot = useMemo(() => {
    const A = stepModels(solved, steps[base], payload, payloadDia);
    if (!anim || base + 1 > last) return { A, B: null, sep: null };
    const B = stepModels(solved, steps[base + 1], payload, payloadDia);
    return {
      A,
      B,
      sep: separation(A.model, B.model, steps[base], steps[base + 1]),
    };
  }, [solved, steps, base, anim !== null, last, payload, payloadDia]);

  if (!solved.length) return null;

  const frame = anim && shot.sep ? pose(shot.sep, anim.t) : null;
  /* The step being entered: what the figures report and which chip is lit. The
     drawing is between two of them, and the numbers may as well lead. */
  const at = moving ? (back ? lo : lo + 1) : from;
  const model = shot.A.model;
  const live =
    frame && shot.B ? (back ? shot.A.live : shot.B.live) : shot.A.live;
  /* The plan shows the bottom live stage alone, so between two steps it is a
     different shape with nothing in common. It fades through rather than
     moving: out over the first half, swapped where nothing is on screen, back
     in over the second. */
  const planModel =
    frame && shot.B && anim
      ? anim.t < 0.5
        ? shot.A.planModel
        : shot.B.planModel
      : shot.A.planModel;
  const planFade = anim ? Math.abs(2 * anim.t - 1) : 1;

  /* Twice, over two chains. `pad` is the vehicle that leaves the pad and `now`
     is what is left at this step — the same function and the same authority,
     asked about a shorter stack. `test/model.test.ts` already asks it the
     second way and holds the drawing to the answer, so the figures under the
     panels were the only place still reporting the whole vehicle at every
     step: a 1.1 m pod read as 23.2 m tall. #101 */
  const pad = stackGeometry(stages, payload, payloadDia);
  const now = stackGeometry(live, payload, payloadDia);
  /* Nothing has staged away yet, so the two are the same chain and the same
     numbers. Boosters do not enter it either way: `stackGeometry` reports the
     core width, because boosters are gone by about 18 km and the limit judges
     what is left. */
  const whole = live.length === solved.length;
  /* Slenderness is a constraint on the stack that leaves the pad, not on a
     step of it — at "Payload alone" a per-step aspect is about 0.8:1, and a
     warning keyed to that would come off a design that breaks the limit. So
     the colour belongs to the pad's figure, and where that is not the figure
     on the line, the pad's is named beside it and takes the colour. */
  const limit = pad.ar > maxAspect ? C.amber : C.muted;
  /* Both numbers come from the model, not from a second pass over shapes this
     file pushed. They used to be reasoned back from a parts array that carried
     at most two of a stage's side columns — a side elevation cannot show a ring
     — and that is where #9 lived, and #58, and every geometry bug in this
     repository: two descriptions of one rocket.

     Sized for the view actually on screen: turned three-quarters on, a stack is
     shorter and wider than its elevation, and a panel cut for the elevation
     would leave it drawn small in the middle of it. `framing` carries no
     three.js, so asking it costs the bundle nothing. */
  const need = framing(angle, frame ? frame.extent : extentOf(model));
  const H = Math.max(0.1, need.h * 2);
  /* A floor so a very small rocket still gets a panel with room in it. */
  const wMax = Math.max(1, need.w * 2);

  /* Before the observer has reported, and in jsdom where it never will. */
  const outerW = box.w || 320;
  const railed = drawn && outerW >= WIDE;
  const aw = railed ? outerW - RAIL - GAP : outerW;
  const ah = full ? Math.max(1, box.h - HEAD) : INLINE_H;
  const { elev, plan } = panelSizes({ aw, ah }, wMax / H, GAP);

  /* One header line per column, so all three labels sit on it. */
  const head = (label: string, extra?: ReactNode) => (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, height: HEAD }}
    >
      <span className="label">{label}</span>
      {extra}
    </div>
  );

  /* One group whichever way it is laid out: a rail is the same choice stood
     on end, and the arrow keys walk it either way. */
  const chips = (
    <Choice
      label="Staging step"
      options={steps.map((st, i) => ({ value: i, label: st.label }))}
      value={at}
      onChange={(i) => {
        setPlaying(false);
        setGoal(i);
      }}
      chip={railed ? { textAlign: "left", width: "100%" } : undefined}
      style={
        railed
          ? {
              flexDirection: "column",
              flexWrap: "nowrap",
              marginTop: 6,
              overflowY: "auto",
            }
          : { marginBottom: 14 }
      }
    />
  );

  const heading = (
    <span className="label">Build · step through the staging</span>
  );

  const header = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
      }}
    >
      {heading}
      <span style={{ flex: 1 }} />
      {animates && steps.length > 1 && (
        <IconButton
          icon={playing ? Pause : Play}
          label={playing ? "Stop" : "Play the staging"}
          onClick={() => {
            if (playing) {
              /* Let the separation in flight finish rather than snapping out
                 of it halfway. */
              setPlaying(false);
              setGoal(at);
            } else {
              /* From the top again if it is already at the end. */
              if (from === last) setStep(0);
              setGoal(last);
              setPlaying(true);
            }
          }}
        />
      )}
      {drawn && (
        /* The label is the only text on it, so it has to be a real one: the
           browser reads it out, and the browser suite finds the button by
           it. */
        <IconButton
          icon={full ? Minimize : Maximize}
          label={full ? "Leave full screen" : "Full screen"}
          onClick={() => setFull(!full)}
        />
      )}
    </div>
  );

  /* The largest box the transition passes through. The buffer is allocated
     once for it and the visible box is clipped out of the corner, so the panel
     can change size every frame without reallocating two render targets and a
     depth texture sixty times a second. Sampled rather than solved for:
     `panelSizes` is not monotone in the extent, and nine points cost nothing
     once a transition. #105 */
  const buffers = useMemo(() => {
    if (!shot.sep) return null;
    let ew = 0,
      eh = 0,
      pw = 0;
    for (let i = 0; i <= 8; i++) {
      const f = pose(shot.sep, i / 8);
      const n = framing(angle, f.extent);
      const sz = panelSizes(
        { aw, ah },
        Math.max(1, n.w * 2) / Math.max(0.1, n.h * 2),
        GAP,
      );
      ew = Math.max(ew, sz.elev.w);
      eh = Math.max(eh, sz.elev.h);
      pw = Math.max(pw, sz.plan.w);
    }
    return { elev: { w: ew, h: eh }, plan: { w: pw, h: pw } };
  }, [shot.sep, angle, aw, ah]);

  const panel = (
    label: string,
    parts: typeof model,
    view: string,
    size: { w: number; h: number },
    buffer: { w: number; h: number } | undefined,
    extra?: ReactNode,
    fade?: number,
    moves?: ReturnType<typeof pose> | null,
  ) => (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column" }}>
      {head(label, extra)}
      {/* At the foot of its column, so the base of the plan and the base of
          the elevation are the same line — which is the bottom of the section.
          The elevation is the taller of the two and never moves. */}
      <div style={{ marginTop: "auto", opacity: fade ?? 1 }}>
        <Suspense fallback={<Loading w={size.w} h={size.h} />}>
          <ThreeView
            parts={parts}
            view={view}
            width={size.w}
            height={size.h}
            color={color}
            theme={theme}
            buffer={buffer}
            extent={moves ? moves.extent : undefined}
            sweep={moves ? moves.sweep : undefined}
            midY={moves ? moves.midY : undefined}
            offsets={moves ? moves.offsets : undefined}
          />
        </Suspense>
      </div>
    </div>
  );

  const row = (
    <div
      ref={box.ref}
      style={{
        display: "flex",
        gap: GAP,
        /* Every column the height of the row, so the one that pushes its
           drawing to the bottom has something to push against. */
        alignItems: "stretch",
        /* Full screen: everything the two lines of text do not need. */
        flex: full ? 1 : undefined,
        minHeight: 0,
        overflowX: railed ? undefined : "auto",
      }}
    >
      {railed && (
        <div
          style={{
            width: RAIL,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {head("Staging")}
          {chips}
        </div>
      )}
      {panel(
        "Elevation",
        model,
        angle,
        elev,
        buffers?.elev,
        <Toggle
          label="Iso"
          on={angle === "iso"}
          onChange={(iso) => setAngle(iso ? "iso" : "side")}
          style={{ padding: "2px 7px" }}
        />,
        1,
        frame,
      )}
      {panel(
        "Plan",
        planModel,
        "plan",
        plan,
        buffers?.plan,
        undefined,
        planFade,
      )}
    </div>
  );

  const body = (
    <>
      {header}
      {!railed && chips}
      {drawn ? row : <NoWebGL />}
      <div
        className="figure"
        style={{
          display: "flex",
          gap: GAP,
          flexWrap: "wrap",
          marginTop: SPACE.lg,
          color: C.muted,
        }}
      >
        <span>
          {live.length} stage{live.length === 1 ? "" : "s"} attached
        </span>
        {/* From `stackGeometry`, not from the drawing's own bounds. The two
            agree — `test/model.test.ts` holds them to a millimetre — and there
            is one of them, which is the point. */}
        <span>{now.h.toFixed(1)} m tall</span>
        <span>{now.w.toFixed(2)} m across</span>
        <span style={{ color: whole ? limit : undefined }}>
          {now.ar.toFixed(1)}:1 aspect
          {!whole && (
            <span style={{ color: limit }}>
              {" · "}
              {pad.ar.toFixed(1)} on the pad
            </span>
          )}
        </span>
      </div>
    </>
  );

  /* What is left in the card while the overlay is up. A line rather than the
     same button again: two controls with one label is two things for a screen
     reader to read out and one of them to pick from, and the way back is on
     the overlay where the eye already is. */
  const placeholder = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {heading}
      <span style={{ flex: 1 }} />
      <span className="note" style={{ color: C.dim }}>
        shown full screen · Escape to come back
      </span>
    </div>
  );

  /* Through a portal, and this is not a detail. The overlay has to escape the
     `Solving` veil: that wrapper drops to `opacity: .22` and `filter:
     grayscale(1)` while a solve runs, and either of those makes it the
     containing block for a `position: fixed` descendant — so the overlay would
     re-anchor itself to the results column halfway through a solve.

     Under the app's own solving bar, which is `Z.solving` and lives outside
     the veil, so a full-screen rocket about to be replaced still says so.

     Not the Fullscreen API. This is meant to run inside a Claude artifact's
     iframe, where `requestFullscreen` needs an `allow` attribute nobody here
     controls. Filling the window is the promise it can keep. */
  return (
    <>
      <div>{full ? placeholder : body}</div>
      {full &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: Z.overlay,
              background: C.ink,
              /* A second root. Outside the one the application sets these on,
                 `button { font-family: inherit }` reaches the browser default
                 and every chip in here comes out in Times. */
              fontFamily: FONT,
              color: C.paper,
              padding: 16,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {body}
          </div>,
          document.body,
        )}
    </>
  );
}

export { BuildView, isSolved };
export type { SolvedStage, Step };
