/**
 * Which notification settings a person may save, as pure functions.
 *
 * The settings are saved from the browser, so the server keeps only the switches it knows, and only as true or
 * false. Anything else the browser sends is dropped (it can never grow the stored record), and a known switch with
 * a value that is not true or false is refused. Who the settings belong to never comes from here: it is the verified
 * token, in the route.
 */

/** Every switch a person can save: the master switch and one per kind of notification. */
export const PREFERENCE_KEYS = [
  "pushEnabled",
  "attendance",
  "announcements",
  "assignments",
  "deadlines",
  "system",
  "leave",
  "shifts",
  "account",
] as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

export type SanitizedPreferences = Partial<Record<PreferenceKey, boolean>>;

export type SanitizeResult = { ok: true; value: SanitizedPreferences } | { ok: false; error: string };

export function sanitizePreferences(raw: unknown): SanitizeResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "There were no notification settings to save." };
  }
  const source = raw as Record<string, unknown>;
  const value: SanitizedPreferences = {};
  for (const key of PREFERENCE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const v = source[key];
    if (typeof v !== "boolean") {
      return { ok: false, error: "Each notification setting must be on or off." };
    }
    value[key] = v;
  }
  if (Object.keys(value).length === 0) {
    return { ok: false, error: "There were no notification settings to save." };
  }
  return { ok: true, value };
}
