/**
 * "Report a problem": what a valid report is, who may read reports, and what a valid
 * screenshot is. Pure functions (no Firebase, no React) so the rules can be tested.
 *
 * Trust rules (AGENTS.md rule 1): who sent a report (uid, company, role) comes ONLY from the
 * verified login token on the server. Everything from the form (category, message, page,
 * device details) is untrusted text: it is checked, trimmed, length-capped and only ever
 * shown as plain text.
 */

export const REPORT_CATEGORIES = ["broken", "numbers", "confusing", "idea"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  broken: "Something is broken",
  numbers: "The numbers look wrong",
  confusing: "Something is confusing",
  idea: "I have an idea",
};

export const REPORT_STATUSES = ["new", "seen", "resolved"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const MESSAGE_MIN = 5;
export const MESSAGE_MAX = 2000;
export const NOTE_MAX = 1000;
/** A screenshot, after the browser has shrunk it, may be at most this many bytes. */
export const MAX_IMAGE_BYTES = 450_000;
/** A report is stored from the 5th report an hour on a person is refused. */
export const REPORTS_PER_HOUR = 5;

export interface ReportInput {
  category: ReportCategory;
  message: string;
  /** Page path only (no query string, which could hold private values). */
  page: string;
  userAgent: string;
  viewport: string;
}

/** Removes control characters (keeps new lines and tabs), normalizes line endings, trims. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

export function isReportCategory(value: unknown): value is ReportCategory {
  return typeof value === "string" && (REPORT_CATEGORIES as readonly string[]).includes(value);
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && (REPORT_STATUSES as readonly string[]).includes(value);
}

/** Keeps only the path of a page address: no domain, no query string, no fragment. */
export function pathOnly(value: unknown): string {
  const text = cleanText(value, 300);
  const noHash = text.split("#")[0];
  const noQuery = noHash.split("?")[0];
  if (!noQuery.startsWith("/")) return "";
  return noQuery.slice(0, 200);
}

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateReportInput(raw: unknown): Validated<ReportInput> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Please fill in the form." };
  const r = raw as Record<string, unknown>;

  if (!isReportCategory(r.category)) return { ok: false, error: "Please choose what kind of problem this is." };

  const message = cleanText(r.message, MESSAGE_MAX + 1);
  if (message.length < MESSAGE_MIN) return { ok: false, error: "Please tell us a little more about what happened." };
  if (message.length > MESSAGE_MAX) return { ok: false, error: `Please keep it under ${MESSAGE_MAX} characters.` };

  const viewportRaw = cleanText(r.viewport, 20);
  const viewport = /^\d{2,5}x\d{2,5}$/.test(viewportRaw) ? viewportRaw : "";

  return {
    ok: true,
    value: {
      category: r.category,
      message,
      page: pathOnly(r.page),
      userAgent: cleanText(r.userAgent, 300),
      viewport,
    },
  };
}

/** Parses PLATFORM_OWNER_UIDS ("uid1, uid2"). Missing or empty means nobody is an owner. */
export function parsePlatformOwners(value: string | undefined | null): Set<string> {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && /^[A-Za-z0-9_-]{6,128}$/.test(s)),
  );
}

export function isPlatformOwner(uid: unknown, owners: Set<string>): boolean {
  return typeof uid === "string" && uid.length > 0 && owners.has(uid);
}

/** Decoded size of a base64 string, without decoding it. */
export function base64ByteLength(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * A screenshot must be a plain base64 JPEG (the browser converts and shrinks every image to
 * JPEG first), within the size limit. No data URLs, no other file types.
 */
export function validateImageBase64(raw: unknown): Validated<{ base64: string; bytes: number }> {
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, error: "No image." };
  if (raw.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8) return { ok: false, error: "That screenshot is too large." };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 !== 0) return { ok: false, error: "That image could not be read." };
  // A JPEG file always starts with the bytes FF D8 FF, which is "/9j/" in base64.
  if (!raw.startsWith("/9j/")) return { ok: false, error: "Only photos and screenshots can be attached." };
  const bytes = base64ByteLength(raw);
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, error: "That screenshot is too large." };
  return { ok: true, value: { base64: raw, bytes } };
}

export function validateStatusUpdate(raw: unknown): Validated<{ id: string; status?: ReportStatus; note?: string }> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Bad request." };
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return { ok: false, error: "Bad report id." };
  const out: { id: string; status?: ReportStatus; note?: string } = { id };
  if (r.status !== undefined) {
    if (!isReportStatus(r.status)) return { ok: false, error: "Bad status." };
    out.status = r.status;
  }
  if (r.note !== undefined) {
    if (typeof r.note !== "string") return { ok: false, error: "Bad note." };
    out.note = cleanText(r.note, NOTE_MAX);
  }
  if (out.status === undefined && out.note === undefined) return { ok: false, error: "Nothing to update." };
  return { ok: true, value: out };
}

/** The short text shown in the owner's notification. No names or message text, to keep it private on a lock screen. */
export function notificationText(input: { category: ReportCategory; role: string | null; page: string }): { title: string; body: string } {
  return {
    title: `New report: ${REPORT_CATEGORY_LABELS[input.category]}`,
    body: `From ${input.role === "org_admin" ? "an admin" : input.role === "manager" ? "a manager" : "an employee"}${input.page ? ` on ${input.page}` : ""}. Open the inbox to read it.`,
  };
}
