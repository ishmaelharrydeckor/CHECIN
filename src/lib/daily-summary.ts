/**
 * The per-person, per-day attendance summary, as pure functions.
 *
 * `daily_summaries/{employeeId}_{dayKey}` is DERIVED data: it is updated inside
 * the scan transaction and can always be rebuilt from `clock_events` (see
 * `summaryFromEvents` and scripts/backfill-summaries.mjs). Events stay the
 * immutable record; the summary is what dashboards, status and reports read, so
 * they never have to scan raw events.
 *
 * No Firebase and no path-alias imports, so it can be unit tested directly.
 */
import { cooldownSecondsLeft, type ScanType } from "./attendance-day.ts";

export const SUMMARY_SCHEMA_VERSION = 1;

export interface SummaryIdentity {
  orgId: string;
  managerId: string | null;
  employeeId: string;
  employeeName: string;
  /** YYYY-MM-DD in the organization's timezone. */
  dayKey: string;
}

/** The parts of a clock event the summary needs. */
export interface SummaryEvent {
  type: ScanType;
  /** ISO-8601 instant. */
  timestamp: string;
  late?: boolean;
  earlyDeparture?: boolean;
}

export interface DailySummary extends SummaryIdentity {
  /** First check-in of the day. */
  firstIn: string | null;
  /** Latest check-out of the day. */
  lastOut: string | null;
  /** Direction of the most recent scan today. */
  lastEventType: ScanType;
  lastEventAt: string;
  /** Currently checked in ("in") or not ("out"). Same as lastEventType. */
  state: ScanType;
  /** Start of the session that is still open, or null when checked out. */
  openSince: string | null;
  /** Whole minutes in completed in-to-out sessions (an open session is not counted yet). */
  minutesWorked: number;
  eventCount: number;
  /** The first check-in of the day was after the reporting window. */
  late: boolean;
  /** The latest check-out was before the closing time. */
  earlyDeparture: boolean;
  schemaVersion: number;
  updatedAt: string;
}

export function summaryDocId(employeeId: string, dayKey: string): string {
  return `${employeeId}_${dayKey}`;
}

/** Direction of the next scan, given today's summary (null if the person has not scanned today). */
export function nextTypeFromSummary(today: Pick<DailySummary, "lastEventType"> | null | undefined): ScanType {
  return today?.lastEventType === "in" ? "out" : "in";
}

/** Seconds still to wait before another scan, from today's summary. 0 means go ahead. */
export function cooldownFromSummary(
  today: Pick<DailySummary, "lastEventAt"> | null | undefined,
  nowMs: number,
): number {
  if (!today) return 0;
  return cooldownSecondsLeft({ timestamp: today.lastEventAt }, nowMs);
}

/** A person who is still "in" on a day that has ended never checked out. Derived when read, never stored. */
export function isIncomplete(summary: Pick<DailySummary, "state" | "dayKey">, todayKey: string): boolean {
  return summary.state === "in" && summary.dayKey < todayKey;
}

/** Fold one new event into the day's summary. `prev` is null for the first scan of the day. */
export function applyEventToSummary(
  prev: DailySummary | null,
  event: SummaryEvent,
  identity: SummaryIdentity,
  nowIso: string,
): DailySummary {
  const eventMs = new Date(event.timestamp).getTime();

  if (!prev) {
    // First scan of the day. A check-out with nothing before it (the check-in
    // happened on an earlier day) is recorded but opens and closes nothing.
    const isIn = event.type === "in";
    return {
      ...identity,
      firstIn: isIn ? event.timestamp : null,
      lastOut: isIn ? null : event.timestamp,
      lastEventType: event.type,
      lastEventAt: event.timestamp,
      state: event.type,
      openSince: isIn ? event.timestamp : null,
      minutesWorked: 0,
      eventCount: 1,
      late: isIn ? event.late === true : false,
      earlyDeparture: isIn ? false : event.earlyDeparture === true,
      schemaVersion: SUMMARY_SCHEMA_VERSION,
      updatedAt: nowIso,
    };
  }

  if (event.type === "in") {
    return {
      ...prev,
      // Keep the day's first check-in and its late flag; a later "in" is a return.
      firstIn: prev.firstIn ?? event.timestamp,
      late: prev.firstIn ? prev.late : event.late === true,
      lastEventType: "in",
      lastEventAt: event.timestamp,
      state: "in",
      openSince: event.timestamp,
      eventCount: prev.eventCount + 1,
      updatedAt: nowIso,
    };
  }

  // out
  let added = 0;
  if (prev.openSince) {
    const openMs = new Date(prev.openSince).getTime();
    if (!Number.isNaN(openMs) && !Number.isNaN(eventMs) && eventMs > openMs) {
      added = Math.floor((eventMs - openMs) / 60000);
    }
  }
  return {
    ...prev,
    lastOut: event.timestamp,
    lastEventType: "out",
    lastEventAt: event.timestamp,
    state: "out",
    openSince: null,
    minutesWorked: prev.minutesWorked + added,
    eventCount: prev.eventCount + 1,
    earlyDeparture: event.earlyDeparture === true,
    updatedAt: nowIso,
  };
}

/** Rebuild a day's summary from its events (any order). Returns null for no events. */
export function summaryFromEvents(
  events: SummaryEvent[],
  identity: SummaryIdentity,
  nowIso: string,
): DailySummary | null {
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let summary: DailySummary | null = null;
  for (const e of sorted) summary = applyEventToSummary(summary, e, identity, nowIso);
  return summary;
}
