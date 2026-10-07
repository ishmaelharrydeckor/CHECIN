// Leave request types and validation. Pure functions only: no Firebase, no React.

export const LEAVE_TYPES = ["annual", "sick", "personal", "unpaid", "other"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: "Annual leave",
  sick: "Sick leave",
  personal: "Personal leave",
  unpaid: "Unpaid leave",
  other: "Other",
};

export type LeaveStatus = "pending" | "approved" | "denied";

export const NOTE_MAX_LENGTH = 500;
export const NAME_MAX_LENGTH = 100;
/** Longest list shown at once; the page says how many more there are. */
export const LIST_LIMIT = 20;

export interface LeaveRequest {
  id: string;
  orgId: string;
  managerId: string;
  employeeId: string;
  /** Display name saved when the request was made. Older requests don't have one. */
  employeeName?: string;
  type: LeaveType;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  note?: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewedAt?: Date | null;
  createdAt?: Date | null;
}

export interface LeaveFormInput {
  type: string;
  startDate: string;
  endDate: string;
  note: string;
}

export type LeaveFormErrors = Partial<Record<keyof LeaveFormInput, string>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today as "YYYY-MM-DD" in the device's local time. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function isLeaveType(value: string): value is LeaveType {
  return (LEAVE_TYPES as readonly string[]).includes(value);
}

/**
 * Returns an object of field errors. Empty object = valid.
 * ISO date strings compare correctly with plain string comparison.
 */
export function validateLeaveInput(
  input: LeaveFormInput,
  today: string = todayISO(),
): LeaveFormErrors {
  const errors: LeaveFormErrors = {};

  if (!isLeaveType(input.type)) {
    errors.type = "Choose a leave type.";
  }

  if (!input.startDate) {
    errors.startDate = "Start date is required.";
  } else if (!isRealDate(input.startDate)) {
    errors.startDate = "Enter a valid start date.";
  } else if (input.startDate < today) {
    errors.startDate = "Start date can't be in the past.";
  }

  if (!input.endDate) {
    errors.endDate = "End date is required.";
  } else if (!isRealDate(input.endDate)) {
    errors.endDate = "Enter a valid end date.";
  } else if (!errors.startDate && input.endDate < input.startDate) {
    errors.endDate = "End date can't be before the start date.";
  }

  if (input.note.length > NOTE_MAX_LENGTH) {
    errors.note = `Note must be ${NOTE_MAX_LENGTH} characters or fewer.`;
  }

  return errors;
}

/** Inclusive number of calendar days between two ISO dates. */
export function countDays(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const ms = Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd);
  return Math.round(ms / 86_400_000) + 1;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRange(startDate: string, endDate: string): string {
  return startDate === endDate
    ? formatDate(startDate)
    : `${formatDate(startDate)} – ${formatDate(endDate)}`;
}