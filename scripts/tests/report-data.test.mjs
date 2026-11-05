import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REPORT_DAYS,
  REPORT_ROW_CAP,
  buildAttendanceRegister,
  buildLeaveLedger,
  decidedOnDay,
  parseReportRange,
  personName,
} from "../../src/lib/report-data.ts";

// 2026-10-05 is a Monday. Africa/Accra is UTC+0, so an ISO instant reads the same clock time.
const TZ = "Africa/Accra";

// ------------------------------------------------------------ the date range
test("parseReportRange: lists the days, and refuses a missing, backwards, impossible or too long range", () => {
  const ok = parseReportRange("2026-10-05", "2026-10-07");
  assert.deepEqual(ok, { ok: true, from: "2026-10-05", to: "2026-10-07", days: ["2026-10-05", "2026-10-06", "2026-10-07"] });
  assert.equal(parseReportRange("2026-10-05", "2026-10-05").ok, true);
  assert.equal(parseReportRange(null, "2026-10-07").ok, false);
  assert.equal(parseReportRange("2026-10-07", "2026-10-05").ok, false);
  assert.equal(parseReportRange("2026-02-30", "2026-03-02").ok, false);
  assert.equal(parseReportRange("10/05/2026", "2026-10-07").ok, false);
  assert.equal(parseReportRange("2026-10-01", "2026-10-31").ok, true); // exactly 31 days
  const long = parseReportRange("2026-10-01", "2026-11-01"); // 32 days
  assert.equal(long.ok, false);
  assert.match(long.error, new RegExp(String(MAX_REPORT_DAYS)));
});

// ------------------------------------------------------------ the register
const people = [
  { uid: "u1", displayName: "Zed Mensah", email: "zed@x.com", department: "Ops" },
  { uid: "u2", displayName: "Ama Boateng", email: "ama@x.com", department: "" },
  { uid: "u3", email: "kofi@x.com" },
];
const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]; // Mon..Sun
const base = { days, timezone: TZ, generatedAt: "2026-10-12T08:00:00Z", from: days[0], to: days[6] };

const sum = (employeeId, dayKey, over = {}) => ({
  employeeId,
  dayKey,
  firstIn: `${dayKey}T08:14:30Z`,
  lastOut: `${dayKey}T17:02:00Z`,
  minutesWorked: 495,
  late: false,
  earlyDeparture: false,
  ...over,
});

test("register: every day gets exactly one status, and a scan always wins", () => {
  const reg = buildAttendanceRegister({
    ...base,
    people: [people[0]],
    summaries: [
      sum("u1", "2026-10-05"), // Monday, scanned
      sum("u1", "2026-10-10", { late: true }), // worked on a Saturday
      sum("u1", "2026-10-08"), // scanned on a holiday
    ],
    leaves: [{ employeeId: "u1", status: "approved", startDate: "2026-10-06", endDate: "2026-10-07" }],
    holidays: ["2026-10-08", "2026-10-09"],
  });
  const st = Object.fromEntries(reg.rows[0].days.map((d) => [d.dayKey, d.status]));
  assert.deepEqual(st, {
    "2026-10-05": "present",
    "2026-10-06": "leave",
    "2026-10-07": "leave",
    "2026-10-08": "present", // scan beats the holiday
    "2026-10-09": "holiday",
    "2026-10-10": "present", // scan beats the weekend
    "2026-10-11": "off", // Sunday, nobody expected
  });
});

test("register: a weekday with no scan, no leave and no holiday is absent; only approved leave counts", () => {
  const reg = buildAttendanceRegister({
    ...base,
    people: [people[0]],
    summaries: [],
    leaves: [
      { employeeId: "u1", status: "pending", startDate: "2026-10-05", endDate: "2026-10-05" },
      { employeeId: "u1", status: "denied", startDate: "2026-10-06", endDate: "2026-10-06" },
    ],
    holidays: [],
  });
  const st = reg.rows[0].days.map((d) => d.status);
  assert.deepEqual(st, ["absent", "absent", "absent", "absent", "absent", "off", "off"]);
  assert.deepEqual(reg.rows[0].totals, { presentDays: 0, lateDays: 0, absentDays: 5, leaveDays: 0, wfhDays: 0, minutesWorked: 0 });
});

test("register: times are in the organization's timezone, totals add up, late is counted on present days", () => {
  const reg = buildAttendanceRegister({
    ...base,
    timezone: "Asia/Tokyo",
    people: [people[0]],
    summaries: [sum("u1", "2026-10-05", { late: true }), sum("u1", "2026-10-06", { earlyDeparture: true })],
    leaves: [],
    holidays: [],
  });
  const [mon, tue] = reg.rows[0].days;
  assert.equal(mon.firstIn, "17:14"); // 08:14 UTC is 17:14 in Tokyo
  assert.equal(mon.late, true);
  assert.equal(tue.earlyDeparture, true);
  assert.equal(reg.rows[0].totals.presentDays, 2);
  assert.equal(reg.rows[0].totals.lateDays, 1);
  assert.equal(reg.rows[0].totals.minutesWorked, 990);
});

test("register: names are never IDs, people are sorted by name, a missing department stays empty", () => {
  const reg = buildAttendanceRegister({ ...base, people, summaries: [], leaves: [], holidays: [] });
  assert.deepEqual(reg.rows.map((r) => r.name), ["Ama Boateng", "kofi", "Zed Mensah"]);
  assert.equal(reg.rows[0].department, "");
  assert.equal(personName({ displayName: "  ", email: "" }), "Unknown");
});

test("register: one person's summary never leaks into another person's row, and bad rows are ignored", () => {
  const reg = buildAttendanceRegister({
    ...base,
    people: [people[0], people[1]],
    summaries: [sum("u1", "2026-10-05"), { employeeId: 5, dayKey: "2026-10-05" }, { employeeId: "u2", dayKey: "nope" }],
    leaves: [],
    holidays: [],
  });
  assert.equal(reg.rows.find((r) => r.employeeId === "u2").totals.presentDays, 0);
  assert.equal(reg.rows.find((r) => r.employeeId === "u1").totals.presentDays, 1);
});

test("register: says so when the data was cut short, and caps the number of people", () => {
  const many = Array.from({ length: REPORT_ROW_CAP + 5 }, (_, i) => ({ uid: `p${i}`, displayName: `P ${String(i).padStart(4, "0")}` }));
  const capped = buildAttendanceRegister({ ...base, people: many, summaries: [], leaves: [], holidays: [] });
  assert.equal(capped.rows.length, REPORT_ROW_CAP);
  assert.equal(capped.truncated, true);
  const cut = buildAttendanceRegister({ ...base, people, summaries: [], leaves: [], holidays: [], readTruncated: true });
  assert.equal(cut.truncated, true);
  assert.equal(buildAttendanceRegister({ ...base, people, summaries: [], leaves: [], holidays: [] }).truncated, false);
});

// ------------------------------------------------------------ the leave ledger
test("ledger: only requests that overlap the range, with names, readable types, days and decided dates", () => {
  const ledger = buildLeaveLedger({
    people,
    timezone: TZ,
    generatedAt: "2026-10-12T08:00:00Z",
    from: "2026-10-05",
    to: "2026-10-11",
    leaves: [
      { id: "a", employeeId: "u1", type: "annual", startDate: "2026-10-06", endDate: "2026-10-08", status: "approved", reviewedAt: "2026-10-03T10:00:00Z" },
      { id: "b", employeeId: "u2", type: "sick", startDate: "2026-10-11", endDate: "2026-10-14", status: "pending" }, // starts inside, ends after
      { id: "c", employeeId: "u2", type: "annual", startDate: "2026-09-01", endDate: "2026-09-04", status: "approved" }, // before
      { id: "d", employeeId: "u1", type: "annual", startDate: "2026-10-20", endDate: "2026-10-21", status: "approved" }, // after
      { id: "e", employeeId: "u9", employeeName: "Old Hand", type: "weird", startDate: "2026-10-05", endDate: "2026-10-05", status: "denied", reviewedAt: new Date("2026-10-04T23:30:00Z") },
      { id: "f", employeeId: "u1", type: "annual", startDate: "2026-10-05", endDate: "2026-10-05", status: "maybe" }, // unknown status
    ],
  });
  assert.deepEqual(ledger.rows.map((r) => r.id), ["e", "a", "b"]); // by start date, then name
  const a = ledger.rows.find((r) => r.id === "a");
  assert.equal(a.name, "Zed Mensah");
  assert.equal(a.type, "Annual leave");
  assert.equal(a.days, 3);
  assert.equal(a.decidedOn, "2026-10-03");
  const b = ledger.rows.find((r) => r.id === "b");
  assert.equal(b.decidedOn, null); // pending
  assert.equal(b.type, "Sick leave");
  const e = ledger.rows.find((r) => r.id === "e");
  assert.equal(e.name, "Old Hand"); // not on the team any more: the saved name, never an ID
  assert.equal(e.type, "Other");
  assert.equal(e.decidedOn, "2026-10-04");
});

test("decidedOnDay: handles ISO text, dates, Firestore-style timestamps and rubbish", () => {
  assert.equal(decidedOnDay("2026-10-03T23:30:00Z", "Asia/Tokyo"), "2026-10-04"); // already the next day there
  assert.equal(decidedOnDay(new Date("2026-10-03T10:00:00Z"), TZ), "2026-10-03");
  assert.equal(decidedOnDay({ toMillis: () => Date.parse("2026-10-03T10:00:00Z") }, TZ), "2026-10-03");
  assert.equal(decidedOnDay("not a date", TZ), null);
  assert.equal(decidedOnDay(undefined, TZ), null);
});
