// src/lib/wfh-types.ts
export interface WfhDay {
  dayKey: string; // "2026-10-14"
  declaredAt: string; // ISO timestamp
}

export interface MyWfh {
  days: WfhDay[];
  maxAheadDays: number; // 30
  today?: string; // the organization's day, YYYY-MM-DD
}

export interface WfhTodayPerson {
  employeeId: string;
  name: string;
  department: string;
}