// src/lib/wfh-sample.ts
import type { MyWfh, WfhDay, WfhTodayPerson } from "./wfh-types";

// Fixed "today" so the sample dates line up. Wednesday.
export const SAMPLE_TODAY = "2026-10-14";

export type WfhCaseKey = "normal" | "empty" | "full" | "declaredToday";

function addDaysUtc(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isWeekendUtc(key: string): boolean {
  const w = new Date(`${key}T00:00:00Z`).getUTCDay();
  return w === 0 || w === 6;
}

const normalDays: WfhDay[] = [
  { dayKey: "2026-10-16", declaredAt: "2026-10-10T09:12:00Z" },
  { dayKey: "2026-10-19", declaredAt: "2026-10-12T16:40:00Z" },
  { dayKey: "2026-10-21", declaredAt: "2026-10-13T08:05:00Z" },
];

// Every weekday from today through 30 days ahead.
const fullDays: WfhDay[] = [];
for (let i = 0; i <= 30; i++) {
  const key = addDaysUtc(SAMPLE_TODAY, i);
  if (!isWeekendUtc(key)) {
    fullDays.push({
      dayKey: key,
      declaredAt: new Date(Date.UTC(2026, 9, 1, 8, 0) + fullDays.length * 60000).toISOString(),
    });
  }
}

export const WFH_SAMPLES: Record<WfhCaseKey, MyWfh> = {
  normal: { days: normalDays, maxAheadDays: 30 },
  empty: { days: [], maxAheadDays: 30 },
  full: { days: fullDays, maxAheadDays: 30 },
  declaredToday: {
    days: [
      ...normalDays,
      { dayKey: SAMPLE_TODAY, declaredAt: "2026-10-14T07:55:00Z" },
    ],
    maxAheadDays: 30,
  },
};

const normalPeople: WfhTodayPerson[] = [
  { employeeId: "emp-001", name: "Ama Mensah", department: "Operations" },
  { employeeId: "emp-002", name: "Kofi Owusu", department: "Finance" },
  { employeeId: "emp-003", name: "Abena Boateng", department: "Engineering" },
  { employeeId: "emp-004", name: "Yaw Asante", department: "People Ops" },
];

const firstNames = ["Ama", "Kofi", "Abena", "Yaw", "Efua", "Kwame", "Akosua", "Kojo", "Adwoa", "Kwabena", "Afua", "Nana", "Esi"];
const lastNames = ["Mensah", "Owusu", "Boateng", "Asante", "Appiah", "Ofori", "Darko", "Agyei", "Frimpong", "Amoah", "Nyarko", "Addo", "Sarpong"];
const departments = ["Operations", "Finance", "Engineering", "People Ops", "Sales"];

const fullPeople: WfhTodayPerson[] = Array.from({ length: 26 }, (_, i) => ({
  employeeId: `emp-${String(i + 1).padStart(3, "0")}`,
  name: `${firstNames[i % firstNames.length]} ${lastNames[(i * 3) % lastNames.length]}`,
  department: departments[i % departments.length],
}));

export const WFH_TODAY_SAMPLES: Record<"normal" | "empty" | "full", WfhTodayPerson[]> = {
  normal: normalPeople,
  empty: [],
  full: fullPeople,
};