import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAttendanceRegister } from "../../src/lib/report-data.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ---------------------------------------------------------------- the dashboard's headcount: counts, not lists
const route = read("src/routes/api/admin/staff-invites.ts");
const dashboard = read("src/routes/_authenticated/dashboard.tsx");
const summary = route.slice(route.indexOf('url.searchParams.get("view") === "summary"'), route.indexOf("let query = firestoreAdmin.collection"));

test("the summary answer is for the signed-in admin or manager only, and the caller is checked first", () => {
  const check = route.indexOf("const ctx = await requireStaffLead(request);");
  const view = route.indexOf('url.searchParams.get("view") === "summary"');
  assert.ok(check > 0 && view > check, "who is asking is decided before anything is counted");
  assert.ok(summary.includes("ctx.orgId") && !/searchParams\.get\("(org|manager|uid|role)/.test(summary), "scope comes from the verified caller");
});

test("a manager is counted for their own team only, an admin for the organization", () => {
  assert.ok(summary.includes('.where("orgId", "==", ctx.orgId)'));
  assert.ok(summary.includes('ctx.role === "manager"') && summary.includes('.where("managerId", "==", ctx.uid)'));
});

test("it reads three counts and no documents, and returns only the numbers", () => {
  assert.equal((summary.match(/\.count\(\)\.get\(\)/g) ?? []).length, 3);
  assert.ok(!/\.docs\b|\.limit\(/.test(summary), "no documents are read");
  for (const field of ["totalHeadcount", "invitesSent", "pendingInvites"]) assert.ok(summary.includes(field), field);
  assert.ok(!/email|displayName|members|invites:\s/.test(summary.replace(/invitesSent|pendingInvites/g, "")), "no names or addresses leave in a count");
  assert.ok(summary.includes("private, no-store"), "never cached, so a new invitation shows at once");
});

test("the dashboard asks for the summary, not the whole list of people and invitations", () => {
  assert.ok(dashboard.includes('fetch("/api/admin/staff-invites?view=summary"'));
  assert.ok(!/staffData\.invites(?![A-Za-z])/.test(dashboard) && !dashboard.includes("staffData.members"), "it no longer walks the full list");
});

test("pages that list people still get the full list", () => {
  assert.ok(read("src/components/shifts/RotaTab.tsx").includes('"/api/admin/staff-invites"'));
  assert.ok(read("src/routes/_authenticated/departments.tsx").includes('"/api/admin/staff-invites"'));
  assert.ok(route.includes("members,") && route.includes("invites,"), "the full list answer is unchanged");
});

// ---------------------------------------------------------------- work from home in organizations that use shifts
const DAYS = ["2026-10-19", "2026-10-20", "2026-10-21"]; // Monday to Wednesday
const people = [{ uid: "a", displayName: "Ama" }];
const SHIFT = { shiftId: "day", name: "Day", type: "day", start: "08:00", end: "16:00", graceMinutes: 15, expectedMinutes: null };
const wfhDays = ["2026-10-19", "2026-10-20", "2026-10-21"].map((d) => ({ employeeId: "a", dayKey: d }));

function reg(extra) {
  return buildAttendanceRegister({
    days: DAYS, people, summaries: [], leaves: [], holidays: [], timezone: "UTC",
    generatedAt: "2026-10-21T20:00:00.000Z", from: DAYS[0], to: DAYS[2], wfh: wfhDays, ...extra,
  });
}
const status = (r) => r.rows[0].days.map((d) => d.status);

test("with shifts, a declared work-from-home day counts only on a day the person has a shift", () => {
  const assignments = [{ employeeId: "a", dayKey: "2026-10-20", shift: SHIFT }];
  const r = reg({ shifts: { assignments, nowMs: Date.parse("2026-10-21T20:00:00.000Z") } });
  assert.deepEqual(status(r), ["off", "wfh", "off"]);
  assert.equal(r.rows[0].totals.wfhDays, 1, "only the rostered day is a day attended");
});

test("with shifts, a day with no shift does not lift attendance through a declaration", () => {
  const r = reg({ shifts: { assignments: [], nowMs: Date.parse("2026-10-21T20:00:00.000Z") } });
  assert.equal(r.rows[0].totals.wfhDays, 0);
  assert.ok(r.rows[0].days.every((d) => d.status === "off"));
});

test("without shifts nothing changes: a declaration counts on any day, as before", () => {
  const r = reg({});
  assert.deepEqual(status(r), ["wfh", "wfh", "wfh"]);
  assert.equal(r.rows[0].totals.wfhDays, 3);
});

test("a scan or approved leave still beats a declaration, with shifts too", () => {
  const assignments = ["2026-10-19", "2026-10-20"].map((d) => ({ employeeId: "a", dayKey: d, shift: SHIFT }));
  const r = reg({
    shifts: { assignments, nowMs: Date.parse("2026-10-21T20:00:00.000Z") },
    summaries: [{ employeeId: "a", dayKey: "2026-10-19", minutesWorked: 480, firstIn: "2026-10-19T08:00:00.000Z" }],
    leaves: [{ employeeId: "a", status: "approved", startDate: "2026-10-20", endDate: "2026-10-20" }],
  });
  assert.deepEqual(status(r), ["present", "leave", "off"]);
});
