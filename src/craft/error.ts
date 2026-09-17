/* The one error this module throws. A reader that meets a file it cannot
   make sense of says where and what; nothing else escapes it — a `TypeError`
   out of a parser is a bug in the parser, and the fuzz test holds that. */
class CraftError extends Error {
  readonly line: number | null;
  readonly col: number | null;
  constructor(
    what: string,
    line: number | null = null,
    col: number | null = null,
  ) {
    super(
      line === null
        ? what
        : `line ${line}${col === null ? "" : `:${col}`}: ${what}`,
    );
    this.name = "CraftError";
    this.line = line;
    this.col = col;
  }
}

export { CraftError };
