// Negative/positive access-control checks against a running ChecIN server.
//
// Use THROWAWAY organizations on a STAGING Firebase project — never the live lab data.
// Provide Firebase ID tokens (from the signed-in browser: await firebaseAuth.currentUser.getIdToken(true))
// and user ids through environment variables, then:
//
//   BASE_URL=http://localhost:3001 \
//   A_ADMIN_TOKEN=... A_MANAGER_TOKEN=... A_MANAGER_UID=... A_EMPLOYEE_TOKEN=... A_EMPLOYEE_UID=... \
//   B_MANAGER_TOKEN=... B_MANAGER_UID=... B_EMPLOYEE_UID=... \
//   node scripts/verify-access-control.mjs
//
// Org A and Org B each have an admin/manager/employee; A_EMPLOYEE reports to A_MANAGER.
// This script sends tokens only to BASE_URL and prints pass/fail per check. No secrets are stored.

const env = process.env;
const base = env.BASE_URL || "http://localhost:3001";
let failed = 0;

async function call(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

function check(name, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`);
}

const denied = (r) => r.status === 403 || r.status === 404 || r.status === 401;

// 1. Roles endpoint: cross-tenant and privilege checks
let r = await call("POST", "/api/admin/roles", env.B_MANAGER_TOKEN, { targetUid: env.A_EMPLOYEE_UID, role: "employee" });
check("B manager cannot change an org A user's role", denied(r), JSON.stringify(r));

r = await call("POST", "/api/admin/roles", env.B_MANAGER_TOKEN, { targetUid: env.A_MANAGER_UID, role: "employee" });
check("B manager cannot demote an org A manager", denied(r), JSON.stringify(r));

r = await call("POST", "/api/admin/roles", env.A_MANAGER_TOKEN, { targetUid: env.B_EMPLOYEE_UID, role: "employee" });
check("A manager cannot claim an org B employee", denied(r), JSON.stringify(r));

r = await call("POST", "/api/admin/roles", env.A_MANAGER_TOKEN, { targetUid: env.A_ADMIN_UID, role: "employee" });
check("A manager cannot demote the org admin", denied(r), JSON.stringify(r));

r = await call("POST", "/api/admin/roles", env.A_MANAGER_TOKEN, { targetUid: env.A_EMPLOYEE_UID, role: "manager" });
check("A manager cannot promote to manager", denied(r), JSON.stringify(r));

// 2. Push endpoint: recipients must be in scope
const payload = { title: "Access test", body: "ignore", url: "/announcements" };
r = await call("POST", "/api/push/send", env.B_MANAGER_TOKEN, { userId: env.A_EMPLOYEE_UID, payload });
check("B manager cannot push to an org A user", denied(r), JSON.stringify(r));

r = await call("POST", "/api/push/send", env.A_MANAGER_TOKEN, { userIds: [env.B_EMPLOYEE_UID], payload });
check("A manager cannot push to an org B user (userIds)", denied(r), JSON.stringify(r));

r = await call("POST", "/api/push/send", env.A_MANAGER_TOKEN, { userId: env.A_EMPLOYEE_UID, payload: { ...payload, url: "https://evil.example" } });
check("External push links are rejected", r.status === 400, JSON.stringify(r));

r = await call("POST", "/api/push/send", env.A_EMPLOYEE_TOKEN, { userId: env.A_MANAGER_UID, payload });
check("Employee cannot send push", denied(r), JSON.stringify(r));

// 3. Attendance scoping
r = await call("GET", "/api/attendance/feed", env.A_EMPLOYEE_TOKEN);
const others = (r.json?.events || []).filter((e) => e.email && e.email !== r.json?.events?.[0]?.email);
check("Employee feed contains only their own events", r.status === 200 && others.length === 0, `${others.length} foreign rows`);

r = await call("GET", "/api/attendance/history", env.A_EMPLOYEE_TOKEN);
const ids = new Set((r.json?.records || []).map((x) => x.employeeId));
check("Employee history only has their own employeeId", r.status === 200 && ids.size <= 1, `ids=${[...ids]}`);

// 4. Locations / kiosk rules
r = await call("POST", "/api/kiosk/pair-code", env.A_MANAGER_TOKEN, { locationId: "does-not-exist-" + Date.now() });
check("Manager cannot create a location through pair-code", denied(r), JSON.stringify(r));

r = await call("POST", "/api/locations/revoke", env.A_MANAGER_TOKEN, { locationId: "x" });
check("Manager cannot revoke kiosks", r.status === 403, JSON.stringify(r));

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
