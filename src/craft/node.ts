import { CraftError } from "./error.js";

/* ConfigNode: the text format everything KSP saves is written in — part
   configs, saves, and .craft files. `key = value` lines and `NAME { … }`
   blocks, nested, order kept, keys repeatable. This layer is lossless: what
   `parseNode` reads `printNode` writes back with nothing dropped, so a file
   the game wrote survives a trip through here with every field it carried,
   known to us or not. The meaning of the fields is `craft.ts`'s business.

   The grammar is the game's own reader's (ConfigNode.PreFormatConfig), not a
   tidier one: everything after `//` on a line is a comment, wherever it
   falls — a URL in a value is cut at its `//`, in the game as here; a brace
   may share a line with its name, or with anything else; lines end in LF,
   CRLF or CR; a byte-order mark is skipped; a value may be empty. */

type ConfigNode = {
  name: string;
  values: Array<[string, string]>;
  nodes: Array<ConfigNode>;
};

/* A craft is tens of kilobytes and a save a few megabytes; anything past
   this is not one, and a parser that accepts arbitrary input is how a page
   is made to hang. Depth likewise: a real file nests six deep. */
const MAX_CHARS = 16 * 1024 * 1024;
const MAX_DEPTH = 64;

function parseNode(text: string): ConfigNode {
  if (text.length > MAX_CHARS)
    throw new CraftError(
      `${text.length} characters is more than a config file can be (${MAX_CHARS})`,
    );
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const root: ConfigNode = { name: "", values: [], nodes: [] };
  const stack: Array<ConfigNode> = [root];
  /* A name seen with no brace yet: the block it opens is on a later line. */
  let pending: { name: string; line: number } | null = null;
  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    let line = lines[i];
    const c = line.indexOf("//");
    if (c >= 0) line = line.slice(0, c);
    /* Braces split a line into what is before, the brace, and what is
       after, each read on its own — so `NAME {` and `NAME { k = v }` read as
       the game reads them. */
    for (const tok of line.split(/([{}])/)) {
      const t = tok.trim();
      if (!t) continue;
      if (t === "{") {
        if (stack.length > MAX_DEPTH)
          throw new CraftError(`blocks nest deeper than ${MAX_DEPTH}`, ln);
        const node: ConfigNode = {
          name: pending?.name ?? "",
          values: [],
          nodes: [],
        };
        stack[stack.length - 1].nodes.push(node);
        stack.push(node);
        pending = null;
        continue;
      }
      if (t === "}") {
        if (pending)
          throw new CraftError(`expected { after ${pending.name}`, ln);
        if (stack.length === 1) throw new CraftError("unmatched }", ln);
        stack.pop();
        continue;
      }
      if (pending) throw new CraftError(`expected { after ${pending.name}`, ln);
      const eq = t.indexOf("=");
      if (eq < 0) {
        pending = { name: t, line: ln };
        continue;
      }
      stack[stack.length - 1].values.push([
        t.slice(0, eq).trim(),
        t.slice(eq + 1).trim(),
      ]);
    }
  }
  if (pending)
    throw new CraftError(`expected { after ${pending.name}`, pending.line);
  if (stack.length !== 1)
    throw new CraftError(
      `${stack.length - 1} block${stack.length === 2 ? "" : "s"} left open at the end`,
      lines.length,
    );
  return root;
}

/* The canonical text: tabs for depth, a name on its own line and its braces
   on theirs, LF, a final newline. The game reads it as it reads its own. */
function printNode(node: ConfigNode): string {
  const out: Array<string> = [];
  const walk = (n: ConfigNode, depth: number) => {
    const tab = "\t".repeat(depth);
    for (const [k, v] of n.values) out.push(`${tab}${k} = ${v}`);
    for (const c of n.nodes) {
      out.push(`${tab}${c.name}`, `${tab}{`);
      walk(c, depth + 1);
      out.push(`${tab}}`);
    }
  };
  walk(node, 0);
  return out.join("\n") + "\n";
}

/* The first value under a key, and every value under it. */
const valueOf = (n: ConfigNode, key: string): string | undefined =>
  n.values.find(([k]) => k === key)?.[1];
const valuesOf = (n: ConfigNode, key: string): Array<string> =>
  n.values.filter(([k]) => k === key).map(([, v]) => v);
const childrenOf = (n: ConfigNode, name: string): Array<ConfigNode> =>
  n.nodes.filter((c) => c.name === name);

export {
  MAX_CHARS,
  MAX_DEPTH,
  childrenOf,
  parseNode,
  printNode,
  valueOf,
  valuesOf,
};
export type { ConfigNode };
