import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blockRange,
  checksLine,
  checksPerHourText,
  decisionState,
  intervalStateLabel,
  isDayKey,
  managerStatusLabel,
  minutesIntoSession,
  reasonLines,
  retentionText,
  shiftDay,
  sortForReview,
  teamTotals,
  totalEvents,
} from "../../src/lib/wfh-diary-review.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const day = (over) => ({
  employeeId: "u1",
  employeeName: "Ama",
  dayKey: "2026-10-20",
  verifiedMinutes: 120,
  unverifiedMinutes: 0,
  pausedMinutes: 0,
  pendingMinutes: 0,
  intervalCount: 12,
  flags: [],
  reviewFlags: 0,
  status: "pending",
  decidedBy: null,
  decidedAt: null,
  ...over,
});

// ---------------------------------------------------------------- days
test("days move by calendar day, across month and year ends", () => {
  assert.equal(shiftDay("2026-10-20", 1), "2026-10-21");
  assert.equal(shiftDay("2026-10-31", 1), "2026-11-01");
  assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDay("2028-02-28", 1), "2028-02-29");
});

test("only real days are accepted", () => {
  assert.equal(isDayKey("2026-10-20"), true);
  assert.equal(isDayKey("2026-02-30"), false);
  assert.equal(isDayKey("20-10-2026"), false);
  assert.equal(isDayKey(""), false);
});

// ---------------------------------------------------------------- the list
test("people to look at come first, then undecided days, then flagged, then approved; ties by name", () => {
  const ordered = sortForReview([
    day({ employeeId: "a", employeeName: "Approved", status: "approved" }),
    day({ employeeId: "b", employeeName: "Waiting", status: "pending" }),
    day({ employeeId: "c", employeeName: "Look", status: "pending", reviewFlags: 2 }),
    day({ employeeId: "d", employeeName: "Flagged", status: "flagged", reviewFlags: 1 }),
    day({ employeeId: "e", employeeName: "Also waiting", status: "pending" }),
  ]);
  assert.deepEqual(ordered.map((d) => d.employeeName), ["Look", "Also waiting", "Waiting", "Flagged", "Approved"]);
});

test("sorting never changes the list it is given", () => {
  const input = [day({ employeeName: "B", status: "approved" }), day({ employeeId: "x", employeeName: "A" })];
  const copy = JSON.stringify(input);
  sortForReview(input);
  assert.equal(JSON.stringify(input), copy);
});

test("totals count each state once and add up only approved hours", () => {
  const t = teamTotals([
    day({ status: "approved", verifiedMinutes: 100 }),
    day({ status: "approved", verifiedMinutes: 50 }),
    day({ status: "flagged", verifiedMinutes: 30 }),
    day({ status: "pending", verifiedMinutes: 20, reviewFlags: 1 }),
    day({ status: "pending", verifiedMinutes: 10 }),
  ]);
  assert.deepEqual(t, { people: 5, waiting: 2, approved: 2, flagged: 1, needLook: 1, verifiedMinutes: 210, approvedMinutes: 150 });
  assert.equal(teamTotals([]).people, 0);
});

test("the manager's wording for a day, in the style guide's status colors", () => {
  assert.equal(managerStatusLabel("approved").text, "Approved");
  assert.match(managerStatusLabel("approved").className, /CBEED3/);
  assert.match(managerStatusLabel("flagged").className, /amber/);
  assert.equal(managerStatusLabel("pending").text, "Waiting for your decision");
});

// ---------------------------------------------------------------- deciding
test("a day cannot be decided while it waits on a check, or before any block arrived", () => {
  const waiting = decisionState(day({ pendingMinutes: 10 }));
  assert.deepEqual([waiting.approve, waiting.flag], [false, false]);
  assert.match(waiting.note, /still waiting/);
  const empty = decisionState(day({ intervalCount: 0 }));
  assert.deepEqual([empty.approve, empty.flag], [false, false]);
});

test("an undecided day can be approved or flagged; a decided day offers only the other choice", () => {
  assert.deepEqual(decisionState(day()), { approve: true, flag: true, note: null });
  assert.deepEqual(decisionState(day({ status: "approved" })), { approve: false, flag: true, note: null });
  assert.deepEqual(decisionState(day({ status: "flagged" })), { approve: true, flag: false, note: null });
});

// ---------------------------------------------------------------- detail
test("block states and reasons are in plain words; unknown ones never break the screen", () => {
  assert.equal(intervalStateLabel("verified").text, "Counted");
  assert.equal(intervalStateLabel("unverified").text, "Not counted");
  assert.equal(intervalStateLabel("surprise").text, "Unknown");
  assert.deepEqual(reasonLines(["paused", "missed_check", "bad_signature", "other"]), [
    "Paused",
    "Missed a still-here check",
    "The figures could not be verified",
  ]);
});

test("times are shown as time into the session, never as clock times", () => {
  assert.equal(blockRange(0), "0:00 to 0:10");
  assert.equal(blockRange(5), "0:50 to 1:00");
  assert.equal(blockRange(7), "1:10 to 1:20");
  assert.equal(minutesIntoSession(1_000_000 + 47 * 60_000, 1_000_000), "0:47");
  assert.equal(minutesIntoSession(1_000_000 + 135 * 60_000, 1_000_000), "2:15");
  assert.equal(minutesIntoSession(0, 1_000_000), "0:00");
});

test("event totals and the checks sentence", () => {
  assert.equal(totalEvents({ keys: 1, clicks: 2, scrolls: 3, moves: 4 }), 10);
  assert.equal(totalEvents(undefined), 0);
  assert.equal(checksLine([]), "No still-here checks have fallen due yet.");
  assert.equal(checksLine([{ answeredAtMs: 5 }, { answeredAtMs: null }, { answeredAtMs: 9 }]), "2 of 3 still-here checks answered.");
});

test("settings wording", () => {
  assert.equal(checksPerHourText(0), "No still-here checks");
  assert.equal(checksPerHourText(1), "1 check an hour");
  assert.equal(checksPerHourText(3), "3 checks an hour");
  assert.equal(retentionText(12), "12 months (1 year)");
  assert.equal(retentionText(24), "24 months (2 years)");
  assert.equal(retentionText(6), "6 months");
  assert.equal(retentionText(7), "7 months");
});

// ---------------------------------------------------------------- the screens and the route
const page = read("src/routes/_authenticated/wfh-review.tsx");
const list = read("src/components/wfh/diary/DiaryReviewList.tsx");
const dialog = read("src/components/wfh/diary/DiaryDayDialog.tsx");
const settings = read("src/components/wfh/diary/DiarySettingsCard.tsx");
const api = read("src/routes/api/wfh-diary.ts");
const shell = read("src/components/AppShell.tsx");

test("the review page is for managers and admins, and the shell turns everyone else away", () => {
  assert.ok(page.includes("if (!isOrgAdmin && !isManager) return null;"));
  assert.ok(/MANAGER_ONLY_PATHS = \[[^\]]*"\/wfh-review"/.test(shell));
  assert.ok(shell.includes('{ to: "/wfh-review", label: "Work diary", icon: Laptop }'));
  const managerBlock = shell.slice(shell.indexOf("if (canManage)"), shell.indexOf("return [", shell.indexOf("if (canManage)") + 20) + 4000);
  assert.ok(managerBlock.includes("/wfh-review"));
});

test("a decision sends only who, which day and approve or flag; never an organization, a manager or a role", () => {
  assert.ok(page.includes('action: "decide", employeeId: d.employeeId, dayKey: d.dayKey, decision'));
  const body = page.slice(page.indexOf('action: "decide"'), page.indexOf('action: "decide"') + 120);
  for (const forbidden of ["orgId", "managerId", "role"]) assert.ok(!body.includes(forbidden), forbidden);
});

test("only admins see the settings card, and the server refuses everyone else too", () => {
  assert.ok(page.includes("{isOrgAdmin && <DiarySettingsCard />}"));
  assert.ok(api.includes('view === "settings"'));
  const fn = api.slice(api.indexOf("async function viewSettings"), api.indexOf("function diaryError"));
  assert.ok(fn.includes('caller.role !== "org_admin"') && fn.includes("403"));
  assert.ok(settings.includes("wfhDiaryEnabled") && settings.includes("livenessChecksPerHour") && settings.includes("diaryRetentionMonths"));
  assert.ok(!settings.includes("OvertimeHours") && !/countsTowardOvertime/i.test(settings), "the overtime switch stays with the integrator");
});

test("the screens show counts only: no keys, no content, no clocks, no polling, no location", () => {
  const all = page + list + dialog + settings;
  for (const forbidden of [/\.key\b/, /innerText/, /clipboard/i, /geolocation/, /toLocaleTimeString/, /toLocaleString/, /new Date\(/]) {
    assert.ok(!forbidden.test(all), String(forbidden));
  }
  assert.ok(!/setInterval/.test(all), "nothing polls the server");
});

test("loading, error and empty states exist, buttons are tall enough to tap, and people are tapped to open", () => {
  for (const text of ["<Skeleton", "Try again", "No work sessions on", "Couldn't load the diary days"]) assert.ok((page + dialog).includes(text), text);
  assert.ok((list.match(/className="h-10/g) ?? []).length >= 2);
  assert.ok(list.includes("onOpen(d)"));
});

test("the day detail asks for one person and day through the server, which decides who may see it", () => {
  assert.ok(dialog.includes('new URLSearchParams({ view: "detail", employeeId, day: dayKey })'));
  // The server side was reviewed with the routes: managers see their own team, admins all, nobody else.
  assert.ok(api.includes("canDecideDay("));
});

test("the day picker accepts only real days and never reads the device's date", () => {
  assert.ok(page.includes("if (!isDayKey(next)) return;"));
  assert.ok(page.includes("load(null)"), "today comes from the server");
});
