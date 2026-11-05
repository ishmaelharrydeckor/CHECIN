import { dayKey } from "./attendance-day.ts";

/**
 * Reading history across a change of manager (design: docs/MANAGER-CHANGE-DESIGN.md).
 *
 * Records keep the manager they were written with. So a manager sees two things: the records filed
 * under them (the days they managed), plus the records of people who joined their team LATER (found
 * by employee id, because their older days are filed under a previous manager). A team where nobody
 * has moved in needs no extra read at all.
 *
 * Pure helpers, free of Firebase, so they can be tested on their own.
 */

/** Firestore allows at most 30 values in an `in` query. */
export const IN_QUERY_LIMIT = 30;
/** At most this many moved-in people are looked up; the most recently moved come first. */
export const MAX_MOVED_IN = 30;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface MovedIn {
  uid: string;
  /** The day (in the organization's timezone) they joined this team. */
  changedDay: string;
}

/**
 * The people on this team who moved in on or after `fromDay`, most recent first. Anyone who joined
 * before the range began has all their days in the range filed under this manager already.
 */
export function movedInMembers(
  roster: readonly { uid: string; managerChangedAt?: unknown }[],
  timezone: string,
  fromDay: string,
): MovedIn[] {
  const out: MovedIn[] = [];
  for (const m of roster) {
    if (typeof m.managerChangedAt !== "string") continue;
    const ms = Date.parse(m.managerChangedAt);
    if (!Number.isFinite(ms)) continue;
    const changedDay = dayKey(ms, timezone);
    if (changedDay && changedDay >= fromDay) out.push({ uid: m.uid, changedDay });
  }
  out.sort((a, b) => (a.changedDay < b.changedDay ? 1 : a.changedDay > b.changedDay ? -1 : a.uid.localeCompare(b.uid)));
  return out.slice(0, MAX_MOVED_IN);
}

/** `primary` first, then anything in `extra` whose key is not already there. */
export function mergeByKey<T>(primary: readonly T[], extra: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...primary, ...extra]) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** Newest first, no duplicates by id, at most `limit` rows. For merging two already-sorted event pages. */
export function mergeEventsNewestFirst<T extends { id: string; timestamp: string }>(
  a: readonly T[],
  b: readonly T[],
  limit: number,
): T[] {
  return mergeByKey(a, b, (e) => e.id)
    .sort((x, y) => (x.timestamp < y.timestamp ? 1 : x.timestamp > y.timestamp ? -1 : 0))
    .slice(0, limit);
}
