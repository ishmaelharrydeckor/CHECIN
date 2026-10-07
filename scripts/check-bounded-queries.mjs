// Usage: node scripts/check-bounded-queries.mjs  (the same check runs in `npm test`)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findUnboundedQueries } from "./lib/find-unbounded-queries.mjs";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function scanServerCode(root = ".") {
  const files = [
    ...walk(join(root, "src/routes/api")),
    ...walk(join(root, "src/lib")).filter((f) => f.endsWith(".server.ts")),
  ].filter((f) => f.endsWith(".ts"));
  const out = [];
  for (const f of files) {
    for (const p of findUnboundedQueries(readFileSync(f, "utf8"))) {
      out.push({ file: f.split("\\").join("/"), ...p });
    }
  }
  return out;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const found = scanServerCode();
  for (const p of found) console.log(`${p.file}:${p.line}  ${p.chain}`);
  console.log(found.length ? `\n${found.length} unbounded read(s)` : "no unbounded reads");
  process.exit(found.length ? 1 : 0);
}
