import {
  Color,
  GreaterDepth,
  LinearSRGBColorSpace,
  NoBlending,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import { C, rgbOf } from "../tokens.js";

/* ----------------------------- schematic shading -----------------------------

   Two problems, one file.

   **A cylinder has no drawable silhouette.** `EdgesGeometry` finds where two
   faces meet at more than a threshold angle. It gets a tank's cap rims right —
   a 90 degree crease, there whatever the camera does — and cannot get its side
   outline at all, because that is an occluding contour: it depends on where you
   stand and is in no version of the geometry. Below the threshold it emits
   nothing for the side, above it emits every one of the 40 seams and the tank
   comes back looking like a paper lantern.

   So the two are split by what each is actually good at. Creases inside one
   part stay geometric, because geometry knows where they are. Silhouettes are
   found in screen space, because only the screen knows where they are.

   **Depth and normals cannot see the commonest join in this rocket.** Two tanks
   of the same diameter stacked end to end share a plane and a normal — both
   pointing radially outward, both continuous across the seam. A Sobel over
   depth and normals, which is the usual recipe, finds nothing there. Surface
   IDs do: give every part its own value, render it to a buffer, and any change
   is an edge whatever the camera is doing. That costs one number per part here,
   because every part is already its own mesh. #70

   Colour follows Gooch, Gooch, Shirley and Cohen, SIGGRAPH 1998 — the paper
   automatic technical illustration is measured against. Surface orientation is
   carried by a cool-to-warm shift in hue as much as by luminance, and the
   extremes are reserved for lines: all shading happens in the mid-tones, so
   the drawing stays a drawing rather than becoming a render with lines on it.
*/

/* Palette colours as they are written, not as three.js would manage them.
   Everything here renders to a target and composites without a colour-space
   conversion at any step, so what is authored is what is drawn — and mixing in
   the space the palette was chosen in is what makes the mid-tones land where a
   designer put them. */
const raw = (hex) => rgbOf(hex).map((v) => v / 255);

/* A number as GLSL sees it. `${3.0}` is the string "3", and GLSL has no
   `pow(float, int)` — the shader fails to compile, the pass draws nothing, and
   the only trace is a console message. Anything interpolated into a shader
   goes through here. */
const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const vec3 = (hex) => new Vector3(...raw(hex));

/* The panel colour as a clear colour, and the reason this is not just
   `setClearColor(C.panel)`: three converts a hex it is handed from sRGB into
   its linear working space, and every shader here writes its result out
   untouched. Handed the string, the background would clear to the linear value
   of the token — the same colour, about a third as bright — and the drawing
   would sit in a darker rectangle than the card around it. Naming the working
   space makes the conversion a no-op. */
export const panelClear = () =>
  new Color().setRGB(...raw(C.panel), LinearSRGBColorSpace);

/* Where the light is. Fixed in view space, not world space, so turning the
   model to the isometric does not swing the shading round with it — the
   convention in a technical drawing is a light over your left shoulder, and it
   stays there whichever way the object is turned. */
const LIGHT = "vec3(-0.32, 0.62, 0.72)";

/* How far the ramp travels from the part's own colour. Small on purpose. The
   whole Gooch argument is that shading lives in the mid-tones: push these up
   and the shape reads better for about a step, then the lines stop being the
   darkest thing in the picture and it turns into a render. */
const COOL_MIX = 0.34;
const WARM_MIX = 0.2;
/* Cool towards the panel the drawing sits on, warm towards a paper white. The
   hue shift is the point — a tank turning away goes blue before it goes dark. */
const COOL = vec3(C.panel);
const WARM = new Vector3(1.0, 0.96, 0.88);

export function goochMaterial(baseHex) {
  return new ShaderMaterial({
    uniforms: {
      base: { value: vec3(baseHex) },
      cool: { value: COOL.clone() },
      warm: { value: WARM.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      void main() {
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 base, cool, warm;
      varying vec3 vN;
      void main() {
        float t = 0.5 + 0.5 * dot(normalize(vN), normalize(${LIGHT}));
        vec3 dark = mix(base, cool, ${f(COOL_MIX)});
        vec3 lit  = mix(base, warm, ${f(WARM_MIX)});
        gl_FragColor = vec4(mix(dark, lit, t), 1.0);
      }
    `,
  });
}

/* One flat value per part, written straight out with no blending and no colour
   management, so it survives the round trip as the integer it went in as. Read
   back with a nearest filter — anything that interpolates ids invents parts
   that are not there along every boundary. */
export function idMaterial(index) {
  return new ShaderMaterial({
    uniforms: { id: { value: (index + 1) / 255 } },
    blending: NoBlending,
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float id;
      void main() { gl_FragColor = vec4(id, 0.0, 0.0, 1.0); }
    `,
  });
}

/* The pass that draws the lines.

   Ids alone find every silhouette in this drawing, and no depth test is
   wanted for it. Background carries id zero and every part carries its own, so
   a change of id is a change of part or the outside edge of the rocket — one
   test, exact, and free of the artefact a depth threshold has on curved
   surfaces, where the depth gradient runs away near the rim and paints a band
   inside the silhouette instead of a line on it. Depth is still sampled, but
   only to say how far away something is.

   The change is taken on one side of a boundary only, the lower id of the
   pair. Marking both sides doubles every line, which at devicePixelRatio 1 is
   a two-pixel outline on a 150-pixel panel.

   Depth cueing rides along, since the depth is already sampled: the far side of
   the rocket sinks towards the panel behind it. That is the only thing telling
   a viewer which of two identical columns is nearer, because nothing here is
   lit. It replaces the scene fog added in #69 — same effect, one fewer pass
   over the geometry, and driven by the same buffer the outlines come from.

   The pass paints the panel colour itself and outputs opaque, rather than
   leaving the background transparent for the card behind to show through. A
   transparent canvas would mean carrying straight alpha through two render
   targets, a multisample resolve and a premultiplied canvas, and getting a
   fringe on the silhouette in return. The colour is the same one the card is
   drawn in, and it comes from the same token. */
export function compositeMaterial() {
  return new ShaderMaterial({
    uniforms: {
      tColor: { value: null },
      tId: { value: null },
      tDepth: { value: null },
      texel: { value: new Vector2() },
      edgeColor: { value: vec3(C.edge) },
      panel: { value: vec3(C.panel) },
      camNear: { value: 0 },
      camFar: { value: 1 },
      cueNear: { value: 0 },
      cueSpan: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      #include <packing>
      #define CUE 0.33
      uniform sampler2D tColor, tId, tDepth;
      uniform vec2 texel;
      uniform vec3 edgeColor, panel;
      uniform float camNear, camFar, cueNear, cueSpan;
      varying vec2 vUv;

      /* Orthographic depth is linear in view distance, so no reciprocal games:
         a metre at the front of the rocket is a metre at the back. */
      float dist(vec2 uv) {
        return -orthographicDepthToViewZ(texture2D(tDepth, uv).x, camNear, camFar);
      }

      void main() {
        vec4 c = texture2D(tColor, vUv);
        float d0 = dist(vUv);
        float i0 = texture2D(tId, vUv).x;

        float e = 0.0;
        for (int k = 0; k < 4; k++) {
          vec2 off = k < 2
            ? vec2(k == 0 ? texel.x : -texel.x, 0.0)
            : vec2(0.0, k == 2 ? texel.y : -texel.y);
          /* A different part next door — or the background, which is zero. */
          if (texture2D(tId, vUv + off).x - i0 > 0.001) e = 1.0;
        }

        float cue = clamp((d0 - cueNear) / cueSpan, 0.0, 1.0);
        vec3 rgb = mix(c.rgb, panel, cue * CUE);
        /* Lines at full strength over cued fill: the extremes belong to the
           linework, which is the whole of the Gooch argument. */
        gl_FragColor = vec4(mix(rgb, edgeColor, e), 1.0);
      }
    `,
  });
}

/* What is behind something, drawn faintly through it.

   A stage with parallel columns hides its rear ones behind the core seen
   side-on. Drawing them correctly is not the same as being able to see them,
   and the old SVG elevation drew `Math.min(2, S - 1)` columns precisely because
   a ring cannot be faked in 2D — the 3D view draws all of them and then puts
   the core in front of half.

   The rule set is Diepstraten, Weiskopf and Ertl, Computer Graphics Forum 2002,
   who derived it from how illustrators actually draw ghosted views rather than
   from alpha blending. Two of their rules are here:

   **Transparency is view-dependent.** A surface is more opaque towards its
   silhouette and more transparent where it faces you, so a ghosted tank keeps
   its outline and opens up in the middle — it still reads as a tank rather than
   as a smear. With an orthographic camera the view direction is constant, so
   this is the z of the view-space normal and costs nothing.

   **Backfaces are suppressed.** Otherwise you see the inside of the far wall of
   the thing you are seeing through, which no illustrator draws. three.js culls
   them by default; it is a rule being kept rather than one being implemented.

   The third — that layers are capped — is left to the geometry. A rocket is a
   few columns deep, not a few hundred.

   `GreaterDepth` with no depth write is what makes it a second pass rather than
   a transparency problem: only fragments that *failed* the opaque pass draw, so
   this paints exactly the hidden part of the model and nothing else, over the
   top of what hid it. #71 */
const GHOST_MIN = 0.04;
const GHOST_MAX = 0.42;
const GHOST_TURN = 3.0;

export function ghostMaterial(baseHex) {
  const m = goochMaterial(baseHex);
  m.transparent = true;
  m.depthFunc = GreaterDepth;
  m.depthWrite = false;
  m.polygonOffset = false;
  m.fragmentShader = /* glsl */ `
      uniform vec3 base, cool, warm;
      varying vec3 vN;
      void main() {
        vec3 n = normalize(vN);
        float t = 0.5 + 0.5 * dot(n, normalize(${LIGHT}));
        vec3 dark = mix(base, cool, ${f(COOL_MIX)});
        vec3 lit  = mix(base, warm, ${f(WARM_MIX)});
        /* Facing the viewer is see-through; turned away is nearly solid. */
        float edge = pow(1.0 - abs(n.z), ${f(GHOST_TURN)});
        gl_FragColor = vec4(mix(dark, lit, t), mix(${f(GHOST_MIN)}, ${f(GHOST_MAX)}, edge));
      }
    `;
  return m;
}
