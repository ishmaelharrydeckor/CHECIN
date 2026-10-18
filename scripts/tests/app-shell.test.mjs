import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The app shell (left menu). These guard what must not be lost in a layout change: every link each
// kind of person had, the employee restrictions, sign out, the phone drawer, and the collapsible rail.
// Line endings are normalised so the checks behave the same in a Windows checkout and on Linux.
const shell = readFileSync("src/components/AppShell.tsx", "utf8").replace(/\r\n/g, "\n");

function linksOf(block) {
  return [...block.matchAll(/to:\s*"([^"]+)"/g)].map((m) => m[1]);
}
const managerBlock = shell.slice(shell.indexOf("if (canManage)"), shell.indexOf('heading: "My workspace"'));
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
  assert.ok(shell.includes('navigate({ to: "/history", replace: true })'));
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

test("house rules: no emoji icons, no GPS, and the only stored value is the menu choice", () => {
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(shell), "no emoji in the shell");
  assert.ok(!/sessionStorage|geolocation/i.test(shell));
  const uses = shell.match(/localStorage\.(get|set)Item\(COLLAPSE_KEY/g) ?? [];
  assert.equal(uses.length, 2, "localStorage is used only for the collapse choice");
  assert.ok(!/localStorage\.(get|set)Item\((?!COLLAPSE_KEY)/.test(shell));
  assert.ok(/try \{\s*if \(localStorage\.getItem\(COLLAPSE_KEY\)/.test(shell), "reading is inside try/catch");
  assert.ok(/try \{\s*localStorage\.setItem\(COLLAPSE_KEY/.test(shell), "writing is inside try/catch");
});

test("the menu collapses to an icon rail from a hamburger button", () => {
  assert.ok(shell.includes("const [collapsed, setCollapsed] = useState(false);"), "starts expanded, so the first paint matches the server");
  assert.ok(shell.includes("toggleCollapsed") && shell.includes("aria-expanded={!collapsed}"));
  assert.ok(/aria-label=\{collapsed \? "Expand the menu" : "Collapse the menu"\}/.test(shell));
  assert.ok(shell.includes('collapsed ? "w-16" : "w-60"'));
});

test("on the rail every link keeps its name (tooltip and screen readers) and nothing is lost", () => {
  assert.ok(shell.includes("title={collapsed ? item.label : undefined}"));
  assert.ok(shell.includes('<span className={collapsed ? "sr-only" : undefined}>{item.label}</span>'));
  for (const label of ["Kiosk", "Scanner", "Sign Out"]) assert.ok(shell.includes(label), label);
  assert.ok(shell.includes("renderFooter(collapsed)"), "the desktop rail uses the compact footer");
});

test("the phone drawer is always the full menu", () => {
  assert.ok(shell.includes("renderFooter(false)"));
  const sheet = shell.slice(shell.indexOf("<SheetContent"));
  assert.ok(!sheet.slice(0, sheet.indexOf("</SheetContent>")).includes("collapsed={collapsed}"));
});
