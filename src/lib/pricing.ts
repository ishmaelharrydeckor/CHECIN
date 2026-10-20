/**
 * ChecIN's public prices and what each plan includes: the one place the numbers live (docs/PRICING-PROPOSAL.md).
 * The landing page reads this today; plan gating and billing will read it too, so a price or a feature is never
 * written down twice. Pure: no clock, no network.
 *
 * Prices are per person, per month, in US dollars. Only features that are built today are listed.
 */
export const CURRENCY = "USD";
export const TRIAL_DAYS = 14;
/** Yearly billing takes this share off the monthly price. */
export const YEARLY_DISCOUNT = 0.2;

export type PlanId = "starter" | "growth";

export const PLAN_PRICE: Record<PlanId, number> = {
  starter: 4,
  growth: 8,
};

export const PLAN_STARTER_FEATURES = [
  "QR check-in and check-out at your entrance",
  "A live Today view: who is in, late or away",
  "Late arrival review, with a reason when one is excused",
  "Leave requests and approvals",
  "Announcements and notifications",
  "Holiday calendar and departments",
  "Attendance register and leave reports, as CSV or PDF",
] as const;

export const PLAN_GROWTH_FEATURES = [
  "Everything in Starter",
  "Shifts: a rota, repeating patterns and shift swaps",
  "Unpaid breaks, with paid time in your reports",
  "Work from home days",
  "Attendance analytics and trends",
] as const;

/** The monthly price per person, in whole cents, for the chosen billing period. */
export function priceCents(plan: PlanId, yearly: boolean): number {
  const monthly = PLAN_PRICE[plan] * 100;
  return Math.round(yearly ? monthly * (1 - YEARLY_DISCOUNT) : monthly);
}

/** "$4", "$8", "$3.20" or "$6.40": whole dollars have no decimals, anything else has two. */
export function perMonth(plan: PlanId, yearly: boolean): string {
  const cents = priceCents(plan, yearly);
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}
