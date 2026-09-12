# Discriminated unions and narrowing

**Syllabus:** [L2](../../README.md#part-3--language-and-platform)

**Why it matters:** Discriminated unions matter because the rocket the
build view draws is a list of shapes that are each an engine, a coupler, an
adapter, a tank, a decoupler, a booster or a payload, each carrying a
different kind of part, and written as one wide type with optional fields
every reader had to work out which kind it held by asking the wrong
question, whether a part had a `column` field, which found the liquid
columns and missed every solid booster in the game; tagged by role, the
compiler knows which fields a shape has from one test on the tag, refuses a
read the role does not allow, and can prove that every kind was handled, so
a rocket cannot be half-drawn and compile.

**Before this:** nothing.

## A worked case

Three lines of TypeScript that look right and are wrong, and what the
compiler says about each. Save this as `union.ts` anywhere and run
`npx tsc --noEmit --strict --target es2022 --ignoreConfig union.ts`:

```ts
type Part =
  | { role: "engine"; thrust: number }
  | { role: "tank"; prop: number }
  | { role: "payload" };

function massOf(p: Part): number {
  switch (p.role) {
    case "engine":
      return p.thrust / 100;
    case "tank":
      return p.prop * 1.125;
  } // no case for "payload"
}

const fill: Record<Part["role"], string> = { engine: "grey", tank: "white" }; // no colour for "payload"

function label(p: Part) {
  if (p.role === "tank") return p.prop;
  return p.thrust; // p might be a payload here
}
```

| Line              | The compiler's error                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `massOf`          | TS2366: Function lacks ending return statement and return type does not include 'undefined'.                                                              |
| `fill`            | TS2741: Property 'payload' is missing in type '{ engine: string; tank: string; }' but required in type 'Record<"engine" \| "payload" \| "tank", string>'. |
| `return p.thrust` | TS2339: Property 'thrust' does not exist on type '{ role: "engine"; … } \| { role: "payload"; }'.                                                         |

Each is a rocket that would have been half-drawn. The first is a function
that handles two of three kinds and would return `undefined` for the third;
the compiler sees that the switch is not exhaustive and refuses the return
type. The second is a lookup table with a colour for two of three roles; the
record type keyed by the union's tags demands all three. The third reads a
field that only one of the two remaining kinds has; after the `if`, the
compiler has narrowed `p` to engine-or-payload, and a payload has no thrust.
None of these needs a test to find. None can reach the build view.

The codebase's own case is the one the type was rewritten for. The model's
shapes were once one wide type with a `part` field that might be an engine,
a tank, a coupler or a booster's synthesised engine, and the drawing had to
work out which by inspecting fields. It asked whether the part had a
`column`, which is what a liquid radial column's part carries; that found
the liquid columns and missed every solid booster, whose part has no column,
so the solids were drawn as something they were not. Tagged by role, the
question is `p.role === "booster"` and the compiler knows what `p.part` is
on each side of it.

## The idea

A **discriminated union** is a type that is one of several object shapes,
told apart by a tag field with a different literal value in each: `role` is
`"engine"` in one shape and `"tank"` in another, and no value can be both.
The tag is the discriminant. Everything else about each shape can differ,
including which fields exist at all, and that is the point: a tank has a
propellant mass and an engine has a thrust, and neither has to be optional
on the other.

**Narrowing** is the compiler learning which shape a value is from a test on
it. Inside `if (p.role === "tank")` the type of `p` is the tank shape alone
and `p.prop` is a number; in the `else` it is every other shape, and `p.prop`
does not exist. A `switch` on the tag narrows each case the same way. The
compiler follows the control flow, so a return inside the `if` narrows what
comes after it, which is how the third error above arises: after returning
for tanks, `p` is engine-or-payload, and only one of those has a thrust.

**Exhaustiveness** is the compiler proving every shape was handled. It has
no keyword; it falls out of two other checks. A function whose switch
returns in every case it names has a path with no return for the cases it
does not, and if the return type does not admit `undefined`, that is an
error. A record typed by the union's tags, `Record<Part["role"], string>`,
must have a key for every tag, so a table that colours or sizes or names
the roles cannot omit one. Add a fourth role to the union and both checks
fail at every switch and every table until the fourth is handled, which is
exactly the list of places a new kind of part has to be taught.

```
   one wide type                              a discriminated union

   type Shape = {                             type ModelPart =
     x, y, z, r, h,                             | (Shape & { role: "engine";  part: Engine | BoosterPart })
     part?: Engine | Tank | Coupler | …,        | (Shape & { role: "tank";    part?: Tank })
     column?: …                                 | (Shape & { role: "booster"; part: BoosterPart })
   }                                            | (Shape & { role: "payload" })
                                                | …
   "is this a booster?"                       "is this a booster?"
     → if (p.part && "column" in p.part)        → if (p.role === "booster")
       finds liquid columns, misses solids        and p.part is a BoosterPart on that side
```

The alternative the union replaces is one type with optional fields and a
reader that infers the kind from which fields are present. It compiles,
because every read is of an optional field the type allows, and it is wrong
in a way the compiler cannot see, because the inference is a guess about the
data and not a fact about the type. A boolean flag per kind is the same
mistake in another form: two flags true at once is a state the type permits
and the program has no meaning for. A tag with a literal type per shape
makes the impossible states unrepresentable.

The tag's type matters as much as its presence. A `kind: string` field
narrows nothing, because the compiler cannot know which strings occur; a
`kind: "ascent" | "transfer" | …` field is a fixed set, a mistyped literal
is a compile error, and every switch over it can be checked for
exhaustiveness. The route's leg kinds are such a set for a stated reason: a
mistyped one would silently stop matching and the leg would simply never
be dropped or charged.

## In this codebase

`ModelPart` in [`src/core/model.ts`](../../../../src/core/model.ts) is the
union the build view draws from, and its comment records why:

```ts
/* Discriminated on the role, because which part a shape stands for follows
   from the job it is doing … Written as one wide `part` it was a union every
   reader had to re-narrow by hand, and by the wrong question — asking whether
   a part has a `column` field finds the liquid ones and misses every solid
   booster in the game. */
type ModelPart =
  | (Shape & { role: "engine"; part: Engine | BoosterPart })
  | (Shape & { role: "coupler"; part: Coupler | Shroud | null })
  | (Shape & { role: "adapter"; part: Tank })
  | (Shape & { role: "tank"; part?: Tank })
  | (Shape & { role: "decoupler"; part: DecouplerFit | null })
  | (Shape & { role: "booster"; part: BoosterPart })
  | (Shape & { role: "payload" });
type ModelRole = ModelPart["role"];
```

`Shape` is the geometry every kind shares, position, radius and height, and
each member adds its role and the part that role carries; a tank's part is
optional because a level of a packed ring is drawn as its column rather than
as any one tank. [`src/ui/components/three-view.tsx`](../../../../src/ui/components/three-view.tsx)
narrows on the tag, `p.role === "engine" || p.role === "booster"` for the
parts that have a mesh, and has a second union of its own, `HiddenSource`,
tagged `kind: "mesh" | "revolved"`, for what a part's hidden lines are built
from. `LegKind` in [`src/core/orbits.ts`](../../../../src/core/orbits.ts)
is the fixed-set tag the route, the solver and the interface all switch on,
with its comment on why it is not a string. [`test/model.test.ts`](../../../../test/model.test.ts)
reads the same tag to count what was drawn: every shape of role `"tank"`,
every `"decoupler"`, every `"booster"`, against what the solver said there
should be.

The project's [`.claude/typescript-style-guide.md`](../../../../.claude/typescript-style-guide.md)
has the general rule under _Discriminated Union_: remove optional properties
through variant separation, enable exhaustiveness checking in switches,
avoid boolean flag complexity; and, under assertions, that `as` and `!`
defeat narrowing and are to be avoided except where unavoidable.

## What made it real

The `column` test is the measurement: a reader that inferred a shape's kind
from its fields drew solid boosters wrongly, compiled clean, and passed
every test that did not look at a solid booster. The union made the
question `p.role === "booster"`, which cannot be asked wrongly, and the
model tests now count drawn boosters, tanks and decouplers by role against
the solver's design, which is how the drawing and the design are held
together ([A9](../../solver/geometry/packing-circles-clusters-and-rings.md)).

The three compiler errors above are reproducible on any machine with the
repository's `tsc`, and they are the whole of the mechanism: the checker
does not know what a rocket is, only that a function over a union returned
on two of three branches, that a record over its tags is missing one, and
that a field was read on a shape that may not have it.

## Where it breaks

- **Inferring the kind from the fields.** The `column` test. Optional
  fields on one wide type make every kind possible everywhere, and the
  guess about which one is present is invisible to the compiler.
- **A tag typed as `string`.** Nothing narrows on it and a typo is a
  runtime no-op: a leg whose kind is `"trasnfer"` is never charged. A
  literal union makes the typo a compile error.
- **A `default` that swallows a case.** `default: return 0` in `massOf`
  compiles and silently prices every future kind at nothing. Exhaustiveness
  works only where the switch is allowed to be incomplete in the compiler's
  eyes.
- **Casting through the check.** `(p as Engine).thrust` compiles for a
  payload. The style guide's rule against assertions exists because each
  one is a place narrowing has been switched off.
- **Boolean flags for kinds.** `isBooster` and `isEngine` both true is a
  state the type allows and the drawing has no meaning for; one tag with
  one literal per kind cannot express it.

## Try it

Run the `tsc` command on the file above and read the three errors. Then fix
`massOf` by adding `case "payload": return 0;` and watch the first error go;
add `payload: "none"` to `fill` and watch the second go; and change `label`
to `if (p.role === "engine") return p.thrust; return 0;` for the third. Then
add a fourth member, `{ role: "fairing"; length: number }`, to the union and
run again: the first two errors return at once, which is the list of places
a new kind of part has to be taught.

## Check yourself

<details><summary>What does the tag field do that an optional `part` field on one wide type could not?</summary>

It tells the compiler, not just the reader, which shape a value is. From a
test on the tag the compiler narrows the value to one member of the union
and knows exactly which fields exist; from the presence of an optional
field it knows nothing, and a reader inferring the kind from the fields is
making a guess the compiler cannot check, which is how solid boosters were
drawn as liquid columns.

</details>

<details><summary>TypeScript has no `exhaustive` keyword. How does the compiler prove every shape was handled?</summary>

Through two ordinary checks. A function whose switch returns in the cases
it names has a fall-through path for the ones it does not, and a return
type without `undefined` makes that an error (TS2366). A record typed by
the union's tags must have every tag as a key (TS2741). Adding a member to
the union makes both fire wherever a member is missing.

</details>

<details><summary>Why is `LegKind` a union of string literals rather than `string`?</summary>

Because a `string` narrows nothing and hides typos. The route, the solver
and the interface all switch on a leg's kind to decide whether it is
dropped, charged or simulated; a mistyped kind on a `string` field would
match nothing and the leg would silently never be charged, where on the
literal union it does not compile.

</details>

## Further reading

- The TypeScript Handbook, "Narrowing", for control-flow narrowing and
  discriminated unions, including the `never` idiom for exhaustiveness.
- Alexis King, "Parse, don't validate", for the principle that a type should
  make invalid states unrepresentable rather than checked for at every use.
- Scott Wlaschin, _Domain Modeling Made Functional_, for tagged unions as
  the tool for modelling a thing that is one of several kinds.

## Key takeaway

Tag each kind with a literal field and let the compiler do the narrowing:
one test on the tag says which fields exist, a read the tag does not allow
is a compile error, and a switch or a table that misses a kind fails to
compile until the kind is handled, so the rocket is drawn whole or not at
all, where a wide type with optional fields let solid boosters be drawn as
columns and compiled clean.

_As of 0cc8947._
