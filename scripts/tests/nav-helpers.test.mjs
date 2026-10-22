import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPTY_NAV_COUNTS,
  badgeLabel,
  badgeText,
  breadcrumbFor,
  countFor,
  flattenNav,
  jumpResults,
  matchNavItem,
  parseNavCounts,
  shouldRefreshCounts,
} from "../../src/lib/nav-helpers.ts";

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const groups = [
  { heading: "Dashboards", items: [{ to: "/dashboard", label: "Roster" }, { to: "/history", label: "History" }] },
  { heading: "Manage", items: [{ to: "/shifts", label: "Shifts" }, { to: "/leave", label: "Leave" }, { to: "/wfh-review", label: "Work diary" }] },
  { items: [{ to: "/my-shifts", label: "My Shifts" }] },
];

// ---------------------------------------------------------------- badges
test("the badge shows nothing for zero, the number up to 99, and 99+ beyond", () => {
  assert.equal(badgeText(0), "");
  assert.equal(badgeText(-3), "");
  assert.equal(badgeText(Number.NaN), "");
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(99), "99");
  assert.equal(badgeText(100), "99+");
  assert.equal(badgeLabel(3), "3 waiting");
  assert.equal(badgeLabel(0), "");
});

test("only the pages that have waiting work show a count", () => {
  const counts = { leave: 4, diary: 2 };
  assert.equal(countFor("/leave", counts), 4);
  assert.equal(countFor("/wfh-review", counts), 2);
  assert.equal(countFor("/dashboard", counts), 0);
  assert.equal(countFor("/my-shifts", counts), 0);
});

test("a damaged answer from the server never produces a badge", () => {
  assert.deepEqual(parseNavCounts({ leave: 3, diary: 1 }), { leave: 3, diary: 1 });
  assert.deepEqual(parseNavCounts({ leave: -1, diary: 2.5 }), EMPTY_NAV_COUNTS);
  assert.deepEqual(parseNavCounts({ leave: "9", diary: null }), EMPTY_NAV_COUNTS);
  assert.deepEqual(parseNavCounts(null), EMPTY_NAV_COUNTS);
  assert.deepEqual(parseNavCounts("x"), EMPTY_NAV_COUNTS);
});

test("the counts are fetched again at most once a minute", () => {
  assert.equal(shouldRefreshCounts(null, 1000), true);
  assert.equal(shouldRefreshCounts(1000, 30_000), false);
  assert.equal(shouldRefreshCounts(1000, 61_000), true);
});

// ---------------------------------------------------------------- where you are
test("a page belongs to its own menu item, and a page below it belongs to the same one", () => {
  assert.equal(matchNavItem("/leave", groups)?.label, "Leave");
  assert.equal(matchNavItem("/leave/new", groups)?.label, "Leave");
  assert.equal(matchNavItem("/shifts", groups)?.label, "Shifts");
  assert.equal(matchNavItem("/my-shifts", groups)?.label, "My Shifts", "'/my-shifts' is not a page below '/shifts'");
  assert.equal(matchNavItem("/leaves", groups), null, "a longer name that merely starts the same is a different page");
  assert.equal(matchNavItem("/nowhere", groups), null);
});

test("the trail is the group, then the page; a page in no group has just its name; unknown pages have none", () => {
  assert.deepEqual(breadcrumbFor("/leave", groups), { group: "Manage", page: "Leave" });
  assert.deepEqual(breadcrumbFor("/history", groups), { group: "Dashboards", page: "History" });
  assert.deepEqual(breadcrumbFor("/my-shifts", groups), { group: null, page: "My Shifts" });
  assert.equal(breadcrumbFor("/account", groups), null);
});

// ---------------------------------------------------------------- jump to
test("jump to lists every page when nothing is typed, and never lists one twice", () => {
  const twice = [...groups, { items: [{ to: "/leave", label: "Leave" }] }];
  assert.deepEqual(flattenNav(twice).map((i) => i.to), ["/dashboard", "/history", "/shifts", "/leave", "/wfh-review", "/my-shifts"]);
  assert.equal(jumpResults(flattenNav(groups), "").length, 6);
  assert.equal(jumpResults(flattenNav(groups), "   ").length, 6);
});

test("jump to puts names that start with the typing first, then names that contain it, ignoring case", () => {
  const items = flattenNav(groups);
  assert.deepEqual(jumpResults(items, "sh").map((i) => i.label), ["Shifts", "My Shifts"]);
  assert.deepEqual(jumpResults(items, "MY").map((i) => i.label), ["My Shifts"]);
  assert.deepEqual(jumpResults(items, "diary").map((i) => i.label), ["Work diary"]);
  assert.deepEqual(jumpResults(items, "zzz"), []);
});

// ---------------------------------------------------------------- the server route and the shell
const route = read("src/routes/api/nav-counts.ts");
const shell = read("src/components/AppShell.tsx");
const hook = read("src/components/nav/useNavCounts.ts");
const jump = read("src/components/nav/JumpTo.tsx");

test("the counts route takes who is asking only from the verified token, refuses employees, and is cached", () => {
  assert.ok(route.includes("verifyCallerToken(request.headers.get(\"authorization\"))"));
  assert.ok(route.includes("resolveDashboardScope(caller)") && route.includes("status: 403"));
  assert.ok(route.includes("createTtlCache"));
  assert.ok(!/searchParams|request\.json|orgId\s*=\s*url/.test(route), "nothing about scope is read from the request");
});

test("a manager is counted only for their own team, and an admin for the organization", () => {
  assert.ok(route.includes('.where("orgId", "==", scope.orgId)'));
  assert.ok(route.includes('scope.role === "manager"') && route.includes('.where("managerId", "==", scope.uid)'));
  assert.ok(route.includes("dashboardCacheKey(scope)"), "two callers never share an answer they are not both entitled to");
});

test("the counts read numbers, not documents, and only pending work", () => {
  assert.ok(route.includes(".count().get()"));
  assert.ok(route.includes('.where("status", "==", "pending")'));
  assert.ok(route.includes('"leave_requests"') && route.includes('"wfh_diary_days"'));
  assert.ok(!route.includes("wfh_diary_intervals") && !route.includes("clock_events"));
});

test("nothing polls: the counts load on first show, on a page change and on returning to the tab", () => {
  assert.ok(!/setInterval/.test(hook + jump));
  assert.ok(hook.includes("visibilitychange") && hook.includes("pathname"));
  assert.ok(hook.includes("shouldRefreshCounts"));
});

test("people who cannot manage make no counts request at all", () => {
  assert.ok(shell.includes("useNavCounts(!loading && !!user && canManage, pathname)"));
  assert.ok(hook.includes("if (!enabled"));
});

test("the shell shows the trail, the jump search and the badges, and the jump list is the person's own menu", () => {
  assert.ok(shell.includes("breadcrumbFor(pathname, groups)"));
  assert.ok(shell.includes("<JumpTo items={jumpItems} />"));
  assert.ok(shell.includes("flattenNav(groups)"), "only pages already in this person's menu");
  assert.ok(shell.includes("countFor(item.to, counts)"));
  assert.ok(shell.includes("aria-label={badgeLabel(waiting)}"), "the number is spoken, not only shown");
});

test("jump to opens with Ctrl or Cmd K and goes only to menu pages", () => {
  assert.ok(jump.includes("e.metaKey || e.ctrlKey") && jump.includes('"k"'));
  assert.ok(jump.includes("items.map("));
  assert.ok(!jump.includes("fetch(") && !jump.includes("authedFetch"), "it searches page names only, so it reads no data");
});
