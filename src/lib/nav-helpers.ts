/**
 * Small pure helpers for the app shell's menu: which item the page belongs to, the "where you are" trail,
 * the "Jump to" search, and the waiting-work badges. Pure (no browser, no Firebase), so they can be tested.
 * The menu itself (AppShell.tsx) decides who sees which items; nothing here grants access to anything.
 */

export interface NavItemLike {
  to: string;
  label: string;
}

export interface NavGroupLike {
  heading?: string;
  items: NavItemLike[];
}

/** How many things are waiting for the signed-in manager or admin, as /api/nav-counts sends them. */
export interface NavCounts {
  /** Leave requests waiting for a decision. */
  leave: number;
  /** Work-diary days waiting for a decision. */
  diary: number;
}

export const EMPTY_NAV_COUNTS: NavCounts = { leave: 0, diary: 0 };

/** Which count each menu item shows. Items not listed here never show a badge. */
export const NAV_BADGE: Readonly<Record<string, keyof NavCounts>> = {
  "/leave": "leave",
  "/wfh-review": "diary",
};

/** Reads a server answer defensively: anything that is not a whole number of 0 or more counts as 0. */
export function parseNavCounts(raw: unknown): NavCounts {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0);
  return { leave: n(r.leave), diary: n(r.diary) };
}

/** The count to show on a menu item (0 when it has none). */
export function countFor(to: string, counts: NavCounts): number {
  const key = NAV_BADGE[to];
  return key ? counts[key] : 0;
}

/** "" for nothing waiting, the number up to 99, then "99+". */
export function badgeText(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return n > 99 ? "99+" : String(Math.floor(n));
}

/** The words for screen readers: "3 waiting". */
export function badgeLabel(n: number): string {
  const t = badgeText(n);
  return t ? `${t} waiting` : "";
}

/** The menu item a page belongs to: exact match, or a page below it ("/leave/new" belongs to "/leave"). */
export function matchNavItem<T extends NavItemLike>(pathname: string, groups: readonly { items: readonly T[] }[]): T | null {
  let best: T | null = null;
  for (const g of groups) {
    for (const item of g.items) {
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        if (!best || item.to.length > best.to.length) best = item;
      }
    }
  }
  return best;
}

/** "Manage › Leave": the group heading (if it has one) and the page. Null on pages that are not in the menu. */
export function breadcrumbFor(pathname: string, groups: readonly NavGroupLike[]): { group: string | null; page: string } | null {
  const item = matchNavItem(pathname, groups);
  if (!item) return null;
  const group = groups.find((g) => g.items.some((i) => i.to === item.to));
  return { group: group?.heading ?? null, page: item.label };
}

/**
 * The "Jump to" results: pages whose name starts with what was typed come first, then pages that contain it.
 * Nothing typed lists every page.
 */
export function jumpResults<T extends NavItemLike>(items: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    if (label.startsWith(q)) starts.push(item);
    else if (label.includes(q)) contains.push(item);
  }
  return [...starts, ...contains];
}

/** Every page in the menu, once, in menu order. */
export function flattenNav<T extends NavItemLike>(groups: readonly { items: readonly T[] }[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const g of groups) {
    for (const i of g.items) {
      if (seen.has(i.to)) continue;
      seen.add(i.to);
      out.push(i);
    }
  }
  return out;
}

/** Whether the waiting-work counts should be fetched again: never more than once in `minGapMs`. */
export function shouldRefreshCounts(lastFetchedMs: number | null, nowMs: number, minGapMs = 60_000): boolean {
  return lastFetchedMs === null || nowMs - lastFetchedMs >= minGapMs;
}
