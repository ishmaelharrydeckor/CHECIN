import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { canAssignTo } from "@/lib/shift-requests";
import { callerFromToken, canCallerManageShifts } from "@/lib/shift-access.server";
import {
  nextFillDay,
  parsePatternCreate,
  parsePatternEdit,
  patternDocId,
  patternsOverlap,
  planEdit,
} from "@/lib/shift-patterns";
import {
  PATTERNS,
  TOPUP_MAX_PATTERNS,
  activePatternsFor,
  checkPeople,
  checkRuleShifts,
  fillDuePatterns,
  fillPattern,
  listPatterns,
  loadPeople,
  orgToday,
  patternFromDoc,
  trimAndSavePattern,
  type StoredPattern,
} from "@/lib/shift-patterns.server";

type Caller = NonNullable<Awaited<ReturnType<typeof verifyCallerToken>>>;

function rowFor(p: StoredPattern, lastFill: unknown) {
  return {
    id: p.id,
    employeeId: p.employeeId,
    employeeName: p.employeeName,
    managerId: p.managerId,
    rule: p.rule,
    startDay: p.startDay,
    endDay: p.endDay,
    filledThrough: p.filledThrough,
    status: p.status,
    createdBy: p.createdBy,
    lastFill: lastFill && typeof lastFill === "object" ? lastFill : null,
  };
}

async function authManager(
  request: Request,
  action: string,
): Promise<{ ok: true; caller: Caller; orgId: string } | { ok: false; response: Response }> {
  const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
  const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
  if (!caller?.uid || !orgId) {
    return { ok: false, response: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  if (!canCallerManageShifts(caller)) {
    return {
      ok: false,
      response: Response.json({ error: `You do not have permission to ${action} shift patterns.` }, { status: 403 }),
    };
  }
  return { ok: true, caller, orgId };
}

async function limited(key: string, limit: number): Promise<Response | null> {
  const rate = await checkRateLimit(key, { limit, windowMs: 60 * 60 * 1000 });
  if (rate.allowed) return null;
  return Response.json(
    { error: `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.` },
    { status: 429 },
  );
}

/** Loads a pattern the caller may change: same organization, and a person they may assign. */
async function loadOwnPattern(
  caller: Caller,
  orgId: string,
  rawId: unknown,
): Promise<{ ok: true; pattern: StoredPattern } | { ok: false; response: Response }> {
  const notFound = { ok: false as const, response: Response.json({ error: "Pattern not found." }, { status: 404 }) };
  if (typeof rawId !== "string" || rawId.trim().length === 0 || rawId.includes("/") || rawId.length > 200) {
    return notFound;
  }
  const snap = await firestoreAdmin.collection(PATTERNS).doc(rawId.trim()).get();
  const pattern = snap.exists ? patternFromDoc(snap.id, snap.data()) : null;
  // Same 404 whether the pattern does not exist or belongs to another organization
  if (!pattern || pattern.orgId !== orgId) return notFound;
  if (pattern.status !== "active") {
    return {
      ok: false,
      response: Response.json({ error: "This pattern has already ended." }, { status: 409 }),
    };
  }
  const person = (await loadPeople(orgId, [pattern.employeeId])).get(pattern.employeeId);
  if (person && !canAssignTo(callerFromToken(caller), person)) {
    return {
      ok: false,
      response: Response.json(
        { error: "You can only change shift patterns for people on your own team." },
        { status: 403 },
      ),
    };
  }
  if (!person && callerFromToken(caller).role !== "org_admin") return notFound;
  return { ok: true, pattern };
}

/** Edit and end share one path: work out the change, trim this pattern's future days, save, refill. */
async function applyEdit(request: Request, mode: "edit" | "end"): Promise<Response> {
  const auth = await authManager(request, mode === "end" ? "end" : "change");
  if (!auth.ok) return auth.response;
  const { caller, orgId } = auth;
  const tooMany = await limited(`shifts_patterns_${caller.uid}`, 60);
  if (tooMany) return tooMany;

  const today = await orgToday(orgId);
  const body = await request.json().catch(() => null);
  const raw = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!raw) return Response.json({ error: "Choose a pattern." }, { status: 400 });
  const { id, ...rest } = raw;

  const parsed =
    mode === "end"
      ? parsePatternEdit({ endDay: rest.endDay === undefined || rest.endDay === null ? today : rest.endDay }, today)
      : parsePatternEdit(rest, today);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const loaded = await loadOwnPattern(caller, orgId, id);
  if (!loaded.ok) return loaded.response;
  const pattern = loaded.pattern;

  if (parsed.value.rule) {
    const shiftsOk = await checkRuleShifts(orgId, parsed.value.rule);
    if (!shiftsOk.ok) return Response.json({ error: shiftsOk.error }, { status: shiftsOk.status });
  }

  // Ending a pattern before it has started cancels it: nothing it filled is kept.
  if (mode === "end" && parsed.value.endDay && parsed.value.endDay < pattern.startDay) {
    const now = new Date().toISOString();
    const removed = await trimAndSavePattern(pattern, today, today, {
      status: "ended",
      endedReason: "cancelled",
      nextFillDay: pattern.startDay,
      updatedAt: now,
      updatedBy: caller.uid,
    });
    logEvent({
      action: "shift.pattern.end",
      outcome: "ok",
      correlationId: correlationId(request),
      orgId,
      uid: caller.uid,
      fields: { patternId: pattern.id, removed, cancelled: true },
    });
    return Response.json({ ok: true, removed, written: 0, skipped: {} });
  }

  const plan = planEdit(pattern, parsed.value, today);
  if (!plan.ok) return Response.json({ error: plan.error }, { status: 400 });
  const next = plan.value.next;

  if (parsed.value.rule || parsed.value.endDay !== undefined) {
    const others = (await activePatternsFor(orgId, pattern.employeeId)).filter((p) => p.id !== pattern.id);
    const clash = others.find((o) => patternsOverlap({ ...next, startDay: today > next.startDay ? today : next.startDay }, o));
    if (clash) {
      return Response.json(
        { error: `${pattern.employeeName || "This person"} already has another pattern on some of these days. End it first.` },
        { status: 409 },
      );
    }
  }

  const ended = next.endDay !== null && next.endDay <= today;
  const now = new Date().toISOString();
  const removed = await trimAndSavePattern(pattern, plan.value.keepThrough, today, {
    rule: next.rule,
    endDay: next.endDay,
    filledThrough: next.filledThrough,
    nextFillDay: nextFillDay(next),
    status: ended ? "ended" : "active",
    ...(ended ? { endedReason: "ended_by_manager" } : {}),
    updatedAt: now,
    updatedBy: caller.uid,
  });
  const fill = ended ? null : await fillPattern(pattern.id, { today });

  logEvent({
    action: mode === "end" ? "shift.pattern.end" : "shift.pattern.edit",
    outcome: "ok",
    correlationId: correlationId(request),
    orgId,
    uid: caller.uid,
    fields: { patternId: pattern.id, removed, written: fill?.written ?? 0, ruleChanged: !!parsed.value.rule },
  });
  return Response.json({ ok: true, removed, written: fill?.written ?? 0, skipped: fill?.skipped ?? {} });
}

export const Route = createFileRoute("/api/shifts/patterns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
          const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
          if (!caller?.uid || !orgId) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          if (caller.role !== "org_admin" && caller.role !== "manager" && caller.role !== "employee") {
            return Response.json({ error: "You do not have access to shift patterns." }, { status: 403 });
          }

          const url = new URL(request.url);
          const filterEmployeeId = (url.searchParams.get("employeeId") || "").trim();
          const includeEnded = url.searchParams.get("ended") === "1";

          // Scope strictly from the verified token claims; employeeId can narrow but never widen
          if (caller.role === "employee" && filterEmployeeId && filterEmployeeId !== caller.uid) {
            return Response.json({ ok: true, patterns: [], truncated: false });
          }
          const { patterns, truncated } = await listPatterns({
            orgId,
            managerId: caller.role === "manager" ? caller.uid : undefined,
            employeeId: caller.role === "employee" ? caller.uid : filterEmployeeId || undefined,
            includeEnded,
          });

          const rows = patterns
            .map(({ pattern, lastFill }) => rowFor(pattern, caller.role === "employee" ? null : lastFill))
            .sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.startDay.localeCompare(b.startDay));
          return Response.json({ ok: true, patterns: rows, truncated });
        } catch (err) {
          console.error("GET /api/shifts/patterns error:", err);
          return Response.json({ error: "Could not load shift patterns." }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const auth = await authManager(request, "set up");
          if (!auth.ok) return auth.response;
          const { caller, orgId } = auth;

          const body = await request.json().catch(() => null);
          const action = body && typeof body === "object" ? (body as Record<string, unknown>).action : undefined;

          // Top-up, called when the Rota opens: fill the caller's due patterns a little further.
          if (action === "topup") {
            const tooMany = await limited(`shifts_patterns_topup_${caller.uid}`, 120);
            if (tooMany) return tooMany;
            const r = await fillDuePatterns({
              orgId,
              managerId: caller.role === "manager" ? caller.uid : undefined,
              max: TOPUP_MAX_PATTERNS,
            });
            logEvent({
              action: "shift.pattern.topup",
              outcome: "ok",
              correlationId: correlationId(request),
              orgId,
              uid: caller.uid,
              fields: { checked: r.checked, written: r.written, failed: r.failed },
            });
            return Response.json({ ok: true, ...r });
          }
          if (action !== "create") {
            return Response.json({ error: "Unknown action." }, { status: 400 });
          }

          const tooMany = await limited(`shifts_patterns_${caller.uid}`, 60);
          if (tooMany) return tooMany;

          const today = await orgToday(orgId);
          const parsed = parsePatternCreate(body, today);
          if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
          const { employeeIds, rule, startDay, endDay, requestId } = parsed.value;

          const shiftsOk = await checkRuleShifts(orgId, rule);
          if (!shiftsOk.ok) return Response.json({ error: shiftsOk.error }, { status: shiftsOk.status });

          const checked = await checkPeople(callerFromToken(caller), orgId, employeeIds);
          if (!checked.ok) return Response.json({ error: checked.error }, { status: checked.status });

          const userSnaps = await firestoreAdmin.getAll(
            ...employeeIds.map((uid) => firestoreAdmin.collection("users").doc(uid)),
          );
          const nameByUid = new Map<string, string>();
          for (const snap of userSnaps) {
            const docName =
              snap.exists && typeof snap.data()?.displayName === "string" ? snap.data()!.displayName.trim() : "";
            const authName = checked.people.get(snap.id)?.authDisplayName.trim() || "";
            // Editable by the person and copied onto every assignment, so keep it short.
            nameByUid.set(snap.id, (docName || authName || "Employee").slice(0, 80));
          }

          // Refuse a pattern that would clash with one the person already has (a retry of this
          // same request is not a clash: it has the same id).
          const wanted = { rule, startDay, endDay };
          for (const uid of employeeIds) {
            const id = patternDocId(uid, requestId);
            const clash = (await activePatternsFor(orgId, uid)).find((p) => p.id !== id && patternsOverlap(wanted, p));
            if (clash) {
              return Response.json(
                {
                  error: `${nameByUid.get(uid) || "This person"} already has a pattern on some of these days. End or change it first.`,
                },
                { status: 409 },
              );
            }
          }

          const now = new Date().toISOString();
          const ids: string[] = [];
          for (const uid of employeeIds) {
            const id = patternDocId(uid, requestId);
            const ref = firestoreAdmin.collection(PATTERNS).doc(id);
            // Create only if missing, so a retried request never makes a second pattern or resets one.
            await firestoreAdmin.runTransaction(async (tx) => {
              const existing = await tx.get(ref);
              if (existing.exists) return;
              tx.set(ref, {
                orgId,
                employeeId: uid,
                employeeName: nameByUid.get(uid) || "Employee",
                managerId: checked.people.get(uid)!.managerId,
                rule,
                startDay,
                endDay,
                filledThrough: null,
                nextFillDay: startDay,
                status: "active",
                createdBy: caller.uid,
                createdAt: now,
                updatedAt: now,
              });
            });
            ids.push(id);
          }

          let written = 0;
          const skipped: Record<string, number> = {};
          for (const id of ids) {
            const r = await fillPattern(id, { today });
            written += r?.written ?? 0;
            for (const [k, v] of Object.entries(r?.skipped ?? {})) skipped[k] = (skipped[k] ?? 0) + (v ?? 0);
          }

          logEvent({
            action: "shift.pattern.create",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: { people: employeeIds.length, kind: rule.kind, written },
          });
          return Response.json({ ok: true, patternIds: ids, written, skipped });
        } catch (err) {
          console.error("POST /api/shifts/patterns error:", err);
          return Response.json({ error: "Could not save the shift pattern." }, { status: 500 });
        }
      },

      PATCH: async ({ request }) => {
        try {
          return await applyEdit(request, "edit");
        } catch (err) {
          console.error("PATCH /api/shifts/patterns error:", err);
          return Response.json({ error: "Could not change the shift pattern." }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          return await applyEdit(request, "end");
        } catch (err) {
          console.error("DELETE /api/shifts/patterns error:", err);
          return Response.json({ error: "Could not end the shift pattern." }, { status: 500 });
        }
      },
    },
  },
});
