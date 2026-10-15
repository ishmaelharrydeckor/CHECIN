// "other": a day of someone who has since left this manager's team and has no record here. Nothing is claimed about it.
export type RegisterStatus = "present" | "absent" | "leave" | "holiday" | "wfh" | "off" | "other";

export interface RegisterDay {
  dayKey: string;            // "2026-10-05"
  status: RegisterStatus;
  firstIn: string | null;    // "08:14", already formatted in the organization's timezone
  lastOut: string | null;    // "17:02"
  minutesWorked: number;     // whole minutes, worked out on the server
  late: boolean;
  earlyDeparture: boolean;
}

export interface RegisterRow {
  employeeId: string;
  name: string;
  department: string;
  days: RegisterDay[];       // one per day in the range, oldest first
  totals: { presentDays: number; lateDays: number; absentDays: number; leaveDays: number; minutesWorked: number };
}

export interface AttendanceRegister {
  from: string;              // "2026-10-01"
  to: string;                // "2026-10-14"
  timezone: string;          // "Africa/Accra"
  generatedAt: string;       // ISO
  rows: RegisterRow[];
  truncated: boolean;        // true if the server stopped at its limit
}

export interface LeaveLedgerRow {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  type: string;              // "Annual leave" (already a readable label)
  startDate: string;
  endDate: string;
  days: number;
  status: "pending" | "approved" | "denied";
  decidedOn: string | null;  // "2026-10-03"
}

export interface LeaveLedger {
  from: string;
  to: string;
  generatedAt: string;
  rows: LeaveLedgerRow[];
  truncated: boolean;
}