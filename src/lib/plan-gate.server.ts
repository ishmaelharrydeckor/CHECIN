/**
 * The server guard for paid features. A route names the feature; this decides (rules in `plans.ts`).
 *
 *   const blocked = await gateFeature(orgId, "analytics", { uid, request });
 *   if (blocked) return blocked;
 *
 * Safe by design:
 *  - With PLAN_ENFORCEMENT unset or "off" it returns at once without reading anything, so it costs nothing.
 *  - "shadow" only logs what would have been blocked.
 *  - It never blocks because of a fault of ours: if the organization cannot be read, the request is allowed
 *    and the fault is logged.
 *  - The plan is read from the organization's own document, found by the caller's verified organization, never
 *    from anything in the request.
 */
import { firestoreAdmin } from "@/integrations/firebase/admin.server";
import { correlationId, logEvent } from "@/lib/log.server";
import { createTtlCache } from "@/lib/ttl-cache.server";
import { decideGate, lockedMessage, parseEnforcementMode, resolvePlan, FEATURES, type FeatureKey, type PlanAccess } from "@/lib/plans";

const cache = createTtlCache<PlanAccess>(60_000, 2000);

export async function gateFeature(
  orgId: string,
  feature: FeatureKey,
  ctx: { uid?: string | null; request?: Request } = {},
): Promise<Response | null> {
  const mode = parseEnforcementMode(process.env.PLAN_ENFORCEMENT);
  if (mode === "off") return null;

  const cid = ctx.request ? correlationId(ctx.request) : "none";
  let access = cache.get(orgId);
  if (!access) {
    try {
      const snap = await firestoreAdmin.collection("organizations").doc(orgId).get();
      access = resolvePlan(snap.exists ? snap.data() : undefined, Date.now());
      cache.set(orgId, access);
    } catch {
      logEvent({ action: "plan.gate", outcome: "error", correlationId: cid, orgId, uid: ctx.uid ?? null, fields: { feature, reason: "read_error" } });
      return null; // our own fault never blocks anyone
    }
  }

  const action = decideGate({ mode, feature, access });
  if (action === "allow") return null;

  logEvent({
    action: "plan.gate",
    outcome: action === "deny" ? "denied" : "ok",
    correlationId: cid,
    orgId,
    uid: ctx.uid ?? null,
    fields: { feature, plan: access.plan, status: access.status, mode, wouldBlock: true },
  });
  if (action === "log") return null;

  return Response.json(
    { error: lockedMessage(feature, access), code: "plan_required", feature, requiredPlan: FEATURES[feature].minPlan },
    { status: 403 },
  );
}
