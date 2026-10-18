import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { summaryDocId } from "@/lib/daily-summary";
import { assignmentFromDoc } from "@/lib/shift-scan";
import { describeAssignment } from "@/lib/shift-rota";
import { dayCoveredByLeave } from "@/lib/wfh";
import {
  SWAP_ACTIONS,
  buildSwapDoc,
  canSeeSwap,
  checkSwapEligibility,
  currentParties,
  decideSwapAction,
  isOpenSwap,
  parseCandidatesDay,
  parseProposeRequest,
  parseSwapActionRequest,
  parseSwapSettingsInput,
  shiftsStillAsProposed,
  swapAssignments,
  swapDocId,
  swapManagerIds,
  swapCandidatesFrom,
  swapRowFromDoc,
  type AssignmentDoc,
  type SwapCaller,
  type SwapParties,
  type SwapRow,
} from "@/lib/shift-swaps";
import {
  SWAPS,
  SWAP_LIST_CAP,
  canHoldShifts,
  type ClaimedPerson,
  isHoliday,
  loadClaimedPeople,
  loadSwapOrg,
  loadSwapPerson,
} from "@/lib/shift-swaps.server";

type Caller = NonNullable<Awaited<ReturnType<typeof verifyCallerToken>>>;

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

async function authCaller(
  request: Request,
): Promise<{ ok: true; caller: Caller; orgId: string; me: SwapCaller } | { ok: false; response: Response }> {
  const caller = await verifyCallerToken(request.headers.get("authorization"), { checkRevoked: true });
  const orgId = typeof caller?.orgId === "string" ? caller.orgId : "";
  if (!caller?.uid || !orgId) return { ok: false, response: refuse(401, "Not authenticated") };
  if (caller.role !== "org_admin" && caller.role !== "manager" && caller.role !== "employee") {
    return { ok: false, response: refuse(403, "You do not have access to shift swaps.") };
  }
  return { ok: true, caller, orgId, me: { uid: caller.uid, role: caller.role } };
}

async function limited(key: string, limit: number): Promise<Response | null> {
  const rate = await checkRateLimit(key, { limit, windowMs: 60 * 60 * 1000 });
  return rate.allowed ? null : refuse(429, `Too many changes. Please try again in ${rate.retryAfterMinutes} minutes.`);
}

function partiesOf(data: Record<string, unknown>): SwapParties {
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    proposerId: String(data.proposerId ?? ""),
    colleagueId: String(data.colleagueId ?? ""),
    proposerManagerId: str(data.proposerManagerId),
    colleagueManagerId: str(data.colleagueManagerId),
    status: String(data.status ?? ""),
  };
}

/** Each person's manager as read from their claims now (null for someone who has left). */
function managersNow(swap: SwapParties, people: Map<string, ClaimedPerson>) {
  return {
    proposerManagerId: people.get(swap.proposerId)?.managerId ?? null,
    colleagueManagerId: people.get(swap.colleagueId)?.managerId ?? null,
  };
}

/** The moves the caller could make on a swap right now, so the screens show only real buttons. */
function actionsFor(swap: SwapParties, me: SwapCaller): string[] {
  return SWAP_ACTIONS.filter((a) => decideSwapAction(swap, me, a).ok);
}

async function propose(request: Request, caller: Caller, orgId: string, body: Record<string, unknown>) {
  if (caller.role !== "employee" && caller.role !== "manager") {
    return refuse(403, "Only people with shifts can propose a swap.");
  }
  const tooMany = await limited(`shift_swaps_propose_${caller.uid}`, 30);
  if (tooMany) return tooMany;

  const org = await loadSwapOrg(orgId);
  if (!org.swapsEnabled) return refuse(403, "Shift swaps are switched off for your organization.");

  const { action: _action, ...rest } = body;
  const parsed = parseProposeRequest(rest, org.today);
  if (!parsed.ok) return refuse(400, parsed.error);
  const { colleagueId, dayKey, note, requestId } = parsed.value;
  if (colleagueId === caller.uid) return refuse(400, "Choose a colleague, not yourself.");

  const people = await loadClaimedPeople(orgId, [caller.uid, colleagueId]);
  const me = people.get(caller.uid);
  const colleague = people.get(colleagueId);
  // Same 404 whether the colleague does not exist, is in another organization, or holds no shifts.
  if (!canHoldShifts(colleague)) return refuse(404, "That colleague was not found in your organization.");
  if (!canHoldShifts(me)) return refuse(403, "Only people with shifts can propose a swap.");

  const [mine, theirs, holiday] = await Promise.all([
    loadSwapPerson(orgId, me, dayKey, org.today),
    loadSwapPerson(orgId, colleague, dayKey, org.today),
    isHoliday(orgId, dayKey),
  ]);
  const eligible = checkSwapEligibility({ today: org.today, dayKey, holiday, proposer: mine.check, colleague: theirs.check });
  if (!eligible.ok) return refuse(400, eligible.error);

  // One open swap per person per day, so two proposals cannot fight over the same shift.
  const openFor = async (field: "proposerId" | "colleagueId", uid: string) => {
    const snap = await firestoreAdmin
      .collection(SWAPS)
      .where("orgId", "==", orgId)
      .where(field, "==", uid)
      .where("dayKey", "==", dayKey)
      .limit(20)
      .get();
    return snap.docs.filter((d) => isOpenSwap(d.data().status));
  };
  const id = swapDocId(caller.uid, dayKey, requestId);
  const open = (
    await Promise.all([
      openFor("proposerId", caller.uid),
      openFor("colleagueId", caller.uid),
      openFor("proposerId", colleagueId),
      openFor("colleagueId", colleagueId),
    ])
  )
    .flat()
    .filter((d) => d.id !== id);
  if (open.length > 0) {
    return refuse(409, "One of you already has a swap waiting for that day. Finish or cancel it first.");
  }

  const ref = firestoreAdmin.collection(SWAPS).doc(id);
  const doc = buildSwapDoc({
    orgId,
    dayKey,
    proposer: mine.party!,
    colleague: theirs.party!,
    note,
    requestId,
    at: new Date().toISOString(),
  });
  // Create only if missing, so a retried proposal never makes a second swap.
  await firestoreAdmin.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists) tx.set(ref, doc);
  });

  logEvent({
    action: "shift.swap.propose",
    outcome: "ok",
    correlationId: correlationId(request),
    orgId,
    uid: caller.uid,
    fields: { swapId: id, dayKey },
  });
  return Response.json({ ok: true, swapId: id });
}

async function act(request: Request, caller: Caller, orgId: string, me: SwapCaller, body: Record<string, unknown>) {
  const parsed = parseSwapActionRequest(body);
  if (!parsed.ok) return refuse(400, parsed.error);
  const { swapId, action } = parsed.value;
  const tooMany = await limited(`shift_swaps_act_${caller.uid}`, 60);
  if (tooMany) return tooMany;

  const ref = firestoreAdmin.collection(SWAPS).doc(swapId);
  const first = await ref.get();
  const firstData = first.exists ? first.data() : undefined;
  // Same 404 whether the swap is missing, in another organization, or not the caller's to see.
  if (!firstData || firstData.orgId !== orgId) return refuse(404, "Swap not found.");

  // Managers are read from the two people's claims now, for who may see the swap as well as who may
  // decide it, so a manager change since the proposal moves the swap to the new manager.
  const stored = partiesOf(firstData);
  const people = await loadClaimedPeople(orgId, [stored.proposerId, stored.colleagueId]);
  const managers = managersNow(stored, people);
  if (!canSeeSwap(currentParties(stored, managers), me)) return refuse(404, "Swap not found.");
  const org = await loadSwapOrg(orgId);
  const holiday = action === "approve" ? await isHoliday(orgId, String(firstData.dayKey)) : false;
  const now = new Date().toISOString();

  try {
    const next = await firestoreAdmin.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();
      if (!data || data.orgId !== orgId) throw new Refusal(404, "Swap not found.");
      const fresh = currentParties(partiesOf(data), managers);
      const decision = decideSwapAction(fresh, me, action);
      if (!decision.ok) throw new Refusal(decision.status, decision.error);
      if ((action === "accept" || action === "approve") && !org.swapsEnabled) {
        throw new Refusal(403, "Shift swaps are switched off for your organization.");
      }

      if (action === "approve") {
        const day = String(data.dayKey);
        if (!canHoldShifts(people.get(fresh.proposerId)) || !canHoldShifts(people.get(fresh.colleagueId))) {
          throw new Refusal(409, "One of the two people is no longer on staff, so this swap cannot go ahead.");
        }
        const pRef = firestoreAdmin.collection("shift_assignments").doc(String(data.proposerAssignmentId));
        const cRef = firestoreAdmin.collection("shift_assignments").doc(String(data.colleagueAssignmentId));
        const pSum = firestoreAdmin.collection("daily_summaries").doc(summaryDocId(fresh.proposerId, org.today));
        const cSum = firestoreAdmin.collection("daily_summaries").doc(summaryDocId(fresh.colleagueId, org.today));
        const leaveQuery = (uid: string) =>
          firestoreAdmin
            .collection("leave_requests")
            .where("orgId", "==", orgId)
            .where("employeeId", "==", uid)
            .where("status", "==", "approved")
            .limit(200);
        const [[pSnap, cSnap, pSumSnap, cSumSnap], pLeave, cLeave] = await Promise.all([
          tx.getAll(pRef, cRef, pSum, cSum),
          tx.get(leaveQuery(fresh.proposerId)),
          tx.get(leaveQuery(fresh.colleagueId)),
        ]);
        const pNow = pSnap.exists ? assignmentFromDoc(pSnap.data(), orgId, day) : null;
        const cNow = cSnap.exists ? assignmentFromDoc(cSnap.data(), orgId, day) : null;
        if (!shiftsStillAsProposed({ proposerShiftId: data.proposerShiftId, colleagueShiftId: data.colleagueShiftId }, pNow?.shift ?? null, cNow?.shift ?? null)) {
          throw new Refusal(409, "One of the shifts has changed since this swap was proposed, so it cannot be approved. Ask for a new swap.");
        }
        // The same checks as at proposal, on today's data: leave or a holiday may have been added since.
        const eligible = checkSwapEligibility({
          today: org.today,
          dayKey: day,
          holiday,
          proposer: {
            uid: fresh.proposerId,
            assignment: pNow ? { shiftId: pNow.shift.shiftId, shift: pNow.shift } : null,
            onLeave: dayCoveredByLeave([day], pLeave.docs.map((d) => d.data())) !== null,
            recordedToday: pSumSnap.exists,
          },
          colleague: {
            uid: fresh.colleagueId,
            assignment: cNow ? { shiftId: cNow.shift.shiftId, shift: cNow.shift } : null,
            onLeave: dayCoveredByLeave([day], cLeave.docs.map((d) => d.data())) !== null,
            recordedToday: cSumSnap.exists,
          },
        });
        if (!eligible.ok) throw new Refusal(409, eligible.error);

        const swapped = swapAssignments({
          proposer: pSnap.data() as AssignmentDoc,
          colleague: cSnap.data() as AssignmentDoc,
          swapId,
          approvedBy: caller.uid,
          at: now,
        });
        if (!swapped.ok) throw new Refusal(409, swapped.error);
        tx.set(pRef, swapped.value.proposer);
        tx.set(cRef, swapped.value.colleague);
      }

      // The managers it was decided under, so the stored list (and the read rule) catch up with a change.
      const update: Record<string, unknown> = {
        status: decision.next,
        updatedAt: now,
        proposerManagerId: managers.proposerManagerId,
        colleagueManagerId: managers.colleagueManagerId,
        managerIds: swapManagerIds(managers.proposerManagerId, managers.colleagueManagerId),
      };
      if (action === "accept") update.acceptedAt = now;
      else {
        update.decidedBy = caller.uid;
        update.decidedRole = caller.role;
        update.decidedAt = now;
        update.decision = action;
      }
      tx.update(ref, update);
      return decision.next;
    });

    logEvent({
      action: `shift.swap.${action}`,
      outcome: "ok",
      correlationId: correlationId(request),
      orgId,
      uid: caller.uid,
      fields: { swapId, status: next },
    });
    return Response.json({ ok: true, status: next });
  } catch (err) {
    if (err instanceof Refusal) {
      logEvent({
        action: `shift.swap.${action}`,
        outcome: "denied",
        correlationId: correlationId(request),
        orgId,
        uid: caller.uid,
        fields: { swapId, status: err.status },
      });
      return refuse(err.status, err.message);
    }
    throw err;
  }
}

/**
 * The colleagues the caller can offer a swap to on one day (`GET ?candidates=YYYY-MM-DD`): people in
 * the caller's own team with a shift that day on a different shift. Names and shift names only.
 */
async function candidates(caller: Caller, orgId: string, rawDay: string | null) {
  if (caller.role !== "employee" && caller.role !== "manager") {
    return refuse(403, "Only people with shifts can propose a swap.");
  }
  const org = await loadSwapOrg(orgId);
  if (!org.swapsEnabled) return refuse(403, "Shift swaps are switched off for your organization.");
  const day = parseCandidatesDay(rawDay, org.today);
  if (!day.ok) return refuse(400, day.error);

  const mineSnap = await firestoreAdmin.collection("shift_assignments").doc(`${caller.uid}_${day.value}`).get();
  const mine = mineSnap.exists ? assignmentFromDoc(mineSnap.data(), orgId, day.value) : null;
  if (!mine) return refuse(400, "You have no shift on that day to swap.");

  // The team comes from the caller's claims: their manager, or themselves when they are a manager.
  const team = typeof caller.managerId === "string" && caller.managerId ? caller.managerId : caller.role === "manager" ? caller.uid : "";
  if (!team) return Response.json({ ok: true, candidates: [] });
  const snap = await firestoreAdmin
    .collection("shift_assignments")
    .where("orgId", "==", orgId)
    .where("managerId", "==", team)
    .where("dayKey", "==", day.value)
    .limit(200)
    .get();
  const sameDay = snap.docs.flatMap((d) => {
    const data = d.data();
    const a = assignmentFromDoc(data, orgId, day.value);
    if (!a) return [];
    return [{
      employeeId: String(data.employeeId ?? ""),
      employeeName: String(data.employeeName ?? ""),
      shiftId: a.shift.shiftId,
      shiftLabel: describeAssignment(a.shift),
    }];
  });
  return Response.json({ ok: true, candidates: swapCandidatesFrom(sameDay, { uid: caller.uid, shiftId: mine.shift.shiftId }) });
}

export const Route = createFileRoute("/api/shifts/swaps")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = await authCaller(request);
          if (!auth.ok) return auth.response;
          const { caller, orgId, me } = auth;
          const asked = new URL(request.url).searchParams;
          if (asked.has("candidates")) return await candidates(caller, orgId, asked.get("candidates"));
          const org = await loadSwapOrg(orgId);

          const base = firestoreAdmin.collection(SWAPS).where("orgId", "==", orgId);
          const queries: FirebaseFirestore.Query[] = [
            base.where("proposerId", "==", caller.uid).orderBy("createdAt", "desc").limit(50),
            base.where("colleagueId", "==", caller.uid).orderBy("createdAt", "desc").limit(50),
          ];
          if (caller.role === "manager") {
            queries.push(base.where("managerIds", "array-contains", caller.uid).orderBy("createdAt", "desc").limit(SWAP_LIST_CAP));
            // Open swaps whose people moved to this manager after the proposal are not under their
            // id yet; the claims check below keeps only the ones for their team now.
            queries.push(base.where("status", "in", ["pending", "accepted"]).orderBy("createdAt", "desc").limit(SWAP_LIST_CAP));
          }
          if (caller.role === "org_admin") {
            queries.push(base.orderBy("createdAt", "desc").limit(SWAP_LIST_CAP));
          }
          // bounded-ok: every query in `queries` above ends in .limit(50) or .limit(SWAP_LIST_CAP)
          const snaps = await Promise.all(queries.map((q) => q.get()));

          // A manager's view of an open swap depends on each person's manager now, so read their claims.
          let people = new Map<string, ClaimedPerson>();
          if (caller.role === "manager") {
            const uids = snaps.flatMap((snap) =>
              snap.docs.map((d) => partiesOf(d.data())).filter((p) => isOpenSwap(p.status)).flatMap((p) => [p.proposerId, p.colleagueId]),
            );
            people = await loadClaimedPeople(orgId, uids);
          }

          const rows = new Map<string, SwapRow & { actions: string[] }>();
          for (const snap of snaps) {
            for (const d of snap.docs) {
              const data = d.data();
              const stored = partiesOf(data);
              const parties = caller.role === "manager" ? currentParties(stored, managersNow(stored, people)) : stored;
              if (!canSeeSwap(parties, me)) continue;
              const row = swapRowFromDoc(d.id, data);
              if (row) rows.set(d.id, { ...row, actions: actionsFor(parties, me) });
            }
          }
          const swaps = [...rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          return Response.json({ ok: true, enabled: org.swapsEnabled, today: org.today, swaps });
        } catch (err) {
          console.error("GET /api/shifts/swaps error:", err);
          return refuse(500, "Could not load shift swaps.");
        }
      },

      POST: async ({ request }) => {
        try {
          const auth = await authCaller(request);
          if (!auth.ok) return auth.response;
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) return refuse(400, "Choose what to do.");
          const b = body as Record<string, unknown>;
          if (b.action === "propose") return await propose(request, auth.caller, auth.orgId, b);
          return await act(request, auth.caller, auth.orgId, auth.me, b);
        } catch (err) {
          console.error("POST /api/shifts/swaps error:", err);
          return refuse(500, "Could not update the shift swap.");
        }
      },

      PUT: async ({ request }) => {
        try {
          const auth = await authCaller(request);
          if (!auth.ok) return auth.response;
          const { caller, orgId } = auth;
          if (caller.role !== "org_admin") return refuse(403, "Only an organization admin can switch shift swaps on or off.");
          const tooMany = await limited(`shift_swaps_settings_${caller.uid}`, 60);
          if (tooMany) return tooMany;

          const parsed = parseSwapSettingsInput(await request.json().catch(() => null));
          if (!parsed.ok) return refuse(400, parsed.error);
          await firestoreAdmin
            .collection("organizations")
            .doc(orgId)
            .set({ ...parsed.value, updatedAt: new Date().toISOString() }, { merge: true });

          logEvent({
            action: "shift.swap.settings",
            outcome: "ok",
            correlationId: correlationId(request),
            orgId,
            uid: caller.uid,
            fields: { ...parsed.value },
          });
          return Response.json({ ok: true, enabled: parsed.value.shiftSwapsEnabled });
        } catch (err) {
          console.error("PUT /api/shifts/swaps error:", err);
          return refuse(500, "Could not save the shift swap setting.");
        }
      },
    },
  },
});
