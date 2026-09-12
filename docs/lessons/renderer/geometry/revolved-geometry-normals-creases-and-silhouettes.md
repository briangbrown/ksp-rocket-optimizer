# Revolved geometry, normals, creases and silhouettes

**Syllabus:** [L14](../../README.md#part-3--language-and-platform)

**Why it matters:** The geometry of the drawing matters because the build view
is a line drawing made from solids, and the two kinds of line it draws are
found in two different places: a crease is a property of the surface, the
same from every angle, so it can be read off the mesh once when the part is
built, while a silhouette is a property of the view, the edge where the
surface turns away from this camera, so it has to be found again on every
paint; and because tanks are revolved profiles and engines are the game's
meshes, each of those two searches has a fast form for one kind of part and
a general form for the other.

**Before this:** [L11](../cameras/three-js-scene-orthographic-camera-and-the-camera-basis.md),
_three.js: scene, orthographic camera, and the camera basis_.

## A worked case

Build the two lathes a rocket is mostly made of, a plain tank and a tapered
pod, at the renderer's forty segments, and count what each search finds:

| Measure                                                     | Tank, 1.25 m by 7.5 m | Pod, 1.25 m to 0.625 m, 1.5 m tall             |
| ----------------------------------------------------------- | --------------------- | ---------------------------------------------- |
| Vertices as built (distinct positions)                      | 244 (82)              | 902 (802)                                      |
| Triangles                                                   | 160                   | 1,680                                          |
| Crease edges at the 30° threshold                           | 80                    | 40                                             |
| Crease edges at a 1° threshold                              | 120                   | 1,480                                          |
| Silhouette edges from the mesh, side view on a facet column | 42                    | 78 (40 on the cap rims, 38 sloped)             |
| Silhouette edges from the mesh, side view between columns   | 42                    | 94 (40 on the rims, 54 sloped on four columns) |
| Silhouette edges from the mesh, iso view                    | 42                    | 111 (85 on rings, 26 sloped on 22 columns)     |
| Silhouette segments from the profile, any side view         | 2 (the two walls)     | 38                                             |
| Silhouette from the profile, plan view                      | none                  | none                                           |

Read the tank first. Eighty crease edges are its two rims, forty segments
each, where the cap meets the wall at a right angle. Lower the threshold to
one degree and the forty vertical seams between facets join them, because
neighbouring facets of a forty-sided prism meet at nine degrees. The crease
search is asking one question of each edge, how far the surface turns
there, and the threshold decides which turns are lines.

The pod's forty creases all sit on one ring, at the bottom shoulder, where
the profile turns 32.5° from the fillet into the cone. The top shoulder
turns 22.5° and draws nothing. A crease is not where a drafter would put a
line; it is where the surface turns past a number.

Now the silhouettes. Seen from the side, the tank's mesh gives forty-two
edges: the two walls at the left and right, and the front half of each rim,
twenty edges apiece, because a cap faces sideways to the viewer and its
neighbouring wall facets face the viewer. The pod's mesh gives seventy-eight
when the view lands exactly on a facet column: the same forty rim edges, and
the profile's thirty-eight sloped segments on the two columns square to the
view. Turn the camera half a facet, so the view falls between columns, and
the sloped edges become fifty-four on four columns, because a faceted curve
turns away from the viewer somewhere between two columns and the search
reports both; the line jumps a column at a time as the camera turns. Stand
the profile at the two azimuths square to the view instead and the pod's
silhouette is its own outline for every view, thirty-eight segments with
the flat cap runs left out, and from straight above there is none, because
a revolved shape seen along its axis has no edge that turns away.

```ts
// save as test/l14.test.ts and run: npx vitest run test/l14.test.ts --reporter=verbose
import { test } from "vitest";
import {
  CylinderGeometry,
  EdgesGeometry,
  LatheGeometry,
  Vector2,
  Vector3,
} from "three";
import {
  topologyOf,
  silhouetteEdges,
  vertexIds,
  revolvedSilhouette,
} from "../src/ui/components/hidden-lines";

const SEGMENTS = 40,
  SHOULDER = 9; // three-view.tsx
function taperedProfile(rBase: number, rTop: number, h: number) {
  const f = Math.min(rBase * 0.16, h * 0.1, rTop * 0.34); // the fillet, as three-view.tsx sizes it
  const y0 = -h / 2,
    y1 = h / 2;
  const arc = (cr: number, cy: number, from: number, to: number) =>
    Array.from({ length: SHOULDER + 1 }, (_, i) => {
      const a = from + ((to - from) * i) / SHOULDER;
      return new Vector2(cr + Math.cos(a) * f, cy + Math.sin(a) * f);
    });
  return [
    new Vector2(0, y0),
    ...arc(rBase - f, y0 + f, -Math.PI / 2, 0),
    ...arc(rTop - f, y1 - f, 0, Math.PI / 2),
    new Vector2(0, y1),
  ];
}
function weld(g: CylinderGeometry | LatheGeometry) {
  // one vertex per position, as the engine tool leaves its meshes
  const pos = g.getAttribute("position").array as Float32Array;
  const ids = vertexIds(pos);
  const out = new Float32Array(3 * (Math.max(...ids) + 1));
  for (let i = 0; i < ids.length; i++)
    out.set(pos.subarray(3 * i, 3 * i + 3), 3 * ids[i]);
  return {
    pos: out,
    idx: Array.from(g.index!.array as ArrayLike<number>, (i) => ids[i]),
  };
}

test("lathes, creases and silhouettes", () => {
  const prof = taperedProfile(1.25, 0.625, 1.5);
  const parts = [
    ["tank", new CylinderGeometry(1.25, 1.25, 7.5, SEGMENTS)],
    ["pod", new LatheGeometry(prof, SEGMENTS)],
  ] as const;
  for (const [name, g] of parts) {
    const pos = g.getAttribute("position").array as Float32Array;
    const creases = (deg: number) =>
      new EdgesGeometry(g, deg).getAttribute("position").count / 2;
    const w = weld(g);
    const t = topologyOf(w.pos, w.idx);
    const sil = (d: Vector3) => {
      // the mesh search, split into ring edges and sloped ones, and how many azimuth columns the sloped ones use
      const s = silhouetteEdges(t, d);
      const az = new Set<number>();
      let flat = 0;
      for (const e of s) {
        const a = 3 * t.ea[e],
          b = 3 * t.eb[e];
        if (Math.abs(w.pos[a + 1] - w.pos[b + 1]) < 1e-6) flat++;
        else
          for (const o of [a, b])
            az.add(
              Math.round((Math.atan2(w.pos[o + 2], w.pos[o]) * 180) / Math.PI),
            );
      }
      return `${s.length} (${flat} ring, ${s.length - flat} sloped on ${az.size} columns)`;
    };
    const half = Math.PI / SEGMENTS;
    console.log(
      `${name}: ${pos.length / 3} vertices (${w.pos.length / 3} distinct), ${g.index!.count / 3} triangles; creases at 30°: ${creases(30)}, at 1°: ${creases(1)}\n` +
        `  mesh silhouette — side on a column: ${sil(new Vector3(1, 0, 0))}; side between columns: ${sil(new Vector3(Math.cos(half), 0, Math.sin(half)))}; iso: ${sil(new Vector3(1, 0.7, 0.3))}`,
    );
  }
  const ring = new EdgesGeometry(parts[1][1], 30).getAttribute("position")
    .array as Float32Array;
  const turns = prof.slice(1, -1).map((p, i) => {
    const a = p.clone().sub(prof[i]),
      b = prof[i + 2].clone().sub(p);
    return +(
      (Math.acos(a.dot(b) / (a.length() * b.length())) * 180) /
      Math.PI
    ).toFixed(1);
  });
  console.log(
    `pod creases at y = ${[
      ...new Set(
        Array.from(ring)
          .filter((_, i) => i % 3 === 1)
          .map((y) => y.toFixed(2)),
      ),
    ]}; profile turns: ${turns.join(" ")}`,
  );
  const pairs = prof.map((v) => [v.x, v.y] as const);
  const s = revolvedSilhouette(pairs, new Vector3(1, 0, 0))!;
  console.log(
    `profile of ${pairs.length} points → ${s.ea.length} silhouette segments from the side, plan view: ${revolvedSilhouette(pairs, new Vector3(0, 1, 0))}`,
  );
});
```

## The idea

A **mesh** is a surface as a list of triangles: a table of vertex positions
and a table of indices, three per triangle, saying which vertices each one
joins. Everything the GPU draws is a mesh; a sphere is a mesh with enough
triangles that the eye stops counting. Two triangles share an edge only if
they name the same two vertices, so a mesh built with a vertex duplicated
along a seam has, as far as any walk over its edges can tell, a gap there.
The tank as three.js builds it has 244 vertices and 82 positions, because
the wall and the caps do not share their rim vertices and the seam where the
wall closes is built twice. Welding, rounding positions to a ten-thousandth
and giving each distinct one a number, turns that back into one surface.

A **lathe** is a profile revolved round an axis: a polyline in the plane of
radius and height, copied at each of `n` azimuths and stitched into
triangles between neighbours. Tanks, pods, plates, nose cones and shrouds
are all lathes here, because that is what they are in the game too; a
tapered pod is its base radius, its top radius and a fillet at each
shoulder, and forty azimuths is enough that a 1.25 m tank reads as round at
the sizes the panel draws it. The triangles face by the direction of
travel: walked from the bottom up the outside, they face out, and a run
walked the other way faces in and is culled to nothing with no error, which
is how a hollow bell gets an inside the plan view can look up into.

A **normal** is the direction a surface faces at a point, a unit vector
stored per vertex and carried to the fragment shader, where the fill shades
by its angle to the light. On a lathe the normal is computed from the
profile's slope, smoothed between neighbouring segments, so a shoulder
shades as a curve; on the tank the wall and cap vertices are separate and
the shading breaks at the rim. For a mesh from the game there is no profile,
so `toCreasedNormals` decides per edge: faces meeting at less than the
crease angle share an averaged normal and shade smoothly across, faces
meeting at more keep their own and the shading breaks. Seventy degrees for
engines, because a ring of six facets meets at sixty and no real engine has
an edge shallower than a right angle.

A **crease** is an edge where the surface turns sharply, and it is a
property of the geometry: the angle between two faces is the same from
every viewpoint. `EdgesGeometry` finds them once, at build, by walking every
edge and keeping those whose two faces meet at more than a threshold, thirty
degrees for a lathe so a tank's rim is a line and its forty facets are not,
seventy for an engine so its lip is a line and its simplified surface is not.
It returns unordered segments, which are chained by shared endpoints into
polylines so a dash pattern can run along a ring.

A **silhouette** is the edge where the surface turns away from the viewer,
and it is a property of the view: move the camera and it moves. For a mesh
it is every edge whose two faces face opposite ways under this view
direction, one toward the camera and one away, plus every open boundary; for
a revolved part it is simpler and better, the profile itself stood at the
two azimuths square to the view's horizontal component, with the flat cap
runs left out because a radius on a flat face is not a silhouette. Better,
because the mesh search can only answer on the facet columns it has: the
true silhouette of a revolved surface lies between two columns for almost
every view, the search reports both, and the line jumps a column at a time
as the camera turns, where the profile stood at the exact azimuth is the
smooth answer for every view. Both searches run on every paint, because the
answer changes with the camera.

```
   crease: geometry                       silhouette: view
   ─────────────────                      ────────────────
   two faces meet at θ > threshold        one face toward the camera, one away
   found once, at build                   found on every paint
   lathe: 30°   engine mesh: 70°          lathe: profile at azimuth ±90° to the view
   rim of a tank, lip of a bell           engine mesh: facing flips or open boundary
   same from every angle                  walls of a tank from the side, none from above
```

## In this codebase

[`src/ui/components/three-view.tsx`](../../../../src/ui/components/three-view.tsx)
builds the parts. A plain tank is a `CylinderGeometry` and anything tapered
is a `LatheGeometry` over `taperedProfile`, whose fillet is the smallest of
sixteen percent of the base radius, a tenth of the height and a third of the
top radius, so a squat pod's shoulders never meet in the middle and its top
face still reads as a hatch. `SEGMENTS`, `CREASE_ANGLE` and `ENGINE_CREASE`
are forty, thirty and seventy. An engine is `engineGeometry`, the fetched
mesh through `toCreasedNormals` at the engine angle; its `EdgesGeometry`
runs at the same angle so a line appears exactly where the shading breaks.
The fill material is pushed back a hair with `polygonOffset`, because a
crease sits exactly on the surface it marks and the two would otherwise
fight for the same depth along its length.

[`src/ui/components/hidden-lines.ts`](../../../../src/ui/components/hidden-lines.ts)
is the two searches. `vertexIds` welds, `topologyOf` builds the edge table
with each edge's two faces and every face's unnormalised normal, and
`silhouetteEdges` asks the sign of each normal against the view direction:

```ts
for (let e = 0; e < t.ea.length; e++)
  if (t.fb[e] < 0 || facing[t.fa[e]] !== facing[t.fb[e]]) out.push(e);
```

`revolvedSilhouette` is the lathe's short cut, the profile at
`atan2(d.z, d.x) ± π/2`, returning null when the view runs along the axis,
which is the plan, and the plan hides nothing anyway. `chainEdges` orders
either kind into polylines, and the view decides per part which search to
run: a fetched mesh gets `kind: "mesh"` with its topology, everything else
`kind: "revolved"` with its profile. The rules are in
[`.claude/rules/renderer.md`](../../../../.claude/rules/renderer.md):
_Creases are geometry, silhouettes are screen space_, and _A lathe faces its
surface by the direction of travel_.

## What made it real

The table is the measurement, and its two surprises are the point. The
pod's forty creases all sit at one height, −0.6 m, the bottom shoulder
where the profile turns 32.5°; the top shoulder turns 22.5° and is not a
line. And the pod's mesh silhouette is seventy-eight edges with the view on
a facet column and ninety-four with it half a facet over, the sloped part
spread over four columns instead of two, where the profile silhouette is
thirty-eight segments at the exact azimuth for either: the mesh search
quantises to the facets it has, which is why the lathe's silhouette comes
from its profile.

The ninety-degree rim is what `EdgesGeometry` was always able to find, and
the rule records what it cannot: a cylinder's side outline, which depends on
where the camera stands, and the seam between two tanks of the same
diameter, which has the same plane and the same normal on both sides and is
found by neither creases nor silhouettes but by the surface ids of
[L19](../../README.md#part-3--language-and-platform). The bell that culled to
nothing when one run of its profile was walked the wrong way, and the stray
lines the crease pass drew through degenerate triangles until `tidy` dropped
zero-length segments, are the rule's other two entries, from #85.

## Where it breaks

- **A seam that is not welded.** Run `topologyOf` on the tank as three.js
  builds it and 240 edges become 401, most of them "open", because the wall
  and the caps do not share vertices. The engine tool welds before it writes
  a mesh; the snippet welds before it counts.
- **A crease threshold for the wrong part.** Thirty degrees on a simplified
  engine mesh is creases all over; seventy on a tank misses nothing but
  would miss a twenty-two degree shoulder that thirty already misses. The
  threshold is per kind of part.
- **A mesh silhouette on a lathe.** It answers on facet columns, so the
  line straddles two of them for most views and jumps as the camera turns,
  and it includes the front half of each cap rim, which is already a crease.
  The profile stood at the exact azimuth is the answer for every view.
- **A profile walked the wrong way.** Its triangles face in and cull to
  nothing, silently. A hollow bell's profile goes down the inside and up the
  outside for exactly this reason.
- **A zero-length segment.** A plate of no height or a body as wide as its
  bell makes degenerate triangles the crease pass draws as stray lines.

## Try it

Run the snippet, then change the threshold in `creases(30)` to 20 and watch
the pod's creases double, because the top shoulder's 22.5° turn now counts.
Change the pod's top radius from 0.625 to 1.0 and watch the bottom shoulder's
turn fall under thirty and the pod lose its ring. Then hand
`revolvedSilhouette` the view `new Vector3(1, 0, 1)` and confirm its first
vertex moves from the `+z` azimuth to the diagonal.

## Check yourself

<details><summary>Why is a crease found once when the part is built, and a silhouette found on every paint?</summary>

Because a crease is the angle between two faces, which is a fact about the
surface and does not change when the camera moves, while a silhouette is
where the surface turns away from this viewer, which changes with every
view direction.

</details>

<details><summary>The tank's mesh silhouette from the side has forty-two edges, and its profile silhouette has two. Where are the other forty?</summary>

On the front half of each cap rim, twenty per cap. A cap faces sideways to
the viewer and the wall facets next to it face the viewer, so the mesh
search reports the rim between them as a turning-away. It is also already a
crease; the profile search skips flat cap runs for that reason.

</details>

<details><summary>Why are an engine's normals creased at seventy degrees and its crease lines drawn at seventy degrees too?</summary>

So a line appears exactly where the shading breaks. Faces meeting at less
than seventy share a normal and shade smoothly across, so a bell reads as a
curve; faces meeting at more keep their own and the fill breaks, and the
crease pass draws a line on the same edge. Seventy rather than thirty
because a ring of six facets meets at sixty and no real engine has an edge
that shallow.

</details>

## Further reading

- The three.js documentation for `LatheGeometry`, `EdgesGeometry` and
  `BufferGeometryUtils.toCreasedNormals`, for what each computes and what it
  does not.
- Any computer graphics text on polygon meshes, for vertex welding, face
  normals and the half-edge view of a surface as edges each with two faces.
- Hertzmann, "Introduction to 3D Non-Photorealistic Rendering: Silhouettes
  and Outlines" (1999), for the mesh silhouette as edges whose faces face
  opposite ways, and why it needs cleaning.

## Key takeaway

A crease is where two faces of a mesh meet past an angle, the same from
every view and found once at build; a silhouette is where the surface turns
away from this camera and is found again on every paint, from the profile
for a lathe and from the face pairs for a mesh; the two are different
questions asked of different tables, and a line drawing needs both.

_As of 85f57d3._
