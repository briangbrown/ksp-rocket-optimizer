# Types for measurements

**Syllabus:** [L3](../../README.md#part-3--language-and-platform)

**Why it matters:** The data types matter because the part tables are 51
engines, 91 tanks, 35 couplers, 17 bodies and 128 drag-cube heights read out
of one KSP install, and a number in them is a measurement of that install,
not a setting anyone may tune; typing the JSON as readonly records keyed by
the strings the data itself uses lets the compiler say what each number is
a measurement of, refuse a table missing an entry, and refuse code that
would write into one, so the line between data and configuration is held by
the type checker rather than by remembering.

**Before this:** [L2](discriminated-unions-and-narrowing.md),
_Discriminated unions and narrowing_.

## A worked case

Here is the Swivel as the data file has it, thirteen fields, every one a
measurement:

```json
{
  "n": "LV-T45 \"Swivel\" Liquid Fuel Engine",
  "m": 1.5,
  "dry": 1.5,
  "fuelM": 0,
  "cost": 1200,
  "sz": ["1"],
  "gim": 3,
  "iv": 320,
  "ia": 250,
  "fv": 215.1,
  "fa": 168,
  "f": ["LF", "Ox"],
  "t": "Basic Rocketry"
}
```

and here is the type the solver reads it through, with the comment that
says what the numbers are:

```ts
/* Masses in tonnes, thrust in kN, Isp in seconds. `iv`/`ia` and `fv`/`fa` are
   the vacuum and sea-level pairs. `fuelM` is the propellant a solid booster
   carries, and zero on a liquid engine — which is how the two are told apart. */
type Engine = PartBase & {
  t: string;
  m: number;
  dry: number;
  fuelM: number;
  cost: number;
  gim: number;
  iv: number;
  ia: number;
  fv: number;
  fa: number;
  f: ReadonlyArray<string>;
  gim1?: number;
};
const engines: ReadonlyArray<Engine> = partsData.engines;
```

Now three things a reader might write, and what the compiler does with each.
Save this as `data.ts` at the repository root and run
`npx tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --resolveJsonModule --ignoreConfig data.ts`:

```ts
import parts from "./src/data/parts.json";
type Engine = {
  n: string;
  m: number;
  iv: number;
  ia: number;
  fv: number;
  cost: number;
  t: string;
};
const ENGINES: ReadonlyArray<Engine> = parts.engines; // fine: every row has these fields
ENGINES[0].m = 2; // compiles: the ARRAY is readonly, the record is not
type Bad = { n: string; thrustVac: number };
const WRONG: ReadonlyArray<Bad> = parts.engines; // TS2322: Property 'thrustVac' is missing …
const TOP: Readonly<Record<"Kerbin" | "Duna", number>> = { Kerbin: 70000 }; // TS2741: Property 'Duna' is missing …
```

| Line      | What the compiler does                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `ENGINES` | Accepts it: the JSON is typed from its own contents, and every row has the seven fields the type names. |
| `.m = 2`  | Accepts it. `ReadonlyArray` forbids replacing or reordering the elements, not writing into one.         |
| `WRONG`   | TS2322: the data has no `thrustVac`, so a type that names one is a type for different data.             |
| `TOP`     | TS2741: a record keyed by two names must have both. A table that forgets a body does not compile.       |

The second line is the one to notice. A readonly array of mutable records
protects the list and not the measurements in it; a stray `e.m = 2` in the
solver would compile and quietly change a Swivel's mass for the rest of the
session. The tables that are looked up by name, the bodies, the drag cubes,
the tech tree, are therefore typed `Readonly<Record<…>>`, and the rule for
the part lists is that nothing writes into a part.

## The idea

The data in `src/data/` is measurements: masses, thrusts, Isp figures,
drag-cube heights and areas, orbital elements, atmosphere curves, all read
out of one specific install of the game with a specific pair of expansions.
Changing a number there is not configuring the application, it is claiming
the game measures differently, and the types are the first line that says
so. Two features of TypeScript do the work.

A **readonly** type is one the compiler will not let you assign into.
`ReadonlyArray<T>` has no `push`, `splice` or index assignment;
`Readonly<T>` marks every property of an object as not assignable;
`readonly` on a single property does the same for that one. None of it
exists at run time, so it costs nothing, and none of it protects against a
caller who casts it away, so it is a statement of intent the compiler
enforces on honest code. Its limit is depth: `ReadonlyArray<Engine>` is a
readonly list of writable engines, and protecting the fields means
`ReadonlyArray<Readonly<Engine>>` or `readonly` on the fields themselves.

A **record type** is an object type keyed by a known set of strings,
`Record<K, V>`: for every key in `K` there is a value of type `V`. When `K`
is a union of literal names, `Readonly<Record<"stock" | "restock", Tables>>`,
the compiler demands exactly those keys and refuses a table with one
missing; when `K` is `string`, the record is a dictionary, any key may be
looked up, and a lookup of a name the data lacks is `undefined` at run time
rather than an error at compile time. The bodies and the drag cubes are
dictionaries keyed by the names the game uses, because the set of names is
the data's to define, and the code that reads them checks for the missing
case.

```
   JSON on disk                 the type it is read through                what the compiler checks

   parts.json engines[] ─────►  ReadonlyArray<Engine>                       every row has every named field,
                                  m, dry, fuelM: number (tonnes)             with the right primitive type
                                  iv, ia: number (seconds)
                                  fv, fa: number (kN)
   bodies.json SYS{} ─────────►  Readonly<Record<string, SysBody>>           each value is a SysBody;
                                                                             lookups may miss
   geometry.json {stock,restock} ► Readonly<Record<"stock"|"restock", …>>    both tables present
   tech.json nodes{} ─────────►  Readonly<Record<string, TechNode>>
```

How a JSON file gets a type at all is the compiler option `resolveJsonModule`:
an imported JSON file is typed from its own contents, an array of objects
whose fields are whatever the first rows have. That inferred type is then
assigned to the declared one, and the assignment is where the checking
happens. A field the declaration names and the data lacks is an error; a
field the data has and the declaration does not is silently allowed, since
objects may have extra fields; an optional field, like a tank's `cost?`,
says that some rows lack it and every reader must handle that. The types
are therefore a description of the data that the compiler verifies against
the data, on every build.

What the types stop is configuration creeping into data. A colour for each
destination once lived in the same table as the destinations' Δv, and
nothing read it; a default for a solver constant could as easily be slipped
into a body's record. The rule for the directory is that a value in it is
something a tool measured, and a type that says "mass in tonnes, from this
part's config" is harder to add a tuning knob to than a bare object.
Measurements also have provenance the code must respect: a drag cube can be
wrong, three were, and the fix was to read three heights from a stock
install and say so in the rule, not to edit the numbers to what looked
right.

## In this codebase

[`src/core/catalogue.ts`](../../../../src/core/catalogue.ts) reads the part
tables: `PartBase` is the fields every part shares, its name, its tech node
or `null`, its size classes and the flags saying which expansion supplies
it; `Engine` and `Tank` extend it with their measurements, each comment
naming the unit; and the file ends by typing the imports:

```ts
const engines: ReadonlyArray<Engine> = partsData.engines;
const tanks: ReadonlyArray<Tank> = partsData.tanks;
const nodes: Readonly<Record<string, TechNode>> = techData.nodes;
export const DATA = { engines, tanks, nodes };
```

[`src/core/orbits.ts`](../../../../src/core/orbits.ts) types the bodies as
`Readonly<Record<string, SysBody>>`, and [`src/core/geometry.ts`](../../../../src/core/geometry.ts)
types the drag-cube tables as `Readonly<Record<"stock" | "restock", ArtTables>>`,
a record with exactly two keys because ReStock replaces the models of parts
that exist and so a part is a different size depending on which install it
is measured in; `useArt` picks the live table once per solve. The tech
gates read `!!x.t && unlocked.has(x.t)` and fail closed, because `t` is
`string | null` and a part with no node is available nowhere rather than
everywhere.

The rule for the directory is [`.claude/rules/part-data.md`](../../../../.claude/rules/part-data.md):
measurements, not configuration, with the record of the three drag cubes
that were wrong and the cheap test that finds such a cube, a part's axial
face area over its own footprint, 0.983 across 524 parts and 0.00003 for the
worst of the three.

## What made it real

[`test/parts-data.test.ts`](../../../../test/parts-data.test.ts) is the
check the types cannot make: every part is behind a tech node the tree has,
and every tank has a price. Seventeen Making History tanks once had neither,
because their rows were filled in from outside the install the configs came
from, and with the gate written `!x.t || …` a part with no node was offered
at every tier. The type `t: string | null` says the case exists; the test
says it must not occur in the data; and the gate fails closed if it ever
does. Today the counts are zero and zero.

The compiler's part is the assignment: 51 engines, 91 tanks, 35 couplers, 63
tech nodes and two tables of 128 drag-cube heights are checked against their
declared types on every `npm run typecheck`, and a re-extraction that dropped
a field, or renamed one, fails there before any test runs. The measurement
of the drag cubes is in the rule: the Mammoth's generated cube claimed a
bounding box 499 by 25.1 by 741 metres centred 151 metres to one side of the
part, and its axial and side face areas came back byte-identical, which no
real part gives.

## Where it breaks

- **A readonly list of writable records.** `ReadonlyArray<Engine>` lets
  `engines[0].m = 2` compile. The protection is on the list; the fields
  are held by convention and by the fact that nothing in the solver writes
  into a part.
- **A dictionary lookup that cannot miss.** `SYS[name]` on
  `Record<string, SysBody>` is typed as a `SysBody`, not as one-or-undefined,
  so a misspelt body name is a run-time `undefined` and not a compile
  error. Readers guard the lookup, and `bodyKey` resolves labels to real
  names first.
- **Configuration in the data file.** A dead colour field sat in the
  destination table because it was convenient. The rule is that a value in
  `src/data/` is a measurement, and a tuning knob belongs in code with its
  reason next to it.
- **Editing a measurement to look right.** Three drag cubes were garbage
  generated from replacement models. The fix was to read them from a stock
  install and record that they are the only values not measured from the
  reference install, not to type in plausible numbers.
- **A node the tree lacks.** The type allows any string for `t`; only the
  test knows the tree's 63 names. Types say what shape the data has; tests
  say what values it may take.

## Try it

Run the `tsc` command on the file above and read the two errors and the
silence about the third line. Then change `ReadonlyArray<Engine>` to
`ReadonlyArray<Readonly<Engine>>` and run again: `ENGINES[0].m = 2` is now
TS2540, "Cannot assign to 'm' because it is a read-only property." Then run
`npx vitest run test/parts-data.test.ts` and read what it holds that no type
can.

## Check yourself

<details><summary>`ReadonlyArray<Engine>` did not stop `ENGINES[0].m = 2`. Why not, and what would?</summary>

Because `ReadonlyArray` forbids changing the array, its elements' identity
and order, not the fields of the objects it holds. `ReadonlyArray<Readonly<Engine>>`,
or `readonly` on the fields, makes the assignment TS2540. The part lists
rely on the convention that nothing writes into a part; the lookup tables
are typed `Readonly<Record<…>>`.

</details>

<details><summary>Why is the drag-cube table typed `Record<"stock" | "restock", …>` while the bodies are `Record<string, SysBody>`?</summary>

Because the set of art tables is fixed and known to the code, two installs
and no third, so the compiler can demand both keys and refuse a file with
one missing. The set of bodies is the data's to define, so it is a
dictionary, and a lookup by name may miss and is guarded.

</details>

<details><summary>What does the type checker catch about the part data, and what is left to the test?</summary>

The checker catches shape: a field named in the type and absent from the
data, or of the wrong primitive type, fails the assignment on every build.
It cannot know that a tech node string names a real node, or that a tank
should have a price; those are facts about values, and
`test/parts-data.test.ts` holds them.

</details>

## Further reading

- The TypeScript Handbook, "Utility Types", for `Readonly` and `Record`, and
  "Modules", for `resolveJsonModule` and how a JSON import is typed.
- Martin Fowler, "Configuration data is not data", a short essay on why
  tunable settings and measured facts should not share a file.

## Key takeaway

Type the data as what it is: readonly lists of measured records whose types
name the unit of every number, and readonly records keyed by the names the
data uses, with a fixed key set where the code knows it and a dictionary
where the data owns it; the compiler then checks the tables against their
description on every build, and what it cannot check, that a node exists or
a tank has a price, a test does.

_As of c252431._
