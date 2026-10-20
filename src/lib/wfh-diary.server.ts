/**
 * Server side of the work-from-home diary (task 2.3b, phase 2). The rules are in `wfh-diary.ts`; this
 * file holds what needs the server: the signing secret, HMAC and hashing, the still-here schedule
 * (worked out from the secret, so it is never stored or sent ahead of time), and the organization's
 * settings and "today".
 */
import crypto from "node:crypto";
import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { dayKey, formatClock } from "./attendance-day.ts";
import {
  DIARY_MAX_SESSION_HOURS,
  deriveSessionKey,
  planLivenessChecks,
  readDiarySettings,
  signingPayload,
  type DiarySettings,
  type IndexedCheck,
  type IntervalReport,
} from "./wfh-diary.ts";

export const DIARY_SESSIONS = "wfh_diary_sessions";
export const DIARY_INTERVALS = "wfh_diary_intervals";
export const DIARY_DAYS = "wfh_diary_days";
export const DIARY_CONSENTS = "diary_consents";
export const DIARY_TEAM_CAP = 200;
/** One summary per person per day: a 31-day register of about 190 people. */
export const DIARY_REPORT_CAP = 6000;

const HOUR_MS = 60 * 60_000;
const MIN_SECRET_LENGTH = 32;

/** Raised when the signing secret is not set; the route answers 503 rather than running unsigned. */
export class DiaryNotConfigured extends Error {}

/**
 * The server secret every session key and still-here code comes from. Required, with no fallback of
 * any kind: without it the diary refuses to run.
 */
export function getDiarySecret(): string {
  const secret = process.env.WFH_DIARY_SIGNING_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new DiaryNotConfigured("WFH_DIARY_SIGNING_SECRET is missing or too short (at least 32 characters).");
  }
  return secret;
}

export function hmacHex(key: string, message: string): string {
  return crypto.createHmac("sha256", key).update(message).digest("hex");
}

export function sha256Hex(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function sessionKeyFor(secret: string, sessionId: string): string {
  return deriveSessionKey(secret, sessionId, hmacHex);
}

/** What is stored to recognise an identical retry of one interval report. */
export function reportHash(sessionId: string, report: IntervalReport): string {
  return sha256Hex(`${signingPayload(sessionId, report)}|${report.signature}`);
}

/** A repeatable random number in [0, 1) from the secret: the same session always gets the same schedule. */
function secretRandom(secret: string, label: string): () => number {
  let n = 0;
  return () => {
    const hex = hmacHex(secret, `${label}|${n++}`).slice(0, 13);
    return parseInt(hex, 16) / 16 ** 13;
  };
}

/**
 * Every still-here check of a session, with its one-time code and whether it was answered. Times and
 * codes are re-derived from the secret each time, so the database never holds the schedule and the
 * employee cannot read it ahead of time.
 */
export function sessionChecks(input: {
  secret: string;
  sessionId: string;
  startedAtMs: number;
  perHour: number;
  answers: Record<string, unknown>;
}): IndexedCheck[] {
  const { secret, sessionId, startedAtMs, perHour, answers } = input;
  const out: IndexedCheck[] = [];
  for (let hour = 0; hour < DIARY_MAX_SESSION_HOURS; hour++) {
    const planned = planLivenessChecks({
      hourStartMs: startedAtMs + hour * HOUR_MS,
      perHour,
      random: secretRandom(secret, `due|v1|${sessionId}|${hour}`),
    });
    planned.forEach((p, slot) => {
      const index = hour * perHour + slot;
      const answered = answers[String(index)];
      out.push({
        index,
        dueAtMs: p.dueAtMs,
        code: hmacHex(secret, `code|v1|${sessionId}|${index}`).slice(0, 12),
        answeredAtMs: typeof answered === "number" ? answered : null,
      });
    });
  }
  return out;
}

export interface DiaryOrg {
  timezone: string;
  today: string;
  yesterday: string;
  settings: DiarySettings;
}

/** The organization's day (its own timezone, UTC when none) and its diary settings. */
export async function loadDiaryOrg(orgId: string, nowMs: number): Promise<DiaryOrg> {
  const snap = await firestoreAdmin.collection("organizations").doc(orgId).get();
  const data = snap.exists ? snap.data() : undefined;
  const rawTz = data?.timezone;
  const tz = typeof rawTz === "string" && rawTz.trim().length > 0 ? rawTz.trim() : "UTC";
  const today = dayKey(nowMs, tz) || new Date(nowMs).toISOString().slice(0, 10);
  const y = new Date(`${today}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  return { timezone: tz, today, yesterday: y.toISOString().slice(0, 10), settings: readDiarySettings(data) };
}

/**
 * The diary day summaries for a report, scoped like the register: an org admin the organization, a
 * manager their own team. Null when the organization does not use the diary, so the report shows no
 * diary columns. Needs the indexes (orgId, dayKey) and (orgId, managerId, dayKey).
 */
export async function loadDiaryReportDays(
  scope: { orgId: string; uid: string; role: string },
  fromDay: string,
  toDay: string,
): Promise<{ days: { employeeId: string; dayKey: string; status: string; verifiedMinutes: number }[]; truncated: boolean } | null> {
  const org = await firestoreAdmin.collection("organizations").doc(scope.orgId).get();
  if (!readDiarySettings(org.exists ? org.data() : undefined).enabled) return null;
  let query: FirebaseFirestore.Query = firestoreAdmin.collection(DIARY_DAYS).where("orgId", "==", scope.orgId);
  if (scope.role === "manager") query = query.where("managerId", "==", scope.uid);
  const snap = await query.where("dayKey", ">=", fromDay).where("dayKey", "<=", toDay).limit(DIARY_REPORT_CAP).get();
  const days = snap.docs.map((d) => {
    const x = d.data();
    return {
      employeeId: String(x.employeeId ?? ""),
      dayKey: String(x.dayKey ?? ""),
      status: String(x.status ?? ""),
      verifiedMinutes: Number(x.verifiedMinutes ?? 0),
    };
  });
  return { days, truncated: snap.size >= DIARY_REPORT_CAP };
}

/** "08:10" in the organization's timezone, so screens never work out times themselves. */
export function clockLabel(ms: number, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);
  } catch {
    return formatClock(ms, "UTC").slice(0, 5);
  }
}
