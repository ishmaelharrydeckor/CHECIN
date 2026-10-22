/**
 * Whether an organization's timezone needs an admin to confirm it (issue #25).
 *
 * Everything about "today" depends on the organization's timezone: which day a scan belongs to, who is late, and
 * every date on every report. An organization with no timezone, or with plain UTC that nobody chose, is almost
 * always one that fell back to UTC by default, and its late flags and daily totals can be wrong by hours without
 * anyone noticing. So an admin sees a warning until they have confirmed the timezone by saving it.
 *
 * Pure (no database, no clock, no browser), so it can be tested. A real zone that happens to match UTC today
 * (for example Africa/Accra) is a deliberate choice and is never warned about.
 */

/** Names that mean "no timezone was chosen". */
const DEFAULT_ZONES = new Set(["", "utc", "etc/utc", "gmt", "etc/gmt", "z"]);

export function isDefaultTimezone(timezone: unknown): boolean {
  if (typeof timezone !== "string") return true;
  return DEFAULT_ZONES.has(timezone.trim().toLowerCase());
}

/**
 * True when the timezone is missing or plain UTC and nobody has confirmed it. `confirmed` is the organization's
 * `timezoneConfirmed` field, set when an admin saves the timezone (and when a timezone is chosen at sign-up).
 */
export function timezoneNeedsConfirmation(timezone: unknown, confirmed: unknown): boolean {
  return isDefaultTimezone(timezone) && confirmed !== true;
}

/** The plain sentence shown to an admin. */
export function timezoneNoticeText(timezone: unknown): string {
  const shown = typeof timezone === "string" && timezone.trim() ? timezone.trim() : "UTC";
  return `Your organization's timezone is set to ${shown}, and nobody has confirmed it. Who is late, what counts as "today" and every date on a report follow this timezone, so a wrong one makes them wrong by hours. Choose your timezone, or confirm that ${shown} is right.`;
}
