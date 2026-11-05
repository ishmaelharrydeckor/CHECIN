import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source guards for the late-excuse routes (docs/LATE-EXCUSE-DESIGN.md). The behaviour itself is
// covered in late-excuse.test.mjs; these make sure the routes keep using it.
const excuse = readFileSync("src/routes/api/attendance/late-excuse.ts", "utf8");
const note = readFileSync("src/routes/api/attendance/late-note.ts", "utf8");
const review = readFileSync("src/routes/api/attendance/late-review.ts", "utf8");

test("every write verifies the token, checks for revoked sessions and limits the rate", () => {
  for (const [name, src, handlers] of [["late-excuse", excuse, 2], ["late-note", note, 1]]) {
    assert.equal((src.match(/verifyCallerToken\(/g) ?? []).length, handlers, name);
    assert.equal((src.match(/checkRevoked: true/g) ?? []).length, handlers, name);
    assert.equal((src.match(/checkRateLimit\(/g) ?? []).length, handlers, name);
  }
  assert.ok(review.includes("authorizeReportCaller"), "the review list is for managers and admins only, and rate limited");
});

test("who is asking, and their organization and role, never come from the request", () => {
  for (const src of [excuse, note, review]) {
    assert.ok(!/body\.(orgId|managerId|role|uid|decidedBy)/.test(src));
    assert.ok(!/searchParams\.get\("(orgId|managerId|role|uid|employeeId)"\)/.test(src));
  }
  assert.ok(excuse.includes("canExcuse({ uid: caller.uid, role }"), "excusing is decided by the shared rule");
  assert.ok(excuse.includes("data.orgId !== orgId"), "a day in another organization looks like a day that does not exist");
  assert.ok(note.includes("summaryDocId(caller.uid, day)"), "a note always belongs to the caller");
  assert.ok(!/employeeIds|employeeId/.test(note.replace(/employeeId: caller\.uid,/, "")), "the note request names nobody");
});

test("an excuse is one transaction: stamp the day and keep the audit record", () => {
  assert.ok(excuse.includes("runTransaction"));
  assert.ok(excuse.includes("lateExcused: true"));
  assert.ok(excuse.includes("lateExcused: FieldValue.delete()"));
  assert.ok(!/late:\s*(false|FieldValue)/.test(excuse), "the original late flag is never touched");
  assert.ok(excuse.includes("excuseDecision("), "only a day that really was late can be excused");
});

test("the reason text is never logged", () => {
  for (const src of [excuse, note]) {
    const logs = src.match(/logEvent\(\{[\s\S]*?\}\);/g) ?? [];
    assert.ok(logs.length > 0);
    // Only the logged fields matter: the text people write (reason, note) must never be in them.
    for (const l of logs) assert.ok(!/fields:\s*\{[^}]*(reason|note|employeeNote)/.test(l), l);
  }
});

test("reads are bounded and the review list is limited to the excusable window", () => {
  assert.ok(review.includes(".limit(EXCUSE_READ_CAP)"));
  assert.ok(review.includes("windowStart(today)"));
  assert.ok(review.includes("scope.role === \"manager\"") && review.includes('"managerId", "==", scope.uid'));
});

test("a rule and indexes exist, and clients cannot write", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  const block = rules.slice(rules.indexOf("match /late_excuses/"));
  assert.ok(/allow create, update, delete: if false;/.test(block.slice(0, 500)));
  assert.ok(block.slice(0, 500).includes("resource.data.employeeId == request.auth.uid"));
  const idx = JSON.parse(readFileSync("firestore.indexes.json", "utf8")).indexes.filter(
    (i) => i.collectionGroup === "late_excuses",
  );
  const shapes = idx.map((i) => i.fields.map((f) => f.fieldPath).join(","));
  for (const s of ["orgId,dayKey", "orgId,managerId,dayKey"]) assert.ok(shapes.includes(s), s);
});

test("a later undo and a summary rebuild keep an excuse", () => {
  const undo = readFileSync("src/routes/api/check-in/undo.ts", "utf8");
  assert.ok(undo.includes("lateExcused: true") && undo.includes("keepExcuse"));
  const backfill = readFileSync("scripts/backfill-summaries.mjs", "utf8");
  assert.ok(backfill.includes("late_excuses") && backfill.includes("summary.lateExcused = true"));
  // a normal later scan spreads the stored summary, so the stamp survives it
  const daily = readFileSync("src/lib/daily-summary.ts", "utf8");
  assert.ok(daily.includes("...prev,"));
});

test("no GPS anywhere in the feature", () => {
  for (const src of [excuse, note, review, readFileSync("src/lib/late-excuse.ts", "utf8")]) {
    assert.ok(!/geolocation/i.test(src));
  }
});
