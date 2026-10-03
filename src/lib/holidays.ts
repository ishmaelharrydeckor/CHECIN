import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { firestoreDb } from "@/integrations/firebase/config";

/**
 * Public holiday calendar (task 2.5).
 *
 * Collection: holidays/{id}  ->  { orgId, date: "YYYY-MM-DD", name }
 *
 * Security notes (see AGENTS.md):
 * - `orgId` is always passed in from the signed-in user's verified token claims
 *   (via useAuth()). It is never read from a form field or the URL.
 * - Firestore rules are the real gate: org members may read, only org_admin may
 *   write. The UI hiding the buttons for other roles is a convenience, not security.
 * - No role field is ever written to a document.
 */

export const HOLIDAYS_COLLECTION = "holidays";
export const HOLIDAY_NAME_MAX_LENGTH = 80;

export interface Holiday {
  id: string;
  orgId: string;
  /** Calendar date in YYYY-MM-DD form (no time, no timezone). */
  date: string;
  name: string;
}

export interface HolidayInput {
  date: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (no Firebase): validation, sorting, date formatting
// ---------------------------------------------------------------------------

/** True only for a real calendar date written as YYYY-MM-DD (e.g. rejects 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
}

/** Returns a plain-language error message, or null when the input is fine. */
export function validateHolidayInput(input: HolidayInput): string | null {
  const name = input.name.trim();
  if (!input.date) return "Pick a date for the holiday.";
  if (!isValidIsoDate(input.date)) return "That date isn't valid. Pick it from the calendar.";
  if (!name) return "Enter a name for the holiday.";
  if (name.length > HOLIDAY_NAME_MAX_LENGTH) {
    return `Keep the name under ${HOLIDAY_NAME_MAX_LENGTH} characters.`;
  }
  return null;
}

/** Clean up user input before saving: trim the name, keep the date as typed. */
export function normalizeHolidayInput(input: HolidayInput): HolidayInput {
  return { date: input.date.trim(), name: input.name.trim().replace(/\s+/g, " ") };
}

/** True when another holiday already has the same date and the same name (ignoring case). */
export function isDuplicateHoliday(
  holidays: Holiday[],
  input: HolidayInput,
  ignoreId?: string,
): boolean {
  const name = input.name.trim().replace(/\s+/g, " ").toLowerCase();
  return holidays.some(
    (h) => h.id !== ignoreId && h.date === input.date && h.name.trim().toLowerCase() === name,
  );
}

/** Oldest date first; same-day holidays sort by name. */
export function sortHolidays(holidays: Holiday[]): Holiday[] {
  return [...holidays].sort((a, b) =>
    a.date === b.date ? a.name.localeCompare(b.name) : a.date.localeCompare(b.date),
  );
}

/** Today's date as YYYY-MM-DD in the viewer's own timezone. */
export function todayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Turns "2026-12-25" into a Date at local midnight (avoids the UTC off-by-one bug). */
export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** e.g. "Friday, 25 December 2026". */
export function formatHolidayDate(value: string): string {
  if (!isValidIsoDate(value)) return value;
  return parseIsoDate(value).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Firestore calls
// ---------------------------------------------------------------------------

/**
 * Live list of this organization's holidays. The `where("orgId", "==", orgId)` filter
 * matches the Firestore read rule (org members only), and needs no extra index.
 * Sorting happens in the browser.
 */
export function subscribeToHolidays(
  orgId: string,
  onData: (holidays: Holiday[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(firestoreDb, HOLIDAYS_COLLECTION), where("orgId", "==", orgId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: Holiday[] = snapshot.docs.map((d) => {
        const data = d.data() as Partial<Holiday>;
        return {
          id: d.id,
          orgId: String(data.orgId ?? orgId),
          date: String(data.date ?? ""),
          name: String(data.name ?? ""),
        };
      });
      onData(sortHolidays(items));
    },
    (error) => onError(error),
  );
}

/** Add a holiday (org admin only; enforced by Firestore rules). */
export async function addHoliday(orgId: string, input: HolidayInput): Promise<void> {
  const problem = validateHolidayInput(input);
  if (problem) throw new Error(problem);
  const clean = normalizeHolidayInput(input);
  await addDoc(collection(firestoreDb, HOLIDAYS_COLLECTION), {
    orgId,
    date: clean.date,
    name: clean.name,
  });
}

/** Change a holiday's date and/or name. `orgId` is never touched. */
export async function updateHoliday(id: string, input: HolidayInput): Promise<void> {
  const problem = validateHolidayInput(input);
  if (problem) throw new Error(problem);
  const clean = normalizeHolidayInput(input);
  await updateDoc(doc(firestoreDb, HOLIDAYS_COLLECTION, id), {
    date: clean.date,
    name: clean.name,
  });
}

/** Remove a holiday. */
export async function removeHoliday(id: string): Promise<void> {
  await deleteDoc(doc(firestoreDb, HOLIDAYS_COLLECTION, id));
}

/** Turns a Firestore failure into a short message a person can act on. */
export function describeHolidayError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  if (code === "permission-denied") {
    return "You don't have permission to do that. Only organization admins can change holidays.";
  }
  if (code === "unavailable") {
    return "Can't reach the server. Check your connection and try again.";
  }
  return error instanceof Error && error.message ? error.message : "Something went wrong.";
}