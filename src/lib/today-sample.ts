import type {
  TodayEventRow,
  TodayLate,
  TodayPerson,
  TodaySummaryData,
} from "@/lib/attendance-today";

/**
 * Sample data for the Today panel preview (/today-preview). It uses the real
 * TodaySummaryData type from attendance-today.ts, so if that type changes this
 * file stops compiling and has to be updated.
 *
 * The numbers here are written out by hand to be consistent with each other.
 * The panel itself never calculates anything.
 */

export type TodaySampleKey = "normal" | "empty" | "manyLate" | "largeTeam";

const DAY_KEY = "2026-10-06";
// Africa/Accra is UTC+0, so the ISO timestamps below read the same as `time`.
const TIMEZONE = "Africa/Accra";
const MAIN = "Main entrance";
const BACK = "Back gate";

interface Staff {
  id: string;
  name: string;
  department: string;
}

interface EventSpec {
  who: Staff;
  type: "in" | "out";
  time: string; // "HH:MM"
  late?: boolean;
  earlyDeparture?: boolean;
  location?: string;
}

function staff(n: number, name: string, department: string): Staff {
  return { id: `emp-${String(n).padStart(3, "0")}`, name, department };
}

function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return letters || "EM";
}

function emailOf(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.+|\.+$/g, "")}@example.com`;
}

function person(who: Staff): TodayPerson {
  return { employeeId: who.id, name: who.name, department: who.department };
}

function lateOf(who: Staff, arrivedAt: string): TodayLate {
  return { ...person(who), arrivedAt };
}

/** Builds the event rows, newest first, exactly as the server returns them. */
function toRows(specs: EventSpec[]): TodayEventRow[] {
  return specs
    .map(
      (s, i): TodayEventRow => ({
        id: `evt-${String(i + 1).padStart(3, "0")}`,
        employeeId: s.who.id,
        name: s.who.name,
        email: emailOf(s.who.name),
        initials: initialsOf(s.who.name),
        department: s.who.department,
        location: s.location ?? MAIN,
        type: s.type,
        late: s.late === true,
        earlyDeparture: s.earlyDeparture === true,
        time: s.time,
        timestamp: `${DAY_KEY}T${s.time}:00.000Z`,
      }),
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function byName(a: TodayPerson, b: TodayPerson): number {
  return a.name.localeCompare(b.name);
}

// ---------------------------------------------------------------------------
// A small team (15 people)
// ---------------------------------------------------------------------------

const ama = staff(1, "Ama Mensah", "Operations");
const kofi = staff(2, "Kofi Boateng", "Operations");
const esi = staff(3, "Esi Owusu", "Sales");
const yaw = staff(4, "Yaw Asante", "Sales");
const akosua = staff(5, "Akosua Adjei", "Finance");
const kwame = staff(6, "Kwame Osei", "Finance");
const abena = staff(7, "Abena Darko", "Support");
const nana = staff(8, "Nana Yeboah", "Support");
const efua = staff(9, "Efua Quaye", "Operations");
const kojo = staff(10, "Kojo Antwi", "Sales");
const adwoa = staff(11, "Adwoa Sarpong", "Support");
const kwesi = staff(12, "Kwesi Appiah", "Finance");
const adjoa = staff(13, "Adjoa Frimpong", "Operations");
const fiifi = staff(14, "Fiifi Tetteh", "Sales");
const maame = staff(15, "Maame Serwaa", "Support");

// ---- Normal day: 12 expected, 9 here, 2 late, 3 not arrived yet ----

const normalRows = toRows([
  { who: ama, type: "in", time: "07:52" },
  { who: nana, type: "in", time: "07:58" },
  { who: kofi, type: "in", time: "08:02" },
  { who: esi, type: "in", time: "08:05" },
  { who: efua, type: "in", time: "08:09" },
  { who: yaw, type: "in", time: "08:11" },
  { who: akosua, type: "in", time: "08:14" },
  { who: kwame, type: "in", time: "08:31", late: true },
  { who: abena, type: "in", time: "08:44", late: true },
  { who: efua, type: "out", time: "12:05" },
  { who: nana, type: "out", time: "12:20", earlyDeparture: true },
]);

const normal: TodaySummaryData = {
  dayKey: DAY_KEY,
  timezone: TIMEZONE,
  generatedAt: `${DAY_KEY}T12:36:00.000Z`,
  counts: { expected: 12, present: 9, onSite: 7, late: 2, onLeave: 0, wfh: 0, absent: 3 },
  onTimeRate: { percent: 78, onTime: 7, total: 9 },
  avgShift: { completed: 2, inProgress: 7, avgMinutes: 249 },
  events: normalRows.slice(0, 20),
  eventsTotal: normalRows.length,
  late: [lateOf(kwame, "08:31"), lateOf(abena, "08:44")],
  notArrived: [adwoa, kojo, kwesi].map(person).sort(byName),
  truncated: false,
};

// ---- Empty day: nobody has checked in yet ----

const empty: TodaySummaryData = {
  dayKey: DAY_KEY,
  timezone: TIMEZONE,
  generatedAt: `${DAY_KEY}T06:30:00.000Z`,
  counts: { expected: 3, present: 0, onSite: 0, late: 0, onLeave: 0, wfh: 0, absent: 3 },
  onTimeRate: { percent: null, onTime: 0, total: 0 },
  avgShift: { completed: 0, inProgress: 0, avgMinutes: null },
  events: [],
  eventsTotal: 0,
  late: [],
  notArrived: [ama, kofi, esi].map(person).sort(byName),
  truncated: false,
};

// ---- Many late: 15 expected, 13 here, 6 of them late ----

const manyLateRows = toRows([
  { who: ama, type: "in", time: "07:52" },
  { who: kofi, type: "in", time: "08:02" },
  { who: esi, type: "in", time: "08:05" },
  { who: kwesi, type: "in", time: "08:07" },
  { who: nana, type: "in", time: "08:10" },
  { who: efua, type: "in", time: "08:12" },
  { who: adwoa, type: "in", time: "08:14" },
  { who: yaw, type: "in", time: "08:27", late: true },
  { who: akosua, type: "in", time: "08:33", late: true },
  { who: kwame, type: "in", time: "08:41", late: true },
  { who: abena, type: "in", time: "08:49", late: true },
  { who: kojo, type: "in", time: "09:05", late: true },
  { who: adjoa, type: "in", time: "09:20", late: true },
  { who: efua, type: "out", time: "12:05" },
]);

const manyLate: TodaySummaryData = {
  dayKey: DAY_KEY,
  timezone: TIMEZONE,
  generatedAt: `${DAY_KEY}T12:30:00.000Z`,
  counts: { expected: 15, present: 13, onSite: 12, late: 6, onLeave: 0, wfh: 0, absent: 2 },
  onTimeRate: { percent: 54, onTime: 7, total: 13 },
  avgShift: { completed: 1, inProgress: 12, avgMinutes: 233 },
  events: manyLateRows.slice(0, 20),
  eventsTotal: manyLateRows.length,
  late: [
    lateOf(yaw, "08:27"),
    lateOf(akosua, "08:33"),
    lateOf(kwame, "08:41"),
    lateOf(abena, "08:49"),
    lateOf(kojo, "09:05"),
    lateOf(adjoa, "09:20"),
  ],
  notArrived: [fiifi, maame].map(person).sort(byName),
  truncated: false,
};

// ---------------------------------------------------------------------------
// A large team (52 people): 40 not arrived, 27 events today but only the
// newest 20 sent, two very long names, two entrances, and the "busy day" flag.
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Ama", "Kofi", "Esi", "Yaw", "Akosua", "Kwame", "Abena", "Nana", "Efua", "Kojo",
  "Adwoa", "Kwesi", "Adjoa", "Fiifi", "Maame", "Kwabena", "Araba", "Yaa", "Kobby", "Afia",
  "Selasi", "Mawuli", "Dzifa", "Edem", "Elikem",
];
const LAST_NAMES = [
  "Mensah", "Boateng", "Owusu", "Asante", "Adjei", "Osei", "Darko", "Yeboah", "Quaye",
  "Antwi", "Sarpong", "Appiah", "Frimpong", "Tetteh", "Serwaa", "Agyei", "Baidoo", "Ofori",
];
const DEPARTMENTS = ["Operations", "Sales", "Finance", "Support", "Logistics", "Human Resources"];

function pick<T>(list: readonly T[], i: number): T {
  return list[i % list.length] as T;
}

const largeTeam: Staff[] = Array.from({ length: 52 }, (_, i) => {
  const first = pick(FIRST_NAMES, i);
  const last = pick(LAST_NAMES, i * 7 + Math.floor(i / FIRST_NAMES.length));
  return staff(100 + i, `${first} ${last}`, pick(DEPARTMENTS, i));
});
// Two long names to check truncation: one on the activity list, one on the not-arrived list.
largeTeam[5] = staff(105, "Nana Kwabena Owusu-Ansah Agyemang-Prempeh", "Corporate Communications and Public Affairs");
largeTeam[30] = staff(130, "Abena Serwaa Boateng-Mensah Asamoah-Danquah", "Human Resources");

function member(i: number): Staff {
  return largeTeam[i] as Staff;
}

const largeRows = toRows([
  // First arrivals (12 people are here; the last three are late)
  { who: member(0), type: "in", time: "07:41" },
  { who: member(1), type: "in", time: "07:46" },
  { who: member(2), type: "in", time: "07:52" },
  { who: member(3), type: "in", time: "07:55", location: BACK },
  { who: member(4), type: "in", time: "08:00" },
  { who: member(5), type: "in", time: "08:03" },
  { who: member(6), type: "in", time: "08:06" },
  { who: member(7), type: "in", time: "08:09", location: BACK },
  { who: member(8), type: "in", time: "08:12" },
  { who: member(9), type: "in", time: "08:31", late: true },
  { who: member(10), type: "in", time: "08:38", late: true },
  { who: member(11), type: "in", time: "08:52", late: true, location: BACK },
  // Lunch: eight people go out
  { who: member(0), type: "out", time: "12:02" },
  { who: member(1), type: "out", time: "12:05" },
  { who: member(2), type: "out", time: "12:08" },
  { who: member(3), type: "out", time: "12:11" },
  { who: member(4), type: "out", time: "12:14" },
  { who: member(5), type: "out", time: "12:17" },
  { who: member(6), type: "out", time: "12:20" },
  { who: member(7), type: "out", time: "12:23" },
  // Seven of them are back
  { who: member(0), type: "in", time: "12:48" },
  { who: member(1), type: "in", time: "12:51" },
  { who: member(2), type: "in", time: "12:55" },
  { who: member(3), type: "in", time: "12:58" },
  { who: member(4), type: "in", time: "13:02" },
  { who: member(5), type: "in", time: "13:05" },
  { who: member(6), type: "in", time: "13:09" },
]);

const largeTeamToday: TodaySummaryData = {
  dayKey: DAY_KEY,
  timezone: TIMEZONE,
  generatedAt: `${DAY_KEY}T13:10:00.000Z`,
  counts: { expected: 52, present: 12, onSite: 11, late: 3, onLeave: 0, wfh: 0, absent: 40 },
  onTimeRate: { percent: 75, onTime: 9, total: 12 },
  avgShift: { completed: 8, inProgress: 11, avgMinutes: 262 },
  events: largeRows.slice(0, 20), // the server sends at most 20
  eventsTotal: largeRows.length, // 27
  late: [lateOf(member(9), "08:31"), lateOf(member(10), "08:38"), lateOf(member(11), "08:52")],
  notArrived: largeTeam.slice(12).map(person).sort(byName), // 40 people
  truncated: true,
};

export const todaySamples: Record<TodaySampleKey, TodaySummaryData> = {
  normal,
  empty,
  manyLate,
  largeTeam: largeTeamToday,
};
