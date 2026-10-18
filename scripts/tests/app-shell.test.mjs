import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The app shell (left menu). These guard what must not be lost in a layout change: every link each
// kind of person had before, the employee restrictions, sign out, and the phone drawer.
const shell = readFileSync("src/components/AppShell.tsx", "utf8");

function linksOf(block) {
  return [...block.matchAll(/to:\s*"([^"]+)"/g)].map((m) => m[1]);
}
const managerBlock = shell.slice(shell.indexOf("if (canManage)"), shell.indexOf("return [\n    {\n      heading: \"My workspace\""));
const employeeBlock = shell.slice(shell.indexOf('heading: "My workspace"'), shell.indexOf("/** The grouped links"));

test("a manager or admin still has every page they had in the top menu", () => {
  const links = linksOf(managerBlock);
  for (const to of [
    "/dashboard", "/history", "/reports", "/late-arrivals", "/announcements",
    "/leave", "/holidays", "/shifts", "/departments", "/settings",
  ]) {
    assert.ok(links.includes(to), `manager menu has ${to}`);
  }
  assert.equal(new Set(links).size, links.length, "no link is listed twice");
});

test("an employee still has only their own pages", () => {
  const links = linksOf(employeeBlock);
  assert.deepEqual(links.sort(), ["/announcements", "/history", "/holidays", "/leave", "/me", "/my-shifts"]);
  for (const forbidden of ["/dashboard", "/reports", "/departments", "/settings", "/shifts", "/late-arrivals"]) {
    assert.ok(!links.includes(forbidden), `employee menu must not have ${forbidden}`);
  }
});

test("management pages are still closed to employees", () => {
  assert.ok(/MANAGER_ONLY_PATHS = \[[^\]]*"\/dashboard"[^\]]*"\/reports"[^\]]*"\/departments"[^\]]*"\/settings"[^\]]*"\/shifts"[^\]]*"\/late-arrivals"/.test(shell));
  assert.ok(shell.includes("navigate({ to: \"/history\", replace: true })"));
  assert.ok(shell.includes("const canManage = isOrgAdmin || isManager;"), "default-deny: only admins and managers get the manager menu");
});

test("the labels other tests and people rely on are unchanged", () => {
  for (const label of ['label: "Late arrivals"', 'label: "My Shifts"', 'label: "Roster"', 'label: "Notices"']) {
    assert.ok(shell.includes(label), label);
  }
});

test("sign out, account, kiosk, scanner and notifications are all still reachable", () => {
  assert.ok(shell.includes("handleSignOut") && shell.includes("clearUserAppCache()"));
  assert.ok(shell.includes('to="/account"'));
  assert.ok(shell.includes('to="/kiosk"') && shell.includes('to="/scan"'));
  assert.ok(shell.includes("InAppNotificationCenter") && shell.includes("ReportProblemButton"));
  assert.ok(shell.includes("registerOrVerifyDevice") && shell.includes("listenToDeviceStatus"), "device session handling is kept");
});

test("the kiosk link is for managers only; the phone drawer uses the accessible Sheet", () => {
  assert.ok(/canManage && \(\s*<Link\s+to="\/kiosk"/.test(shell));
  assert.ok(shell.includes("SheetContent") && shell.includes("SheetTitle"));
});

test("house rules: no emoji icons, no stored data, no GPS", () => {
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(shell), "no emoji in the shell");
  assert.ok(!/localStorage|sessionStorage|geolocation/i.test(shell));
});
