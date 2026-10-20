import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { wfhId } from "@/lib/wfh";
import {
  DIARY_CONSENT_TEXT,
  DIARY_CONSENT_VERSION,
  DIARY_INTERVAL_MS,
  answerLivenessCheck,
  buildDaySummary,
  canDecideDay,
  checkIntervalTiming,
  decideDay,
  diaryDocId,
  evaluateSession,
  intervalDocId,
  intervalWindow,
  nextSessionState,
  parseDiaryAction,
  parseDiarySettingsInput,
  sessionEndMs,
  upcomingChecks,
  verifyIntervalSignature,
  type DaySummary,
  type IntervalReport,
  type Pause,
  type SessionState,
  type StoredRow,
} from "@/lib/wfh-diary";
import {
  DIARY_CONSENTS,
  DIARY_DAYS,
  DIARY_INTERVALS,
  DIARY_SESSIONS,
  DIARY_TEAM_CAP,
  DiaryNotConfigured,
  getDiarySecret,
  hmacHex,
  loadDiaryOrg,
  reportHash,
  sessionChecks,
  sessionKeyFor,
  sha256Hex,
} from "@/lib/wfh-diary.server";

/**
 * Work-from-home diary (task 2.3b, phase 2; docs/WFH-DIARY-DESIGN.md). On a declared work-from-home
 * day a person runs one work session; the page reports signed 10-minute intervals and answers random
 * still-here checks; the server keeps a day summary that a manager approves or flags.
 *
 * Every write goes through here. Who is asking, their organization, their team and their session all
 * come from the verified token: the session is always the caller's own, found by their id and the
 * organization's day, never by an id in the request. Counts and timings only, never content. The
 * server clock decides every time. Nothing is punished automatically.
 */

type Caller = NonNullable<Awaited<ReturnType<typeof verifyCallerToken>>>;

/** How far ahead the page is told about still-here checks: until a little past its next report. */
const CHECK_HORIZON_MS = 2 * DIARY_INTERVAL_MS;

/** A refusal decided inside a transaction, carried out of it as a plain response. */
class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function refuse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

const ROLES = new Set(["org_admin", "manager", "employee"]);

async function authCaller(request: Request): Promise<{ ok: true; caller: Caller; orgId: string } | { ok: false; response: Response }> {
  const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
  const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
  if (!caller?.uid || !orgId) return { ok: false, response: refuse(401, "Not authenticated") };
  if (typeof caller.role !== "string" || !ROLES.has(caller.role)) {
    return { ok: false, response: refuse(403, "You do not have access to the work-from-home diary.") };
  }
  return { ok: true, caller, orgId };
}

async function limited(key: string, limit: number): Promise<Response | null> {
  const rate = await checkRateLimit(key, { limit, windowMs: 60 * 60 * 1000 });
  return rate.allowed ? null : refuse(429, `Too many requests. Please try again in ${rate.retryAfterMinutes} minutes.`);
}

function managerOf(caller: Caller): string | null {
  return typeof caller.managerId === "string" && caller.managerId ? caller.managerId : caller.role === "manager" ? caller.uid : null;
}

function sessionFrom(data: FirebaseFirestore.DocumentData): SessionState {
  const pauses: Pause[] = Array.isArray(data.pauses)
    ? data.pauses
        .filter((p: unknown) => p && typeof (p as Pause).fromMs === "number")
        .map((p: Pause) => ({ fromMs: p.fromMs, toMs: typeof p.toMs === "number" ? p.toMs : null }))
    : [];
  return {
    startedAtMs: Number(data.startedAtMs),
    endedAtMs: typeof data.endedAtMs === "number" ? data.endedAtMs : null,
    pauses,
    status: data.status === "paused" || data.status === "ended" ? data.status : "active",
  };
}

function rowsFrom(data: FirebaseFirestore.DocumentData): StoredRow[] {
  const raw = data.rows && typeof data.rows === "object" ? (data.rows as Record<string, StoredRow>) : {};
  return Object.values(raw).filter((r) => r && typeof r.index === "number");
}

function summaryFrom(data: FirebaseFirestore.DocumentData | undefined): DaySummary | null {
  if (!data) return null;
  return {
    verifiedMinutes: Number(data.verifiedMinutes ?? 0),
    unverifiedMinutes: Number(data.unverifiedMinutes ?? 0),
    pausedMinutes: Number(data.pausedMinutes ?? 0),
    pendingMinutes: Number(data.pendingMinutes ?? 0),
    intervalCount: Number(data.intervalCount ?? 0),
    flags: Array.isArray(data.flags) ? data.flags : [],
    reviewFlags: Number(data.reviewFlags ?? 0),
    status: data.status === "approved" || data.status === "flagged" ? data.status : "pending",
    decidedBy: typeof data.decidedBy === "string" ? data.decidedBy : null,
    decidedAt: typeof data.decidedAt === "string" ? data.decidedAt : null,
  };
}

/** Re-evaluates a session from what is stored and builds the day summary that goes with it. */
function rebuild(secret: string, sessionId: string, data: FirebaseFirestore.DocumentData, session: SessionState, previous: DaySummary | null, nowMs: number) {
  const checks = sessionChecks({
    secret,
    sessionId,
    startedAtMs: session.startedAtMs,
    perHour: Number(data.livenessPerHour ?? 0),
    answers: data.answers && typeof data.answers === "object" ? data.answers : {},
  });
  const evaluated = evaluateSession({ session, rows: rowsFrom(data), checks, nowMs });
  const summary = buildDaySummary({ intervals: evaluated.intervals, flags: evaluated.flags, previous });
  return { checks, evaluated, summary };
}

/** What the day summary document holds: the figures and the people it is about, never interval detail. */
function dayDoc(data: FirebaseFirestore.DocumentData, summary: DaySummary, flagsDetail: unknown, nowIso: string) {
  return {
    orgId: data.orgId,
    managerId: data.managerId ?? null,
    employeeId: data.employeeId,
    employeeName: data.employeeName ?? "",
    dayKey: data.dayKey,
    ...summary,
    flagDetail: flagsDetail,
    updatedAt: nowIso,
  };
}

/** The caller's own session: today's, or yesterday's when one started before midnight is still the latest. */
async function findOwnSession(uid: string, today: string, yesterday: string) {
  const refs = [today, yesterday].map((d) => firestoreAdmin.collection(DIARY_SESSIONS).doc(diaryDocId(uid, d)));
  const [t, y] = await firestoreAdmin.getAll(...refs);
  if (t.exists) return refs[0];
  if (y.exists && y.data()?.status !== "ended") return refs[1];
  return null;
}

/** The session fields the page may see: no key hash, no stored rows. */
function sessionView(sessionId: string, data: FirebaseFirestore.DocumentData, session: SessionState, nowMs: number) {
  return {
    sessionId,
    dayKey: data.dayKey,
    status: sessionEndMs(session, nowMs) !== null ? "ended" : session.status,
    startedAtMs: session.startedAtMs,
    endedAtMs: sessionEndMs(session, nowMs),
    pauses: session.pauses,
    nextIndex: Math.max(0, Math.floor((Math.min(nowMs, sessionEndMs(session, nowMs) ?? nowMs) - session.startedAtMs) / DIARY_INTERVAL_MS)),
    // The server's clock, so the page can line its blocks up with the server's even if the phone's clock is off.
    serverNowMs: nowMs,
  };
}

// ---------------------------------------------------------------- POST actions

async function consent(request: Request, caller: Caller, orgId: string) {
  const tooMany = await limited(`wfh_diary_consent_${caller.uid}`, 10);
  if (tooMany) return tooMany;
  const ref = firestoreAdmin.collection(DIARY_CONSENTS).doc(`${caller.uid}_${DIARY_CONSENT_VERSION}`);
  const now = new Date().toISOString();
  await firestoreAdmin.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // The first agreement stands; agreeing again changes nothing.
    if (!snap.exists) {
      tx.set(ref, { orgId, employeeId: caller.uid, agreedAt: now, textVersion: DIARY_CONSENT_VERSION, text: DIARY_CONSENT_TEXT });
    }
  });
  logEvent({ action: "wfh_diary.consent", outcome: "ok", correlationId: correlationId(request), orgId, uid: caller.uid, fields: { version: DIARY_CONSENT_VERSION } });
  return Response.json({ ok: true });
}

async function start(request: Request, caller: Caller, orgId: string, requestId: string) {
  const tooMany = await limited(`wfh_diary_start_${caller.uid}`, 20);
  if (tooMany) return tooMany;
  const nowMs = Date.now();
  const org = await loadDiaryOrg(orgId, nowMs);
  if (!org.settings.enabled) return refuse(403, "The work-from-home diary is switched off for your organization.");
  const secret = getDiarySecret();

  const [wfhSnap, consentSnap, userSnap] = await firestoreAdmin.getAll(
    firestoreAdmin.collection("wfh_days").doc(wfhId(caller.uid, org.today)),
    firestoreAdmin.collection(DIARY_CONSENTS).doc(`${caller.uid}_${DIARY_CONSENT_VERSION}`),
    firestoreAdmin.collection("users").doc(caller.uid),
  );
  if (!wfhSnap.exists || wfhSnap.data()?.orgId !== orgId) {
    return refuse(400, "Today is not a declared work-from-home day. Declare it first, then start your session.");
  }
  if (!consentSnap.exists) return refuse(403, "Please read and agree to the notice before your first session.");

  const sessionId = diaryDocId(caller.uid, org.today);
  const ref = firestoreAdmin.collection(DIARY_SESSIONS).doc(sessionId);
  const dayRef = firestoreAdmin.collection(DIARY_DAYS).doc(sessionId);
  const profileName = userSnap.exists ? String(userSnap.data()?.displayName ?? "").trim() : "";
  const employeeName = (profileName || (typeof caller.name === "string" ? caller.name : "") || "Employee").slice(0, 80);
  const managerId = managerOf(caller);

  const result = await firestoreAdmin.runTransaction(async (tx) => {
    const [snap, daySnap] = await Promise.all([tx.get(ref), tx.get(dayRef)]);
    if (snap.exists) {
      const data = snap.data() ?? {};
      // A retry of the same start (a lost reply) gets the same session back; anything else is refused,
      // which is what stops a second device from running a second session.
      if (data.requestId === requestId && sessionEndMs(sessionFrom(data), nowMs) === null) {
        return { data, created: false };
      }
      throw new Refusal(409, data.status === "ended" ? "Today's work session has already ended." : "A work session is already running for you today, on this or another device.");
    }
    const key = sessionKeyFor(secret, sessionId);
    const data = {
      orgId,
      managerId,
      employeeId: caller.uid,
      employeeName,
      dayKey: org.today,
      startedAtMs: nowMs,
      startedAt: new Date(nowMs).toISOString(),
      endedAtMs: null,
      status: "active",
      pauses: [],
      livenessPerHour: org.settings.livenessPerHour,
      keyHash: sha256Hex(key),
      answers: {},
      rows: {},
      requestId,
    };
    tx.set(ref, data);
    if (!daySnap.exists) {
      const summary = buildDaySummary({ intervals: [], flags: [], previous: null });
      tx.set(dayRef, dayDoc(data, summary, [], new Date(nowMs).toISOString()));
    }
    return { data, created: true };
  });

  const session = sessionFrom(result.data);
  const checks = sessionChecks({ secret, sessionId, startedAtMs: session.startedAtMs, perHour: Number(result.data.livenessPerHour ?? 0), answers: result.data.answers ?? {} });
  logEvent({ action: "wfh_diary.start", outcome: "ok", correlationId: correlationId(request), orgId, uid: caller.uid, fields: { dayKey: org.today, retry: !result.created } });
  return Response.json({
    ok: true,
    // The key that signs this session's intervals. Sent only to this caller, in reply to their start.
    key: sessionKeyFor(secret, sessionId),
    intervalMs: DIARY_INTERVAL_MS,
    session: sessionView(sessionId, result.data, session, nowMs),
    checks: upcomingChecks(checks, nowMs, CHECK_HORIZON_MS),
  });
}

/** One transaction for every change to a running session: read it, change it, rebuild the day. */
async function changeSession(
  request: Request,
  caller: Caller,
  orgId: string,
  action: string,
  change: (ctx: {
    tx: FirebaseFirestore.Transaction;
    data: FirebaseFirestore.DocumentData;
    session: SessionState;
    secret: string;
    sessionId: string;
    nowMs: number;
  }) => Promise<{ data: FirebaseFirestore.DocumentData; extra?: Record<string, unknown> }>,
) {
  const nowMs = Date.now();
  const org = await loadDiaryOrg(orgId, nowMs);
  const secret = getDiarySecret();
  const ref = await findOwnSession(caller.uid, org.today, org.yesterday);
  if (!ref) return refuse(404, "You have no work session today.");
  const sessionId = ref.id;
  const dayRef = firestoreAdmin.collection(DIARY_DAYS).doc(sessionId);

  try {
    const out = await firestoreAdmin.runTransaction(async (tx) => {
      const [snap, daySnap] = await Promise.all([tx.get(ref), tx.get(dayRef)]);
      const before = snap.data();
      if (!before || before.orgId !== orgId || before.employeeId !== caller.uid) throw new Refusal(404, "You have no work session today.");
      const changed = await change({ tx, data: before, session: sessionFrom(before), secret, sessionId, nowMs });
      const session = sessionFrom(changed.data);
      const built = rebuild(secret, sessionId, changed.data, session, summaryFrom(daySnap.data()), nowMs);
      tx.set(ref, changed.data);
      tx.set(dayRef, dayDoc(changed.data, built.summary, built.evaluated.flags, new Date(nowMs).toISOString()));
      return { data: changed.data, session, built, extra: changed.extra ?? {} };
    });
    logEvent({ action: `wfh_diary.${action}`, outcome: "ok", correlationId: correlationId(request), orgId, uid: caller.uid, fields: { sessionId } });
    return Response.json({
      ok: true,
      ...out.extra,
      session: sessionView(sessionId, out.data, out.session, nowMs),
      summary: { ...out.built.summary },
      checks: sessionEndMs(out.session, nowMs) === null ? upcomingChecks(out.built.checks, nowMs, CHECK_HORIZON_MS) : [],
    });
  } catch (err) {
    if (err instanceof Refusal) {
      logEvent({ action: `wfh_diary.${action}`, outcome: "denied", correlationId: correlationId(request), orgId, uid: caller.uid, fields: { sessionId, status: err.status } });
      return refuse(err.status, err.message);
    }
    throw err;
  }
}

async function interval(request: Request, caller: Caller, orgId: string, report: IntervalReport) {
  // Six reports an hour are normal; the rest is room for retries.
  const tooMany = await limited(`wfh_diary_interval_${caller.uid}`, 30);
  if (tooMany) return tooMany;
  return changeSession(request, caller, orgId, "interval", async ({ tx, data, session, secret, sessionId, nowMs }) => {
    const intervalRef = firestoreAdmin.collection(DIARY_INTERVALS).doc(intervalDocId(sessionId, report.index));
    const existingSnap = await tx.get(intervalRef);
    const hash = reportHash(sessionId, report);
    const existing = new Map<number, string>();
    if (existingSnap.exists) existing.set(report.index, String(existingSnap.data()?.payloadHash ?? ""));
    const end = sessionEndMs(session, nowMs);
    const timing = checkIntervalTiming({
      session: { ...session, endedAtMs: end },
      index: report.index,
      nowMs,
      existing,
      payloadHash: hash,
    });
    if (!timing.ok) throw new Refusal(timing.status, timing.error);
    if (timing.duplicate) return { data, extra: { duplicate: true } };

    // A bad signature is stored, marked, and never counted, so the manager can see it happened.
    const signatureOk = verifyIntervalSignature({ sessionId, report, key: sessionKeyFor(secret, sessionId), hmac: hmacHex });
    const row: StoredRow = {
      index: report.index,
      counts: report.counts,
      activeMinutes: report.activeMinutes,
      visibleSeconds: report.visibleSeconds,
      gapCv: report.gapCv,
      signatureOk,
    };
    tx.set(intervalRef, {
      orgId,
      managerId: data.managerId ?? null,
      employeeId: caller.uid,
      dayKey: data.dayKey,
      sessionId,
      index: report.index,
      startMs: intervalWindow(session.startedAtMs, report.index).startMs,
      counts: report.counts,
      activeMinutes: report.activeMinutes,
      visibleSeconds: report.visibleSeconds,
      gapCv: report.gapCv,
      signatureOk,
      payloadHash: hash,
      receivedAt: new Date(nowMs).toISOString(),
    });
    const rows = { ...(data.rows ?? {}), [String(report.index)]: row };
    return { data: { ...data, rows }, extra: { signatureOk } };
  });
}

async function answer(request: Request, caller: Caller, orgId: string, check: number, code: string) {
  const tooMany = await limited(`wfh_diary_answer_${caller.uid}`, 30);
  if (tooMany) return tooMany;
  return changeSession(request, caller, orgId, "answer", async ({ data, session, secret, sessionId, nowMs }) => {
    if (sessionEndMs(session, nowMs) !== null) throw new Refusal(409, "This work session has already ended.");
    const checks = sessionChecks({ secret, sessionId, startedAtMs: session.startedAtMs, perHour: Number(data.livenessPerHour ?? 0), answers: data.answers ?? {} });
    const found = checks.find((c) => c.index === check);
    if (!found) throw new Refusal(400, "This answer does not match a check.");
    const result = answerLivenessCheck({ check: found, code, nowMs });
    if (!result.ok) throw new Refusal(result.reason === "already_answered" ? 409 : 400, result.error);
    return { data: { ...data, answers: { ...(data.answers ?? {}), [String(check)]: result.answeredAtMs } } };
  });
}

async function pauseResumeStop(request: Request, caller: Caller, orgId: string, action: "pause" | "resume" | "stop") {
  const tooMany = await limited(`wfh_diary_state_${caller.uid}`, 60);
  if (tooMany) return tooMany;
  return changeSession(request, caller, orgId, action, async ({ data, session, nowMs }) => {
    const next = nextSessionState(session, action, nowMs);
    if (!next.ok) throw new Refusal(409, next.error);
    return { data: { ...data, pauses: next.value.pauses, endedAtMs: next.value.endedAtMs, status: next.value.status } };
  });
}

async function decide(request: Request, caller: Caller, orgId: string, employeeId: string, day: string, decision: "approve" | "flag") {
  if (caller.role !== "manager" && caller.role !== "org_admin") return refuse(403, "Only a manager or an admin can decide a day.");
  const tooMany = await limited(`wfh_diary_decide_${caller.uid}`, 200);
  if (tooMany) return tooMany;
  const nowMs = Date.now();
  const secret = getDiarySecret();
  const id = diaryDocId(employeeId, day);
  const ref = firestoreAdmin.collection(DIARY_SESSIONS).doc(id);
  const dayRef = firestoreAdmin.collection(DIARY_DAYS).doc(id);
  try {
    const status = await firestoreAdmin.runTransaction(async (tx) => {
      const [snap, daySnap] = await Promise.all([tx.get(ref), tx.get(dayRef)]);
      const data = snap.data();
      // Same 404 for missing, another organization, and not the caller's to decide.
      if (!data || data.orgId !== orgId || !canDecideDay({ uid: caller.uid, role: caller.role as string }, { employeeId: String(data.employeeId), managerId: data.managerId ?? null })) {
        throw new Refusal(404, "That day was not found.");
      }
      const session = sessionFrom(data);
      // Decided on figures rebuilt now, so a check that has since run out is counted correctly.
      const built = rebuild(secret, id, data, session, summaryFrom(daySnap.data()), nowMs);
      const decided = decideDay({ summary: built.summary, sessionOpen: sessionEndMs(session, nowMs) === null, decision });
      if (!decided.ok) throw new Refusal(409, decided.error);
      const iso = new Date(nowMs).toISOString();
      tx.set(dayRef, {
        ...dayDoc(data, { ...built.summary, status: decided.value.status, decidedBy: caller.uid, decidedAt: iso }, built.evaluated.flags, iso),
        decidedRole: caller.role,
      });
      return decided.value.status;
    });
    logEvent({ action: `wfh_diary.${decision}`, outcome: "ok", correlationId: correlationId(request), orgId, uid: caller.uid, fields: { dayId: id } });
    return Response.json({ ok: true, status });
  } catch (err) {
    if (err instanceof Refusal) {
      logEvent({ action: `wfh_diary.${decision}`, outcome: "denied", correlationId: correlationId(request), orgId, uid: caller.uid, fields: { dayId: id, status: err.status } });
      return refuse(err.status, err.message);
    }
    throw err;
  }
}

// ---------------------------------------------------------------- GET views

async function viewMe(caller: Caller, orgId: string) {
  const nowMs = Date.now();
  const org = await loadDiaryOrg(orgId, nowMs);
  const [consentSnap, wfhSnap] = await firestoreAdmin.getAll(
    firestoreAdmin.collection(DIARY_CONSENTS).doc(`${caller.uid}_${DIARY_CONSENT_VERSION}`),
    firestoreAdmin.collection("wfh_days").doc(wfhId(caller.uid, org.today)),
  );
  const base = {
    ok: true,
    serverNowMs: nowMs,
    enabled: org.settings.enabled,
    today: org.today,
    consent: { agreed: consentSnap.exists, version: DIARY_CONSENT_VERSION, text: DIARY_CONSENT_TEXT },
    wfhToday: wfhSnap.exists && wfhSnap.data()?.orgId === orgId,
  };
  const ref = await findOwnSession(caller.uid, org.today, org.yesterday);
  if (!ref) return Response.json({ ...base, session: null, summary: null, checks: [] });
  const [snap, daySnap] = await firestoreAdmin.getAll(ref, firestoreAdmin.collection(DIARY_DAYS).doc(ref.id));
  const data = snap.data();
  if (!data || data.orgId !== orgId) return Response.json({ ...base, session: null, summary: null, checks: [] });
  const session = sessionFrom(data);
  let checks: ReturnType<typeof upcomingChecks> = [];
  if (sessionEndMs(session, nowMs) === null) {
    const secret = getDiarySecret();
    checks = upcomingChecks(
      sessionChecks({ secret, sessionId: ref.id, startedAtMs: session.startedAtMs, perHour: Number(data.livenessPerHour ?? 0), answers: data.answers ?? {} }),
      nowMs,
      CHECK_HORIZON_MS,
    );
  }
  // The person sees their own figures, flags and approval status: nothing is hidden from them.
  return Response.json({ ...base, session: sessionView(ref.id, data, session, nowMs), summary: summaryFrom(daySnap.data()), checks });
}

async function viewTeam(caller: Caller, orgId: string, day: string | null) {
  if (caller.role !== "manager" && caller.role !== "org_admin") return refuse(403, "Only a manager or an admin can see a team's days.");
  const org = await loadDiaryOrg(orgId, Date.now());
  const theDay = day ?? org.today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(theDay)) return refuse(400, "Choose a valid day.");
  let query = firestoreAdmin.collection(DIARY_DAYS).where("orgId", "==", orgId).where("dayKey", "==", theDay);
  if (caller.role === "manager") query = query.where("managerId", "==", caller.uid);
  const snap = await query.limit(DIARY_TEAM_CAP).get();
  const days = snap.docs
    .map((d) => {
      const data = d.data();
      const s = summaryFrom(data);
      return s ? { employeeId: String(data.employeeId ?? ""), employeeName: String(data.employeeName ?? ""), dayKey: theDay, ...s } : null;
    })
    .filter((d) => d !== null && d.employeeId !== caller.uid)
    .sort((a, b) => a!.employeeName.localeCompare(b!.employeeName));
  return Response.json({ ok: true, day: theDay, days, capped: snap.size >= DIARY_TEAM_CAP });
}

async function viewDetail(caller: Caller, orgId: string, employeeId: string | null, day: string | null) {
  if (!employeeId || !day) return refuse(400, "Choose a person and a day.");
  let id: string;
  try {
    id = diaryDocId(employeeId, day);
  } catch {
    return refuse(400, "Choose a person and a day.");
  }
  const [snap, daySnap] = await firestoreAdmin.getAll(firestoreAdmin.collection(DIARY_SESSIONS).doc(id), firestoreAdmin.collection(DIARY_DAYS).doc(id));
  const data = snap.data();
  const own = employeeId === caller.uid;
  if (!data || data.orgId !== orgId || (!own && !canDecideDay({ uid: caller.uid, role: caller.role as string }, { employeeId, managerId: data.managerId ?? null }))) {
    return refuse(404, "That day was not found.");
  }
  const nowMs = Date.now();
  const session = sessionFrom(data);
  const built = rebuild(getDiarySecret(), id, data, session, summaryFrom(daySnap.data()), nowMs);
  const rows = new Map(rowsFrom(data).map((r) => [r.index, r]));
  return Response.json({
    ok: true,
    employeeName: data.employeeName ?? "",
    session: sessionView(id, data, session, nowMs),
    summary: summaryFrom(daySnap.data()),
    // Counts and timings per block, as recorded. Never content.
    intervals: built.evaluated.intervals.map((i) => ({ ...i, startMs: intervalWindow(session.startedAtMs, i.index).startMs, ...rows.get(i.index) })),
    flags: built.evaluated.flags,
    checks: built.checks
      .filter((c) => c.dueAtMs <= nowMs && c.dueAtMs < (sessionEndMs(session, nowMs) ?? nowMs))
      .map((c) => ({ index: c.index, dueAtMs: c.dueAtMs, answeredAtMs: c.answeredAtMs })),
  });
}

function diaryError(err: unknown, label: string): Response {
  if (err instanceof DiaryNotConfigured) {
    console.error(`${label}: ${err.message}`);
    return refuse(503, "The work-from-home diary is not set up yet. Please ask your administrator.");
  }
  console.error(`${label} error:`, err);
  return refuse(500, "Something went wrong with the work-from-home diary. Please try again.");
}

export const Route = createFileRoute("/api/wfh-diary")({
  server: {
    handlers: {
      // ?view=me (default): your own session today; ?view=team&day=: a manager's or admin's day list;
      // ?view=detail&employeeId=&day=: one person's day, for that person, their manager or an admin.
      GET: async ({ request }) => {
        try {
          const auth = await authCaller(request);
          if (!auth.ok) return auth.response;
          const q = new URL(request.url).searchParams;
          const view = q.get("view") ?? "me";
          if (view === "me") return await viewMe(auth.caller, auth.orgId);
          if (view === "team") return await viewTeam(auth.caller, auth.orgId, q.get("day"));
          if (view === "detail") return await viewDetail(auth.caller, auth.orgId, q.get("employeeId"), q.get("day"));
          return refuse(400, "Choose what to show.");
        } catch (err) {
          return diaryError(err, "GET /api/wfh-diary");
        }
      },

      POST: async ({ request }) => {
        try {
          const auth = await authCaller(request);
          if (!auth.ok) return auth.response;
          const parsed = parseDiaryAction(await request.json().catch(() => null));
          if (!parsed.ok) return refuse(400, parsed.error);
          const { caller, orgId } = auth;
          const a = parsed.value;
          switch (a.action) {
            case "consent":
              return await consent(request, caller, orgId);
            case "start":
              return await start(request, caller, orgId, a.requestId);
            case "interval":
              return await interval(request, caller, orgId, a.report);
            case "answer":
              return await answer(request, caller, orgId, a.check, a.code);
            case "pause":
            case "resume":
            case "stop":
              return await pauseResumeStop(request, caller, orgId, a.action);
            case "decide":
              return await decide(request, caller, orgId, a.employeeId, a.dayKey, a.decision);
          }
        } catch (err) {
          if (err instanceof Refusal) return refuse(err.status, err.message);
          return diaryError(err, "POST /api/wfh-diary");
        }
      },

      // The organization's diary settings. Org admins only, through the server.
      PUT: async ({ request }) => {
        try {
          const auth = await authCaller(request);
          if (!auth.ok) return auth.response;
          const { caller, orgId } = auth;
          if (caller.role !== "org_admin") return refuse(403, "Only an organization admin can change the diary settings.");
          const tooMany = await limited(`wfh_diary_settings_${caller.uid}`, 30);
          if (tooMany) return tooMany;
          const parsed = parseDiarySettingsInput(await request.json().catch(() => null));
          if (!parsed.ok) return refuse(400, parsed.error);
          await firestoreAdmin.collection("organizations").doc(orgId).set(parsed.value, { merge: true });
          logEvent({ action: "wfh_diary.settings", outcome: "ok", correlationId: correlationId(request), orgId, uid: caller.uid, fields: parsed.value });
          const org = await loadDiaryOrg(orgId, Date.now());
          return Response.json({ ok: true, settings: org.settings });
        } catch (err) {
          return diaryError(err, "PUT /api/wfh-diary");
        }
      },
    },
  },
});
