import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const design = read("docs/HR-PAYROLL-DESIGN.md");
const plan = read("docs/V2-TASK-PLAN.md");

test("the design states the money and secrecy rules the product must keep", () => {
  for (const rule of [
    "ChecIN never moves money",
    "No tax or pension rate is written in code",
    "Admin SDK only",
    "never** on the `users` document",
    "Maker and checker",
    "Nothing is deleted",
  ]) assert.ok(design.includes(rule), rule);
});

test("every owner decision has a recommendation, and a payroll accountant is named as a prerequisite", () => {
  for (const d of ["D1", "D2", "D3", "D4", "D5", "D6", "D7"]) assert.ok(new RegExp(`\| ${d} \|`).test(design), d);
  assert.ok(design.includes("You need one before payroll starts"));
});

test("no tax or pension figure is written into the design: rates come from the authorities and an accountant", () => {
  assert.ok(!/\b\d{1,2}(\.\d+)?\s?%/.test(design), "no percentage appears in the design");
  assert.ok(design.includes("I will not enter numbers from memory"));
});

test("the plan has Phase 7 with eighteen tasks, each pointing to the design, and it comes after the Enterprise phase", () => {
  assert.ok(plan.includes("## Phase 7: HR and payroll"));
  assert.ok(plan.indexOf("## Phase 7") > plan.indexOf("## Phase 5"));
  const rows = [...plan.matchAll(/^\| (7\.\d+) \|/gm)].map((m) => m[1]);
  assert.equal(rows.length, 18);
  assert.equal(new Set(rows).size, 18);
  assert.ok(plan.includes("HR-PAYROLL-DESIGN.md"));
});

test("payroll depends on what it needs: overtime, leave balances, the audit trail", () => {
  for (const dep of ["3.2", "2.2", "5.3"]) assert.ok(plan.slice(plan.indexOf("## Phase 7")).includes(dep), dep);
});

test("the design describes the second flagship: one account and many products, a switcher, its own landing page, links on every page, and standalone use", () => {
  for (const idea of ["second flagship product", "One account, many products", "product switcher", "A separate landing page for each product", "Every page of every product carries links to the others", "It must work alone", "Plans have two axes"]) {
    assert.ok(design.includes(idea), idea);
  }
  for (const d of ["D8", "D9", "D10", "D11", "D12"]) assert.ok(new RegExp(`\| ${d} \|`).test(design), d);
});

test("the plan has the product tasks and they say what they need", () => {
  const phase = plan.slice(plan.indexOf("## Phase 7"));
  for (const id of ["7.14", "7.15", "7.16", "7.17", "7.18"]) assert.ok(phase.includes(`| ${id} |`), id);
  assert.ok(phase.includes("decisions D8, D9"), "the landing page waits for the name and domain");
  assert.ok(phase.includes("Only goes live when the product exists"), "nothing is drawn for what is not built");
});

test("HR and payroll are two modules on one shared people record, sold separately or together", () => {
  for (const idea of ["one shared people record with two modules on top", "The people record (the core, shared by everything)", "The HR module", "The Payroll module", "so a company can buy payroll without buying the HR module", "bundle price"]) {
    assert.ok(design.includes(idea), idea);
  }
  assert.ok(design.includes("| D11 | Are HR and Payroll sold separately or together | **Separately from the start"));
});

test("payroll depends on the people record, not on the HR module", () => {
  const phase = plan.slice(plan.indexOf("## Phase 7"));
  assert.ok(phase.includes("| 7.2 | **The shared people record**"));
  for (const hr of ["7.3", "7.4", "7.5"]) assert.ok(new RegExp(`\\| ${hr} \\| \\*\\*HR module:`).test(phase), `${hr} is an HR module task`);
  assert.ok(/\| 7\.6 \| \*\*Payroll module:/.test(phase));
  assert.ok(phase.includes("| 7.18 |") && phase.includes("Decision D11"));
});
