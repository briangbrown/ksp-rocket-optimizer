import {
  Color,
  GreaterDepth,
  LinearSRGBColorSpace,
  NoBlending,
  ShaderMaterial,
  Vector2,
  Vector3,
  DepthTexture,
} from "three";
import { rgbOf } from "../tokens.js";
import type { Palette } from "../tokens.js";

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

/* Every line in the drawing is the theme's `paper`: light on a dark panel,
   dark on a light one, which keeps Gooch's rule that the extremes belong to
   the linework — the fills stay in the mid-tones and the lines are the
   furthest thing from the panel in the picture, where before they were a
   near neighbour of the fill and had to be held back with opacity to stop
   thirty parts reading as a mesh.

   Every function here takes the palette rather than reading a module
   constant, because the palette is not constant: the drawing is rebuilt when
   the theme changes, and it is rebuilt from what it is handed. */
export const lineOf = (pal: Palette) => pal.paper;

/* Palette colours as they are written, not as three.js would manage them.
   Everything here renders to a target and composites without a colour-space
   conversion at any step, so what is authored is what is drawn — and mixing in
   the space the palette was chosen in is what makes the mid-tones land where a
   designer put them. */
const raw = (hex: string): [number, number, number] => {
  const [r, g, b] = rgbOf(hex);
  return [r / 255, g / 255, b / 255];
};

/* A number as GLSL sees it. `${3.0}` is the string "3", and GLSL has no
   `pow(float, int)` — the shader fails to compile, the pass draws nothing, and
   the only trace is a console message. Anything interpolated into a shader
   goes through here. */
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const vec3 = (hex: string) => new Vector3(...raw(hex));

/* The panel colour as a clear colour, and the reason this is not just
   `setClearColor(C.panel)`: three converts a hex it is handed from sRGB into
   its linear working space, and every shader here writes its result out
   untouched. Handed the string, the background would clear to the linear value
   of the token — the same colour, about a third as bright — and the drawing
   would sit in a darker rectangle than the card around it. Naming the working
   space makes the conversion a no-op. */
export const panelClear = (pal: Palette) =>
  new Color().setRGB(...raw(pal.panel), LinearSRGBColorSpace);

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
   hue shift is the point — a tank turning away goes blue before it goes dark.
   On a light panel the cool side is nearly white and the warm side is too,
   so the ramp there is the warmth alone; the fills are darker to give it
   room. */
const WARM = new Vector3(1.0, 0.96, 0.88);

export function goochMaterial(baseHex: string, pal: Palette) {
  return new ShaderMaterial({
    uniforms: {
      base: { value: vec3(baseHex) },
      cool: { value: vec3(pal.panel) },
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
export function idMaterial(index: number) {
  /* Two channels, not one. A single byte caps the model at 254 parts, and the
     way it fails is silent: the 255th clamps onto the first and its outlines
     simply stop being drawn. The biggest model in the mission grid is 78 parts
     now that a tank run is drawn tank by tank, which is comfortable and not
     comfortable enough to leave a cliff in. */
  const n = index + 1;
  return new ShaderMaterial({
    uniforms: { id: { value: new Vector2((n & 255) / 255, (n >> 8) / 255) } },
    blending: NoBlending,
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec2 id;
      void main() { gl_FragColor = vec4(id, 0.0, 1.0); }
    `,
  });
}

/* The id pass again, for what lies behind the front surface: a fragment no
   deeper than the visible depth at its pixel is the front itself and is
   dropped, and the depth test then keeps the nearest of what remains — the
   second layer, exactly. Its ids go through the same edge detection the
   front's do, which is what makes a hidden line a line rather than a band of
   surface that happens to face edge-on. #85 */
export function peelIdMaterial(index: number, depth: DepthTexture) {
  const n = index + 1;
  return new ShaderMaterial({
    uniforms: {
      id: { value: new Vector2((n & 255) / 255, (n >> 8) / 255) },
      tDepth: { value: depth },
      size: { value: new Vector2(1, 1) },
    },
    blending: NoBlending,
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec2 id, size;
      uniform sampler2D tDepth;
      void main() {
        float front = texture2D(tDepth, gl_FragCoord.xy / size).x;
        /* A hair behind the front, so a surface does not peel itself. */
        if (gl_FragCoord.z <= front + ${f(PEEL_EPS)}) discard;
        gl_FragColor = vec4(id, 0.0, 1.0);
      }
    `,
  });
}
/* In window depth, which is linear here: the frustum is orthographic. */
const PEEL_EPS = 0.0002;

/* A hidden crease: the same line, dashed, drawn only where it failed the
   depth test — behind the surface that hid it. `GreaterDepth` with no write is
   the whole trick, as it was for the ghost. */
export function ghostLineMaterial(pal: Palette, dashPeriod: number) {
  return new ShaderMaterial({
    uniforms: {
      edgeColor: { value: vec3(lineOf(pal)) },
      dash: { value: dashPeriod },
    },
    transparent: true,
    depthFunc: GreaterDepth,
    depthWrite: false,
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 edgeColor;
      uniform float dash;
      void main() {
        float along = (gl_FragCoord.x + gl_FragCoord.y) / dash;
        if (fract(along) > ${f(DASH_DUTY)}) discard;
        gl_FragColor = vec4(edgeColor, ${f(LINE_ALPHA)});
      }
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
export function compositeMaterial(pal: Palette) {
  return new ShaderMaterial({
    uniforms: {
      tColor: { value: null },
      tId: { value: null },
      tDepth: { value: null },
      tHid: { value: null },
      dash: { value: 7 },
      texel: { value: new Vector2() },
      edgeColor: { value: vec3(lineOf(pal)) },
      panel: { value: vec3(pal.panel) },
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
      uniform sampler2D tColor, tId, tDepth, tHid;
      uniform vec2 texel;
      uniform float dash;
      uniform vec3 edgeColor, panel;
      uniform float camNear, camFar, cueNear, cueSpan;
      varying vec2 vUv;

      /* The id back as the integer it went in as, from the two bytes it was
         written across. Ids start at 1, so zero is the background the id pass
         cleared to. */
      float idAt(vec2 uv) {
        vec4 t = texture2D(tId, uv);
        return floor(t.r * 255.0 + 0.5) + floor(t.g * 255.0 + 0.5) * 256.0;
      }
      float hidAt(vec2 uv) {
        vec4 t = texture2D(tHid, uv);
        return floor(t.r * 255.0 + 0.5) + floor(t.g * 255.0 + 0.5) * 256.0;
      }

      /* Orthographic depth is linear in view distance, so no reciprocal games:
         a metre at the front of the rocket is a metre at the back. */
      float dist(vec2 uv) {
        return -orthographicDepthToViewZ(texture2D(tDepth, uv).x, camNear, camFar);
      }

      void main() {
        vec4 c = texture2D(tColor, vUv);
        float d0 = dist(vUv);
        float i0 = idAt(vUv);

        /* Two weights, which is how a drawing is inked: the outline of the
           whole object heavier than the lines inside it. The outer silhouette
           is where a part meets the background, and it is drawn two samples
           wide against one for everything else. Both are taken on one side of
           the boundary only — the lower id of the pair, and the background is
           the lowest of all, so the outline lands just outside the shape and
           never eats into it. */
        float e = 0.0;
        for (int k = 0; k < 4; k++) {
          vec2 off = k < 2
            ? vec2(k == 0 ? texel.x : -texel.x, 0.0)
            : vec2(0.0, k == 2 ? texel.y : -texel.y);
          /* A different part next door — or the background, which is zero. */
          if (idAt(vUv + off) - i0 > 0.5) e = 1.0;
          /* One further out, but only where this is the outside edge. */
          if (i0 < 0.5 && idAt(vUv + off * 2.0) > 0.5) e = 1.0;
        }

        /* The layer behind, the same way: where its id changes, or ends, a
           hidden part's edge runs — its silhouette against whatever is behind
           it, or the seam between two hidden parts. One-sided like the front's
           lines, so a line and not two; only under a part, since nothing hides
           behind the background; and not where the front already has a line,
           which is where a hidden part emerges from behind the one in front. */
        /* Only another part: the meshes are hollow, and a part's own inner
           wall is what a peel finds behind its outer one. That is not a hidden
           line — a hidden line is the part behind this one. */
        float h0 = hidAt(vUv);
        float other0 = step(0.5, h0) * step(0.5, abs(h0 - i0));
        float e2 = 0.0;
        if (i0 > 0.5) {
          for (int k = 0; k < 4; k++) {
            vec2 off = k < 2
              ? vec2(k == 0 ? texel.x : -texel.x, 0.0)
              : vec2(0.0, k == 2 ? texel.y : -texel.y);
            float hn = hidAt(vUv + off);
            float othern = step(0.5, hn) * step(0.5, abs(hn - i0));
            if (hn - h0 > 0.5 && max(other0, othern) > 0.5) e2 = 1.0;
            /* Not within two pixels of the front's own linework: at a rim
               the back face lies within the peel's epsilon of the front, so
               the hidden layer ends a pixel inside the visible silhouette and
               would draw a dashed twin of it. */
            if (abs(idAt(vUv + off) - i0) > 0.5) e2 = 0.0;
            if (abs(idAt(vUv + off * 2.0) - i0) > 0.5) e2 = 0.0;
          }
        }
        /* Dashed, as a drawing has always drawn a line you cannot see: on the
           screen diagonal, so an edge of any orientation crosses the dashes. */
        float on = step(fract((gl_FragCoord.x + gl_FragCoord.y) / dash), ${f(DASH_DUTY)});

        float cue = clamp((d0 - cueNear) / cueSpan, 0.0, 1.0);
        vec3 rgb = mix(c.rgb, panel, cue * CUE);
        /* A breath of tint wherever something is behind — the same everywhere,
           so it says "there is something here" and draws no shape of its own;
           the shape is the dashed line's to draw. */
        rgb = mix(rgb, edgeColor, other0 * ${f(HIDDEN_WASH)});
        rgb = mix(rgb, edgeColor, e2 * on * ${f(LINE_ALPHA)});
        /* Lines at full strength over cued fill: the extremes belong to the
           linework, which is the whole of the Gooch argument. */
        gl_FragColor = vec4(mix(rgb, edgeColor, e), 1.0);
      }
    `,
  });
}

/* What is behind something, drawn through it.

   A stage with parallel columns hides its rear ones behind the core seen
   side-on. Drawing them correctly is not the same as being able to see them,
   and the old SVG elevation drew `Math.min(2, S - 1)` columns precisely because
   a ring cannot be faked in 2D — the 3D view draws all of them and then puts
   the core in front of half.

   The rule set is Diepstraten, Weiskopf and Ertl, Computer Graphics Forum
   2002, who derived it from how illustrators actually draw ghosted views: the
   hidden thing is drawn as lines, the lines are dashed, and the layers are
   capped. Until #85 this was a surface pass — the hidden geometry painted
   again through the front with a wash that deepened as it turned away and a
   dashed band where its normal went edge-on. That was a veil over every
   curved surface, a band whose width followed curvature so it went faint
   where a facet merely grazed the threshold, and two bands side by side on a
   hidden cylinder, since its near and far turns both pass. The hidden lines
   now come from the same place the visible ones do: the second depth layer
   is peeled into an id buffer of its own (`peelIdMaterial`), the composite
   edge-detects it one-sided and dashes it, and the hidden creases are drawn
   dashed through the depth test (`ghostLineMaterial`). One layer, which is the
   cap; a rocket is a few columns deep. What remains of the wash is a breath of
   uniform tint wherever anything is behind, so the x-ray still reads as one.

   `HIDDEN_WASH` is that tint; `DASH_DUTY` how much of a period is drawn, on
   the screen diagonal; `LINE_ALPHA` how dark a hidden line is against the
   visible ones, which are full. */
const HIDDEN_WASH = 0.06;
const DASH_DUTY = 0.55;
const LINE_ALPHA = 0.85;
