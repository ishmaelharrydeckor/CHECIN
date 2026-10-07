// Finds Firestore reads that could return an unbounded number of documents.
//
// Rule (docs/SCALE-PLAN.md section 2): every query is bounded. A `.get()` is
// accepted when the chain it ends has a `.limit(`, or ends in `.doc(...)` (one
// document). A `.get()` on a bare variable is judged by the statement that
// declared the variable. Anything else must carry a `// bounded-ok: <reason>`
// comment on one of the three lines above it.
//
// This is a text heuristic, not a parser. It is deliberately simple so it can
// be read in a minute; the test file shows what it does and does not catch.

/** Walk back from `endIdx` (the index of `.get()`) to the start of its call chain. */
function chainStart(src, endIdx) {
  let depth = 0;
  for (let i = endIdx - 1; i >= 0; i--) {
    const c = src[i];
    if (c === ")" || c === "]") depth++;
    else if (c === "(" || c === "[") {
      if (depth === 0) return i + 1;
      depth--;
    } else if (depth === 0 && (c === "=" || c === ";" || c === "{" || c === "}" || c === ",")) {
      return i + 1;
    }
  }
  return 0;
}

function stripKeyword(chain) {
  return chain.replace(/^\s*(?:await|return)\s+/, "").trim();
}

/** The name of the last call in the chain before `.get()`, e.g. "doc", "where". */
function lastCallName(chain) {
  const m = chain.match(/\.(\w+)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*$/);
  return m ? m[1] : null;
}

/** The right-hand side of the closest `const|let <name> = ...;` above `beforeIdx`. */
function declarationOf(src, name, beforeIdx) {
  const re = new RegExp(String.raw`(?:const|let)\s+${name}\b[^;=]*=\s*([^;]*);`, "g");
  let found = null;
  let m;
  while ((m = re.exec(src)) && m.index < beforeIdx) found = m[1];
  return found;
}

export function findUnboundedQueries(src) {
  const problems = [];
  const lines = src.split("\n");
  const re = /\.get\(\)/g;
  let m;
  while ((m = re.exec(src))) {
    const start = chainStart(src, m.index);
    const chain = stripKeyword(src.slice(start, m.index));
    const line = src.slice(0, m.index).split("\n").length;

    if (!chain) continue;
    if (/\.limit\s*\(/.test(chain)) continue;
    if (lastCallName(chain) === "doc") continue;

    if (/^[A-Za-z_$][\w$]*$/.test(chain)) {
      const decl = declarationOf(src, chain, m.index);
      if (decl && (/\.limit\s*\(/.test(decl) || lastCallName(decl.trim()) === "doc")) continue;
    }

    const above = lines.slice(Math.max(0, line - 4), line).join("\n");
    if (/bounded-ok:/.test(above)) continue;

    problems.push({ line, chain: chain.replace(/\s+/g, " ").slice(0, 120) });
  }
  return problems;
}
