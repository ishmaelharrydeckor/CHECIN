// SAMPLE DATA ONLY. The integrator replaces this with server data in the same shape.
// Totals are worked out here only because the real server does that work; the screens
// never calculate them. Which statuses count as "present" is a sample choice.
import type {
  AttendanceRegister,
  LeaveLedger,
  LeaveLedgerRow,
  RegisterDay,
  RegisterRow,
} from "./report-types";

export type SampleCase = "normal" | "small" | "empty" | "large";

export const DEFAULT_SAMPLE_RANGE = { from: "2026-10-01", to: "2026-10-14" };

const DAY_MS = 86_400_000;
const TIMEZONE = "Africa/Accra";

function parseDay(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function toKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function dayKeysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = parseDay(from); t <= parseDay(to) && out.length < 400; t += DAY_MS) out.push(toKey(t));
  return out;
}
function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// Small deterministic random generator so the sample never changes between renders.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Ama", "Kofi", "Akosua", "Kwame", "Efua", "Yaw", "Abena", "Kwesi", "Esi", "Nana", "Zoë", "José", "Élodie", "Chloé", "Noël", "Søren", "Zainab", "Ibrahim", "Fatima", "Joyce"];
const LAST = ["Mensah", "Boateng", "Owusu", "Asante", "Appiah", "Quaye", "Darko", "Tetteh", "Amoah", "Ofori", "O'Brien", "Müller", "García", "Nyarko", "Adjei"];
const DEPTS = ["Operations", "Finance", "Engineering", "Sales", "Human Resources", "Customer Support"];

interface Person {
  id: string;
  name: string;
  department: string;
}

function makePeople(count: number): Person[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `emp-${String(i + 1).padStart(3, "0")}`,
    name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`,
    department: DEPTS[i % DEPTS.length],
  }));
}

// Three people whose names/departments start with = + - @ or contain commas, quotes and
// accents, to prove the CSV export is safe in Excel.
const TRICKY_PEOPLE: Person[] = [
  { id: "emp-001", name: "Zoë Mensah", department: "Operations" },
  { id: "emp-002", name: "=Kwame Test", department: "+Finance" },
  { id: "emp-003", name: 'Élodie "Elo" O\'Brien, Jr.', department: "@Support" },
];

function peopleFor(c: SampleCase): Person[] {
  if (c === "empty") return [];
  if (c === "small") return TRICKY_PEOPLE;
  if (c === "large") return makePeople(150);
  return makePeople(9);
}

function buildRow(p: Person, index: number, keys: string[]): RegisterRow {
  const rand = rng(1000 + index * 97);
  const days: RegisterDay[] = keys.map((dayKey) => {
    const weekday = new Date(parseDay(dayKey)).getUTCDay();
    const base: RegisterDay = {
      dayKey,
      status: "present",
      firstIn: null,
      lastOut: null,
      minutesWorked: 0,
      late: false,
      earlyDeparture: false,
    };
    if (weekday === 0 || weekday === 6) return { ...base, status: "holiday" }; // weekend, no shift
    const r = rand();
    if (r < 0.06) return { ...base, status: "absent" };
    if (r < 0.11) return { ...base, status: "leave" };
    if (r < 0.18) return { ...base, status: "wfh", minutesWorked: 480 };
    const inMin = 7 * 60 + 40 + Math.floor(rand() * 120); // 07:40 to 09:40
    const outMin = 16 * 60 + 30 + Math.floor(rand() * 100); // 16:30 to 18:10
    const forgotOut = rand() < 0.03;
    return {
      ...base,
      firstIn: hhmm(inMin),
      lastOut: forgotOut ? null : hhmm(outMin),
      minutesWorked: forgotOut ? 0 : outMin - inMin,
      late: inMin > 8 * 60 + 30,
      earlyDeparture: !forgotOut && outMin < 17 * 60,
    };
  });
  const count = (f: (d: RegisterDay) => boolean) => days.filter(f).length;
  return {
    employeeId: p.id,
    name: p.name,
    department: p.department,
    days,
    totals: {
      presentDays: count((d) => d.status === "present" || d.status === "wfh"),
      lateDays: count((d) => d.late),
      absentDays: count((d) => d.status === "absent"),
      leaveDays: count((d) => d.status === "leave"),
      minutesWorked: days.reduce((s, d) => s + d.minutesWorked, 0),
    },
  };
}

export function getSampleRegister(
  c: SampleCase,
  range: { from: string; to: string } = DEFAULT_SAMPLE_RANGE,
): AttendanceRegister {
  const keys = dayKeysBetween(range.from, range.to);
  return {
    from: range.from,
    to: range.to,
    timezone: TIMEZONE,
    generatedAt: `${range.to}T17:30:00.000Z`,
    rows: peopleFor(c).map((p, i) => buildRow(p, i, keys)),
    truncated: c === "large",
  };
}

const LEAVE_TYPES = ["Annual leave", "Sick leave", "Compassionate leave", "Study leave"];

export function getSampleLeaveLedger(
  c: SampleCase,
  range: { from: string; to: string } = DEFAULT_SAMPLE_RANGE,
): LeaveLedger {
  const keys = dayKeysBetween(range.from, range.to);
  const rows: LeaveLedgerRow[] = [];
  peopleFor(c).forEach((p, i) => {
    const rand = rng(5000 + i * 31);
    const n = c === "small" ? 1 : Math.floor(rand() * 3); // 0 to 2 requests each
    for (let k = 0; k < n; k++) {
      const startIdx = Math.floor(rand() * keys.length);
      const days = 1 + Math.floor(rand() * 5);
      const start = parseDay(keys[startIdx]);
      const r = rand();
      const status = r < 0.25 ? "pending" : r < 0.85 ? "approved" : "denied";
      rows.push({
        id: `leave-${p.id}-${k}`,
        employeeId: p.id,
        name: p.name,
        department: p.department,
        type: c === "small" && k === 0 && i === 2 ? "-Study leave" : LEAVE_TYPES[Math.floor(rand() * LEAVE_TYPES.length)],
        startDate: toKey(start),
        endDate: toKey(start + (days - 1) * DAY_MS),
        days,
        status,
        decidedOn: status === "pending" ? null : toKey(start - 3 * DAY_MS),
      });
    }
  });
  rows.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
  return {
    from: range.from,
    to: range.to,
    generatedAt: `${range.to}T17:30:00.000Z`,
    rows,
    truncated: c === "large",
  };
}