---
paths:
  - "src/craft/**"
  - "src/core/craft.ts"
  - "test/craft/**"
---

# The craft file

`src/craft/` reads and writes KSP `.craft` files and knows nothing else: no
solver, no part table, no React. `src/core/craft.ts` is the one adapter from a
delivered plan to a `Craft`, and the only module allowed to import
`src/craft/`. `test/boundaries.test.ts` holds both directions. #460, #462

- **The file is the spec; the write-ups are wrong where they differ.** Read
  off files KSP 1.12.5 wrote: `link = <name>_<uid>` is the child's token, not
  an index, and the root is the part nothing links to; `dstg = 0` is both "stays
  to the end" and "leaves in the last stage", the game does not distinguish;
  every unstaged field is `-1`; a free stack node is written
  `attN = <node>,Null_0_<p>_<d>_<p>_<d>`. One circulating spec says `link` is a
  0-based index with `-1` for the root. It is not.

- **The game cuts a line at `//`, wherever it falls.** Its reader treats `//`
  as a comment anywhere on a line, so a URL in `description` ends at `https:`.
  `checkCraft` refuses a description with `//` or a newline in it; the adapter
  writes the link's hash, not the link.

- **`pos` is trusted on load.** KSP re-derives nothing from the nodes, so a
  wrong position is a wrong rocket that still loads. Place by stack node —
  `child.pos = parent.pos + parent.bottom − child.top` — never by the drag
  cube's height: a tank's box overhangs its nodes by 50–100 mm and an engine's
  bell hangs past its bottom node (`.claude/rules/part-data.md`, #461).

- **Two layers, and the lossless one is underneath.** `node.ts` parses and
  prints ConfigNode text with nothing dropped and is held to
  `printNode(parseNode(t)) ≡ t` canonicalised; `craft.ts` reads the fields a
  `Craft` carries and drops the rest. Put a new field in `Craft` only when the
  adapter needs to set it; a field the game writes that we do not carry is
  read and forgotten, by design.

- **Numbers go through `format.ts` and nowhere else.** Nine significant
  digits, no exponent, `-0` written `0`, as .NET writes them. A caller's
  numbers with nine digits or fewer come back the same, which is what the
  property test holds; the adapter rounds to millimetres before it hands
  positions over.

- **Ids are the caller's, and deterministic.** The writer invents nothing: a
  `CraftPart.id` is a decimal 32-bit number the adapter derives from the part's
  place in the tree, so the same plan writes the same bytes (the
  same-link-same-result rule). `persistentId`s are FNV-1a hashes of the tokens.

- **Refuse, do not repair.** `writeCraft` runs `checkCraft` and throws on the
  first problem rather than writing a file the VAB loads with a hole in it. A
  craft with problems is the adapter's bug.

- **Open until the game answers (#467):** whether a bare `PART` body with
  `MODULE { name = X }` stubs launches; the `srfN` long form carries a collider
  name we do not have, so the writer emits the two-field form
  `srfAttach,<token>`; whether a ReStock variant needs `ModulePartVariants`
  state named to draw the ReStock model. Each is a probe in the ladder; the
  answer replaces this line.
