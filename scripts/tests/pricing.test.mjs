import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CURRENCY,
  TRIAL_DAYS,
  YEARLY_DISCOUNT,
  PLAN_PRICE,
  PLAN_STARTER_FEATURES,
  PLAN_GROWTH_FEATURES,
  priceCents,
  perMonth,
} from "../../src/lib/pricing.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read("src/routes/index.tsx");
const pricingSection = page.slice(page.indexOf("PRICING SECTION"), page.indexOf("CUSTOMER STORIES"));

// ---------------------------------------------------------------- the numbers
test("prices are per person per month in US dollars, with a 14-day trial and 20% off for yearly", () => {
  assert.equal(CURRENCY, "USD");
  assert.equal(TRIAL_DAYS, 14);
  assert.equal(YEARLY_DISCOUNT, 0.2);
  assert.deepEqual(PLAN_PRICE, { starter: 4, growth: 8 });
});

test("the price shown is exact: whole dollars have no decimals, yearly shows cents", () => {
  assert.equal(perMonth("starter", false), "$4");
  assert.equal(perMonth("growth", false), "$8");
  assert.equal(perMonth("starter", true), "$3.20");
  assert.equal(perMonth("growth", true), "$6.40");
});

test("yearly is exactly 20% below monthly, in whole cents, with no rounding drift", () => {
  for (const plan of ["starter", "growth"]) {
    const monthly = priceCents(plan, false);
    const yearly = priceCents(plan, true);
    assert.ok(Number.isInteger(monthly) && Number.isInteger(yearly), "whole cents");
    assert.equal(yearly, Math.round(monthly * 0.8));
    assert.ok(yearly < monthly);
  }
  assert.equal(priceCents("starter", true), 320);
  assert.equal(priceCents("growth", true), 640);
});

test("the higher plan costs more than the lower one", () => {
  assert.ok(PLAN_PRICE.growth > PLAN_PRICE.starter);
});

// ---------------------------------------------------------------- what each plan says it includes is built
test("no plan promises something that is not built yet", () => {
  const unbuilt = [/SSO/i, /SCIM/i, /payroll/i, /HRIS/i, /overtime/i, /compliance/i, /balance/i, /scheduled report/i, /geo/i, /wi-?fi/i, /integration/i, /\bSLA\b/, /diary/i, /GPS/i];
  const all = [...PLAN_STARTER_FEATURES, ...PLAN_GROWTH_FEATURES, pricingSection].join("\n");
  for (const pattern of unbuilt) assert.ok(!pattern.test(all), `must not mention ${pattern}`);
});

test("Growth builds on Starter, and the shift, break, work-from-home and analytics features are in Growth only", () => {
  assert.equal(PLAN_GROWTH_FEATURES[0], "Everything in Starter");
  const starter = PLAN_STARTER_FEATURES.join(" ").toLowerCase();
  const growth = PLAN_GROWTH_FEATURES.join(" ").toLowerCase();
  for (const word of ["shift", "break", "work from home", "analytics"]) {
    assert.ok(growth.includes(word), `Growth has ${word}`);
    assert.ok(!starter.includes(word), `Starter does not have ${word}`);
  }
});

// ---------------------------------------------------------------- the page
test("the page reads the prices from the one file, and no price is typed into it", () => {
  assert.ok(page.includes('from "@/lib/pricing"'));
  assert.ok(pricingSection.includes('perMonth("starter"') && pricingSection.includes('perMonth("growth"'));
  assert.ok(!/\$\s?\d/.test(pricingSection), "no dollar amount is written into the page itself");
  assert.ok(pricingSection.includes("{TRIAL_DAYS}") && pricingSection.includes("{YEARLY_DISCOUNT * 100}"));
});

test("the old template pricing is gone: no free plan, no invented promises", () => {
  for (const phrase of ["Free Up To 15", "Simple Pricing That Scales With You", "implementation, integrations, and compliance packs", "Time Clock & Timesheets", "Leave Requests & Balances", "Email Support", "Multi-Manager Workgroups", "Volume Pricing", "Dedicated Account Manager", "Statutory Compliance", "SSO, SCIM"]) {
    assert.ok(!page.includes(phrase), `still says: ${phrase}`);
  }
});

test("every plan offers the same trial, and the sign-up form says so without naming a plan", () => {
  assert.equal((pricingSection.match(/Start \{TRIAL_DAYS\}-day free trial/g) ?? []).length, 2);
  const auth = read("src/routes/auth.tsx");
  assert.ok(auth.includes("Includes a 14-day free trial of every feature. No credit card required."));
  assert.ok(!auth.includes("on Growth plan"));
});

test("Enterprise is a conversation, not a price, and lists nothing that is not built", () => {
  const enterprise = pricingSection.slice(pricingSection.indexOf("{/* Enterprise */}"));
  assert.ok(enterprise.includes("Let's talk") && enterprise.includes("Contact us"));
  assert.ok(enterprise.includes("Everything in Growth"));
});

test("the plan names match what the app already stores for a new organization's trial", () => {
  assert.ok(read("src/routes/api/auth/register-org.ts").includes('plan: "growth"'));
});
