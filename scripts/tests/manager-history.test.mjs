import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  IN_QUERY_LIMIT,
  MAX_MOVED_IN,
  chunk,
  mergeByKey,
  mergeEventsNewestFirst,
  movedInMembers,
} from "../../src/lib/manager-history.ts";
import { buildAttendanceRegister } from "../../src/lib/report-data.ts";
import { buildTodayFromSummaries } from "../../src/lib/attendance-today.ts";

const TZ = "Africa/Accra";

test("chunks of at most the database's limit of 30", () => {
  const ids = Array.from({ length: 65 }, (_, i) => `u${i}`);
  const parts = chunk(ids, IN_QUERY_LIMIT);
  assert.deepEqual(parts.map((p) => p.length), [30, 30, 5]);
  assert.deepEqual(chunk([], 30), []);
});

test("only people who moved in on or after the range start need a lookup, newest first", () => {
  const roster = [
    { uid: "a", managerChangedAt: "2026-10-12T09:00:00.000Z" },
    { uid: "b", managerChangedAt: "2026-09-01T09:00:00.000Z" }, // joined before the range
    { uid: "c" }, // never moved
    { uid: "d", managerChangedAt: "2026-10-05T09:00:00.000Z" },
    { uid: "e", managerChangedAt: "not a date" },
  ];
  assert.deepEqual(movedInMembers(roster, TZ, "2026-10-01"), [
    { uid: "a", changedDay: "2026-10-12" },
    { uid: "d", changedDay: "2026-10-05" },
  ]);
});

test("the move day is worked out in the organization's timezone", () => {
  // 23:30 UTC on the 11th is already the 12th in Auckland.
  const r = movedInMembers([{ uid: "a", managerChangedAt: "2026-10-11T23:30:00.000Z" }], "Pacific/Auckland", "2026-10-01");
  assert.equal(r[0].changedDay, "2026-10-12");
});

test("a team where nobody moved in needs no extra lookup", () => {
  assert.deepEqual(movedInMembers([{ uid: "a" }, { uid: "b" }], TZ, "2026-10-01"), []);
});

test("no more than 30 moved-in people are looked up", () => {
  const roster = Array.from({ length: 45 }, (_, i) => ({ uid: `u${i}`, managerChangedAt: "2026-10-10T09:00:00.000Z" }));
  assert.equal(movedInMembers(roster, TZ, "2026-10-01").length, MAX_MOVED_IN);
});

test("merging keeps the first copy and drops repeats", () => {
  const a = [{ id: "1", v: "mine" }, { id: "2", v: "mine" }];
  const b = [{ id: "2", v: "other" }, { id: "3", v: "other" }];
  assert.deepEqual(mergeByKey(a, b, (x) => x.id).map((x) => `${x.id}:${x.v}`), ["1:mine", "2:mine", "3:other"]);
});

test("two event pages merge newest first, without repeats, up to the page size", () => {
  const a = [
    { id: "e5", timestamp: "2026-10-12T09:05:00.000Z" },
    { id: "e3", timestamp: "2026-10-12T09:03:00.000Z" },
  ];
  const b = [
    { id: "e4", timestamp: "2026-10-12T09:04:00.000Z" },
    { id: "e3", timestamp: "2026-10-12T09:03:00.000Z" },
    { id: "e1", timestamp: "2026-10-12T09:01:00.000Z" },
  ];
  assert.deepEqual(mergeEventsNewestFirst(a, b, 3).map((e) => e.id), ["e5", "e4", "e3"]);
});

// ---------------------------------------------------------------- the reports and the Today panel
const day = (employeeId, dayKey, extra = {}) => ({
  employeeId,
  dayKey,
  employeeName: `Name ${employeeId}`,
  department: "Sales",
  firstIn: `${dayKey}T08:00:00.000Z`,
  lastOut: `${dayKey}T16:00:00.000Z`,
  minutesWorked: 480,
  late: false,
  earlyDeparture: false,
  ...extra,
});

test("the register shows days a manager managed for someone who has since left their team", () => {
  const days = ["2026-10-05", "2026-10-06", "2026-10-07"]; // Mon to Wed
  const register = buildAttendanceRegister({
    days,
    people: [{ uid: "stay", displayName: "Stays Here", department: "Sales" }],
    summaries: [day("stay", "2026-10-05"), day("gone", "2026-10-05"), day("gone", "2026-10-06")],
    leaves: [],
    holidays: [],
    timezone: TZ,
    generatedAt: "2026-10-08T00:00:00.000Z",
    from: days[0],
    to: days[2],
  });
  const gone = register.rows.find((r) => r.employeeId === "gone");
  assert.ok(gone, "a row exists for the person who moved away");
  assert.equal(gone.name, "Name gone");
  assert.deepEqual(gone.days.map((d) => d.status), ["present", "present", "other"]);
  assert.equal(gone.totals.presentDays, 2);
  assert.equal(gone.totals.absentDays, 0, "no absence is claimed for days that are not on this team");
  // The current team is unchanged and listed first.
  assert.equal(register.rows[0].employeeId, "stay");
});

test("the Today panel counts only people who are on the team now", () => {
  const roster = [{ uid: "here", displayName: "Here" }];
  const summaries = [
    { ...day("here", "2026-10-12"), state: "in" },
    { ...day("moved-away", "2026-10-12", { late: true }), state: "out" },
  ];
  const t = buildTodayFromSummaries({
    summaries,
    recentEvents: [],
    roster,
    timezone: TZ,
    now: Date.parse("2026-10-12T12:00:00.000Z"),
  });
  assert.equal(t.counts.expected, 1);
  assert.equal(t.counts.present, 1, "the person who moved away is not counted as present on this team");
  assert.equal(t.counts.late, 0);
  assert.equal(t.counts.absent, 0);
});

// ---------------------------------------------------------------- guards on the real code
test("the database index for looking up a person's days exists", () => {
  const idx = JSON.parse(readFileSync("firestore.indexes.json", "utf8")).indexes;
  const found = idx.some(
    (i) =>
      i.collectionGroup === "daily_summaries" &&
      i.fields.map((f) => f.fieldPath).join(",") === "orgId,employeeId,dayKey",
  );
  assert.ok(found, "daily_summaries needs an (orgId, employeeId, dayKey) index");
});
