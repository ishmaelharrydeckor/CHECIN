/**
 * The work-from-home diary in the attendance register (task 2.3b, phase 4). Pure, so it can be tested.
 *
 * Diary time is its own figure: approved diary hours, diary time not yet approved, and flagged days.
 * It is never added to the scanned "Hours worked", and unapproved time is never counted as hours.
 */
import type { AttendanceRegister } from "./report-types.ts";

export interface DiaryDayRow {
  employeeId: string;
  dayKey: string;
  status: string;
  verifiedMinutes: number;
}

export interface DiaryTotals {
  approvedMinutes: number;
  unapprovedMinutes: number;
  flaggedDays: number;
}

/** Each person's diary figures over the days given. */
export function diaryTotalsByPerson(days: readonly DiaryDayRow[]): Map<string, DiaryTotals> {
  const out = new Map<string, DiaryTotals>();
  for (const d of days) {
    if (typeof d.employeeId !== "string" || !d.employeeId) continue;
    const t = out.get(d.employeeId) ?? { approvedMinutes: 0, unapprovedMinutes: 0, flaggedDays: 0 };
    const minutes = Number.isFinite(d.verifiedMinutes) && d.verifiedMinutes > 0 ? Math.round(d.verifiedMinutes) : 0;
    if (d.status === "approved") t.approvedMinutes += minutes;
    else if (d.status === "pending" || d.status === "flagged") t.unapprovedMinutes += minutes;
    if (d.status === "flagged") t.flaggedDays += 1;
    out.set(d.employeeId, t);
  }
  return out;
}

/** The register with the diary columns added for everyone in it. Scanned hours are left exactly as they were. */
export function withDiaryTotals(register: AttendanceRegister, days: readonly DiaryDayRow[], diaryTruncated: boolean): AttendanceRegister {
  const totals = diaryTotalsByPerson(days.filter((d) => d.dayKey >= register.from && d.dayKey <= register.to));
  return {
    ...register,
    diaryTracked: true,
    truncated: register.truncated || diaryTruncated,
    rows: register.rows.map((r) => {
      const t = totals.get(r.employeeId) ?? { approvedMinutes: 0, unapprovedMinutes: 0, flaggedDays: 0 };
      return {
        ...r,
        totals: {
          ...r.totals,
          diaryApprovedMinutes: t.approvedMinutes,
          diaryUnapprovedMinutes: t.unapprovedMinutes,
          diaryFlaggedDays: t.flaggedDays,
        },
      };
    }),
  };
}
