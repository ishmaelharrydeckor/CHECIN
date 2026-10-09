import { test } from "node:test";
import assert from "node:assert/strict";
import { findUnboundedQueries } from "../lib/find-unbounded-queries.mjs";
import { scanServerCode } from "../check-bounded-queries.mjs";

// ---------------------------------------------------------------- the real code base
test("no server route or server lib reads an unbounded number of documents", () => {
  const found = scanServerCode(".");
  assert.deepEqual(
    found.map((p) => `${p.file}:${p.line} ${p.chain}`),
    [],
    "Add .limit(n) to the query, or a `// bounded-ok: <reason>` comment above it. See docs/SCALE-PLAN.md section 2.",
  );
});

// ---------------------------------------------------------------- the detector itself
test("a query with .limit() is accepted", () => {
  const src = `const s = await db.collection("a").where("orgId","==",o).limit(10).get();`;
  assert.equal(findUnboundedQueries(src).length, 0);
});

test("a query with no .limit() is flagged", () => {
  const src = `const s = await db.collection("a").where("orgId","==",o).get();`;
  const found = findUnboundedQueries(src);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 1);
});

test("a single-document read is accepted, inline or through a variable", () => {
  assert.equal(findUnboundedQueries(`const s = await db.collection("a").doc(id).get();`).length, 0);
  const viaVar = `const ref = db.collection("a").doc(id);\nconst s = await ref.get();`;
  assert.equal(findUnboundedQueries(viaVar).length, 0);
});

test("a variable holding a query is judged by how it was declared", () => {
  const bad = `let q = db.collection("a").where("orgId","==",o);\nconst s = await q.get();`;
  assert.equal(findUnboundedQueries(bad).length, 1);
  const good = `let q = db.collection("a").where("orgId","==",o).limit(5);\nconst s = await q.get();`;
  assert.equal(findUnboundedQueries(good).length, 0);
});

test("a limit placed on a later line of the same chain is accepted", () => {
  const src = `const s = await db\n  .collection("a")\n  .where("orgId","==",o)\n  .limit(20)\n  .get();`;
  assert.equal(findUnboundedQueries(src).length, 0);
});

test("a bounded-ok comment above the read is the explicit escape hatch", () => {
  const src = `// bounded-ok: one document per org by construction\nconst s = await db.collection("a").where("orgId","==",o).get();`;
  assert.equal(findUnboundedQueries(src).length, 0);
});

test("reads that take arguments (headers.get, map.get) are not Firestore queries", () => {
  const src = `const h = request.headers.get("authorization");\nconst v = cache.get(key);`;
  assert.equal(findUnboundedQueries(src).length, 0);
});
