import { firebaseAuth } from "@/integrations/firebase/config";
import type { ShiftType } from "@/lib/shift-engine";

/** One shift template as the server lists it (GET /api/shifts). */
export interface ShiftRow {
  id: string;
  name: string;
  type: ShiftType;
  start: string | null;
  end: string | null;
  graceMinutes: number;
  expectedMinutes: number | null;
  createdBy: string | null;
  archived: boolean;
}

/** The three organization settings (GET /api/shifts/settings). */
export interface ShiftSettingsData {
  shiftsEnabled: boolean;
  shiftScanMode: "strict" | "lenient";
  shiftWindowMinutes: number;
}

/** A manager and whether they may manage shifts (GET /api/shifts/access). */
export interface ManagerShiftRow {
  uid: string;
  displayName: string;
  email: string;
  shiftAdmin: boolean;
}

/** The settings answer plus the organization's own "today" and timezone. */
export interface ShiftContext extends ShiftSettingsData {
  today: string; // YYYY-MM-DD in the organization's timezone
  timezone: string;
}

/** A person in the caller's scope (GET /api/admin/staff-invites). */
export interface RotaMember {
  uid: string;
  displayName: string;
  email: string;
  department: string;
  managerId?: string | null;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Calls one of our own server routes with the signed-in person's token. Never throws: a failure to
 * reach the server, or an answer that is not ok, comes back as a plain sentence the screen can show.
 */
export async function authedFetch<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const token = await firebaseAuth.currentUser?.getIdToken();
    const res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const body = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
    if (!res.ok || !body || body.ok === false) {
      return { ok: false, error: body?.error || "Something went wrong. Please try again." };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

/** A repeating pattern's rule as the server stores it (see src/lib/shift-patterns.ts). */
export type PatternRuleData =
  | { kind: "weekly"; shiftId: string; weekdays: number[] }
  | { kind: "rotation"; weekdays: number[]; steps: { shiftId: string; weeks: number }[] };

/** One repeating pattern as the server lists it (GET /api/shifts/patterns). */
export interface PatternRow {
  id: string;
  employeeId: string;
  employeeName: string;
  managerId: string | null;
  rule: PatternRuleData;
  startDay: string;
  endDay: string | null;
  filledThrough: string | null;
  status: "active" | "ended";
  createdBy: string;
  lastFill: { at?: string; written?: number; skipped?: Record<string, number> } | null;
}

/** One shift swap as the server lists it (GET /api/shifts/swaps), with the moves the caller may make. */
export interface SwapRowData {
  id: string;
  dayKey: string;
  status: "pending" | "accepted" | "approved" | "declined" | "cancelled";
  proposerId: string;
  proposerName: string;
  proposerShiftLabel: string;
  colleagueId: string;
  colleagueName: string;
  colleagueShiftLabel: string;
  note: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  actions: string[];
}

/** The swap list plus whether swaps are switched on and the organization's "today". */
export interface SwapListData {
  enabled: boolean;
  today: string;
  swaps: SwapRowData[];
}

/** A colleague who can be offered a swap on one day (GET /api/shifts/swaps?candidates=YYYY-MM-DD). */
export interface SwapCandidateRow {
  uid: string;
  name: string;
  shiftLabel: string;
}
