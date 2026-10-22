/**
 * Plans and features: which plan unlocks which feature, and what a given organization may use right now.
 * Pure: no database, no clock (the time is passed in), so every rule can be tested. The server guard that
 * applies it is `plan-gate.server.ts`. The public prices and plan descriptions live in `pricing.ts`.
 *
 * THE rule of this file: this table is the only place a feature is tied to a plan. Routes never decide
 * "is this a paid feature?" themselves; they name a feature and ask the guard.
 *
 * Trials: every organization starts with a free trial of EVERY feature (docs/PRICING-PROPOSAL.md). An
 * organization created before trial dates were stored has none, so it is "grandfathered": it keeps every
 * feature and never expires, until we decide otherwise.
 */
/** How long the free trial lasts (docs/PRICING-PROPOSAL.md). When pricing.ts is on staging it should re-export this, so there is one number. */
export const TRIAL_DAYS = 14;

export type PlanId = "starter" | "growth" | "enterprise";
export const PLAN_RANK: Record<PlanId, number> = { starter: 1, growth: 2, enterprise: 3 };
export const PLAN_LABEL: Record<PlanId, string> = { starter: "Starter", growth: "Growth", enterprise: "Enterprise" };

export type FeatureKey =
  // Growth
  | "shifts"
  | "shift_swaps"
  | "shift_patterns"
  | "breaks"
  | "wfh"
  | "analytics"
  // Enterprise
  | "audit_trail"
  | "data_export"
  | "leave_balances"
  | "scheduled_reports"
  | "overtime_payroll"
  | "sso";

export interface FeatureInfo {
  /** How the feature is named to a person, in "Your plan does not include ___". */
  label: string;
  /** The lowest plan that includes it. */
  minPlan: PlanId;
  /** False while it is only planned. An unbuilt feature must never be offered on the page. */
  built: boolean;
}

export const FEATURES: Record<FeatureKey, FeatureInfo> = {
  shifts: { label: "Shifts", minPlan: "growth", built: true },
  shift_swaps: { label: "Shift swaps", minPlan: "growth", built: true },
  shift_patterns: { label: "Repeating shift patterns", minPlan: "growth", built: true },
  breaks: { label: "Unpaid breaks", minPlan: "growth", built: true },
  wfh: { label: "Work from home", minPlan: "growth", built: true },
  analytics: { label: "Attendance analytics", minPlan: "growth", built: true },

  audit_trail: { label: "The audit trail", minPlan: "enterprise", built: false },
  data_export: { label: "Full data export", minPlan: "enterprise", built: false },
  leave_balances: { label: "Leave types and balances", minPlan: "enterprise", built: false },
  scheduled_reports: { label: "Scheduled report emails", minPlan: "enterprise", built: false },
  overtime_payroll: { label: "Overtime and payroll export", minPlan: "enterprise", built: false },
  sso: { label: "Company sign-in (SSO)", minPlan: "enterprise", built: false },
};

export function isPlanId(v: unknown): v is PlanId {
  return v === "starter" || v === "growth" || v === "enterprise";
}

export type PlanStatus = "trial" | "active" | "expired";

export interface PlanAccess {
  plan: PlanId;
  status: PlanStatus;
  /** When the free trial ends (ISO), or null when there is no end date. */
  trialEndsAt: string | null;
  /** Created before trial dates were stored: keeps everything, never expires. */
  grandfathered: boolean;
  /**
   * Features switched on for THIS organization whatever its plan (the owner gives one company early access, a
   * custom deal or a pilot). Stored as `featureGrants: { sso: true }` on the organization and written only by
   * the server. Only a grant can be stored; there is no way to take away a feature the plan includes.
   */
  granted: FeatureKey[];
}

/** The end of a trial that starts at `startMs`, as stored on a new organization. */
export function trialEndsAtFrom(startMs: number): string {
  return new Date(startMs + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * What an organization may use at `nowMs`, from what is stored on it. Never throws and never locks anyone out
 * because of damaged data: an unknown plan reads as the legacy trial label ("growth"), and an unreadable trial
 * date reads as no end.
 *
 *  - `planStatus: "active"` (set only by billing, which does not exist yet): the paid plan applies.
 *  - otherwise a trial, which has every feature, until `trialEndsAt` passes; then it is "expired".
 */
export function resolvePlan(orgData: unknown, nowMs: number): PlanAccess {
  const r = orgData && typeof orgData === "object" && !Array.isArray(orgData) ? (orgData as Record<string, unknown>) : {};
  const plan: PlanId = isPlanId(r.plan) ? r.plan : "growth";
  const granted = grantedFeatures(r.featureGrants);
  if (r.planStatus === "active") return { plan, status: "active", trialEndsAt: null, grandfathered: false, granted };

  const endMs = typeof r.trialEndsAt === "string" ? Date.parse(r.trialEndsAt) : Number.NaN;
  if (!Number.isFinite(endMs)) return { plan, status: "trial", trialEndsAt: null, grandfathered: true, granted };
  const trialEndsAt = new Date(endMs).toISOString();
  return { plan, status: nowMs <= endMs ? "trial" : "expired", trialEndsAt, grandfathered: false, granted };
}

/** The features named in `featureGrants` whose value is exactly true. Unknown names and anything else are ignored. */
export function grantedFeatures(raw: unknown): FeatureKey[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const map = raw as Record<string, unknown>;
  return (Object.keys(FEATURES) as FeatureKey[]).filter((k) => map[k] === true);
}

/** Whether this organization may use the feature right now. */
export function canUseFeature(feature: FeatureKey, access: PlanAccess): boolean {
  if (access.granted.includes(feature)) return true; // switched on for this organization specifically
  const need = PLAN_RANK[FEATURES[feature].minPlan];
  if (access.status === "trial") return true; // a trial has every feature
  if (access.status === "active") return PLAN_RANK[access.plan] >= need;
  return PLAN_RANK.starter >= need; // expired: only what every plan has
}

/** The plain sentence shown when a feature is not included. */
export function lockedMessage(feature: FeatureKey, access?: PlanAccess): string {
  const info = FEATURES[feature];
  const plan = PLAN_LABEL[info.minPlan];
  return access?.status === "expired"
    ? `Your free trial has ended, so ${info.label.toLowerCase()} is switched off. Choose a plan to turn it back on.`
    : `${info.label} is not part of your plan. The ${plan} plan includes it.`;
}

// ---------------------------------------------------------------- how strictly the rules are applied
/**
 *  off     the rules are not even consulted: nothing changes for anyone (the default)
 *  shadow  everything is allowed, but each request that WOULD have been blocked is logged, so we can see who
 *          would be affected before we enforce anything
 *  on      a request for a feature the plan does not include is refused
 */
export type EnforcementMode = "off" | "shadow" | "on";

export function parseEnforcementMode(raw: string | undefined | null): EnforcementMode {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return v === "on" || v === "shadow" ? v : "off";
}

export type GateAction = "allow" | "log" | "deny";

export function decideGate(input: { mode: EnforcementMode; feature: FeatureKey; access: PlanAccess }): GateAction {
  if (input.mode === "off") return "allow";
  if (canUseFeature(input.feature, input.access)) return "allow";
  return input.mode === "on" ? "deny" : "log";
}
