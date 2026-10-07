/**
 * Load test: simulates N employees scanning and M kiosks polling, against a
 * deployed STAGING copy of ChecIN. Prints latency percentiles and error counts.
 *
 * It creates its own throwaway organization, users, locations and kiosks in the
 * staging Firebase project, runs, then deletes them (unless --keep).
 *
 * Safety:
 *   - Refuses to run if FIREBASE_SERVICE_ACCOUNT belongs to the production
 *     project. Test users are created with the service account, so a production
 *     key would put fake people into real data.
 *   - Reads every secret from environment variables only. Nothing is written to disk.
 *
 * Required environment (use staging values only):
 *   LOADTEST_BASE_URL         the staging site, e.g. https://checin-git-staging-xxx.vercel.app
 *   FIREBASE_SERVICE_ACCOUNT  staging service-account JSON (raw or base64)
 *   FIREBASE_WEB_API_KEY      the staging project's web API key (VITE_FIREBASE_API_KEY)
 *
 * Usage:
 *   node scripts/load-test.mjs [--employees 50] [--kiosks 2] [--ramp 60] [--rounds 1] [--keep]
 *
 *   --employees  number of simulated employees (default 50)
 *   --kiosks     number of simulated entrance tablets (default 2)
 *   --ramp       seconds over which the first scans are spread (default 60; use 900 to mimic a morning rush)
 *   --rounds     scans per employee: 1 = check in, 2 = check in then out after the 60 s cooldown (default 1)
 *   --keep       leave the test data in place (default: delete it)
 *
 * Reads and writes per scan are NOT measured here (the client cannot see them).
 * Note the Firestore usage page (Firebase console > Firestore > Usage) before and
 * after a run on an otherwise quiet staging project; the difference divided by the
 * number of successful scans is the per-scan cost.
 */
import crypto from "node:crypto";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PRODUCTION_PROJECT_ID = process.env.PRODUCTION_FIREBASE_PROJECT_ID || "checin-d172e";

// ---------------------------------------------------------------- args
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
const EMPLOYEES = arg("employees", 50);
const KIOSKS = arg("kiosks", 2);
const RAMP_S = arg("ramp", 60);
const ROUNDS = Math.min(arg("rounds", 1), 2);
const KEEP = process.argv.includes("--keep");

// ---------------------------------------------------------------- environment checks
function fail(msg) {
  console.error(`\nload-test: ${msg}\n`);
  process.exit(1);
}
const baseUrl = (process.env.LOADTEST_BASE_URL || "").replace(/[/]+$/, "");
const apiKey = process.env.FIREBASE_WEB_API_KEY;
const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!baseUrl || !/^https?:[/][/]/.test(baseUrl)) fail("set LOADTEST_BASE_URL to the staging site URL.");
if (!apiKey) fail("set FIREBASE_WEB_API_KEY to the staging project's web API key.");
if (!rawSa) fail("set FIREBASE_SERVICE_ACCOUNT to the staging service-account JSON.");

let serviceAccount;
try {
  const t = rawSa.trim();
  serviceAccount = JSON.parse(t.startsWith("{") ? t : Buffer.from(t, "base64").toString("utf8"));
  if (typeof serviceAccount.private_key === "string") {
    serviceAccount.private_key = serviceAccount.private_key.replace(/[\\]n/g, "\n");
  }
} catch {
  fail("FIREBASE_SERVICE_ACCOUNT could not be parsed.");
}
if (serviceAccount.project_id === PRODUCTION_PROJECT_ID) {
  fail(`refusing to run: this service account is the PRODUCTION project (${PRODUCTION_PROJECT_ID}). Use the staging key.`);
}

const app = initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id }, "loadtest");
const auth = getAuth(app);
const db = getFirestore(app);
if (process.env.FIREBASE_DATABASE_ID && process.env.FIREBASE_DATABASE_ID !== "(default)") {
  console.log("note: FIREBASE_DATABASE_ID is set; this script uses the default database.");
}

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const runId = `lt${Date.now().toString(36)}`;
const orgId = `loadtest_${runId}`;

const stats = { kioskToken: [], scan: [] };
const statusCounts = { kioskToken: {}, scan: {} };
const errorSamples = new Map();

function record(kind, ms, status, body) {
  stats[kind].push(ms);
  statusCounts[kind][status] = (statusCounts[kind][status] || 0) + 1;
  if (status !== 200) {
    const key = `${kind} ${status}: ${String(body?.error || body?.detail || "").slice(0, 100)}`;
    errorSamples.set(key, (errorSamples.get(key) || 0) + 1);
  }
}

async function timedPost(kind, path, headers, payload) {
  const t0 = performance.now();
  let status = 0;
  let body = null;
  try {
    const res = await fetch(baseUrl + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch (e) {
    status = 0;
    body = { error: String(e?.message || e) };
  }
  record(kind, performance.now() - t0, status, body);
  return { status, body };
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx], idx);
      }
    }),
  );
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

// ---------------------------------------------------------------- setup
const created = { uids: [], locationIds: [] };

async function setup() {
  console.log(`Creating test data in project ${serviceAccount.project_id} (org ${orgId})...`);
  const now = new Date().toISOString();

  await db.collection("organizations").doc(orgId).set({
    name: `Load test ${runId}`,
    plan: "growth",
    timezone: "UTC",
    region: "nam5",
    schemaVersion: 1,
    loadTest: runId,
    createdAt: now,
    createdById: "loadtest",
  });

  const managerUid = `${runId}_mgr`;
  const users = [
    { uid: managerUid, email: `${managerUid}@loadtest.invalid`, customClaims: { role: "manager", orgId, managerId: managerUid } },
  ];
  for (let i = 0; i < EMPLOYEES; i++) {
    const uid = `${runId}_e${i}`;
    users.push({ uid, email: `${uid}@loadtest.invalid`, customClaims: { role: "employee", orgId, managerId: managerUid } });
  }
  // importUsers takes up to 1000 per call and can set custom claims directly.
  for (let i = 0; i < users.length; i += 500) {
    const batch = users.slice(i, i + 500);
    const res = await auth.importUsers(batch);
    if (res.failureCount) fail(`could not create ${res.failureCount} test users: ${res.errors[0]?.error?.message}`);
  }
  created.uids = users.map((u) => u.uid);

  for (let i = 0; i < users.length; i += 400) {
    const wb = db.batch();
    for (const u of users.slice(i, i + 400)) {
      wb.set(db.collection("users").doc(u.uid), {
        displayName: u.uid === managerUid ? "Load Manager" : `Load Employee ${u.uid.split("_e")[1]}`,
        email: u.email,
        orgId,
        managerId: managerUid,
        loadTest: runId,
      });
    }
    await wb.commit();
  }

  const kiosks = [];
  for (let k = 0; k < KIOSKS; k++) {
    const locationId = `${runId}_loc${k}`;
    const secret = crypto.randomBytes(32).toString("hex");
    await db.collection("locations").doc(locationId).set({
      orgId,
      name: `Load Entrance ${k}`,
      reportingTime: "08:00",
      closingTime: "17:00",
      checkoutWindowMinutes: 60,
      loadTest: runId,
    });
    await db.collection("kiosks").doc(locationId).set({
      orgId,
      locationId,
      locationName: `Load Entrance ${k}`,
      kiosk_secret_hash: sha256(secret),
      kiosk_paired_at: now,
      loadTest: runId,
    });
    created.locationIds.push(locationId);
    kiosks.push({ locationId, secret, token: null, stop: false });
  }
  return { managerUid, kiosks };
}

async function idTokenFor(uid) {
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.idToken) throw new Error(`sign-in failed for ${uid}: ${json?.error?.message || res.status}`);
  return json.idToken;
}

// ---------------------------------------------------------------- run
async function kioskLoop(k) {
  while (!k.stop) {
    const { status, body } = await timedPost("kioskToken", "/api/kiosk/token", { "x-kiosk-secret": k.secret }, { locationId: k.locationId });
    if (status === 200 && body?.token) k.token = body.token;
    // Real tablets wait for the interval the server asks for.
    await sleep(status === 200 ? Math.max(1000, Number(body?.pollMs) || 4000) : 4000);
  }
}

async function run({ kiosks, tokens }) {
  const loops = kiosks.map((k) => kioskLoop(k));
  while (kiosks.some((k) => !k.token)) await sleep(200);

  const employees = created.uids.filter((u) => u.includes("_e"));
  const scanOnce = async (uid, idx) => {
    const k = kiosks[idx % kiosks.length];
    return timedPost("scan", "/api/check-in/scan", { authorization: `Bearer ${tokens.get(uid)}` }, { token: k.token, locationId: k.locationId });
  };

  console.log(`Scanning: ${employees.length} employees over ${RAMP_S}s across ${kiosks.length} kiosk(s), ${ROUNDS} round(s)...`);
  const t0 = Date.now();
  await Promise.all(
    employees.map(async (uid, idx) => {
      await sleep(Math.random() * RAMP_S * 1000);
      await scanOnce(uid, idx);
      if (ROUNDS === 2) {
        await sleep(62000); // past the 60 s cooldown, so this one is the check-out
        await scanOnce(uid, idx);
      }
    }),
  );
  const elapsed = (Date.now() - t0) / 1000;

  for (const k of kiosks) k.stop = true;
  await Promise.race([Promise.all(loops), sleep(15000)]);
  return elapsed;
}

// ---------------------------------------------------------------- cleanup
async function deleteByOrg(collection) {
  for (;;) {
    const snap = await db.collection(collection).where("orgId", "==", orgId).limit(400).get();
    if (snap.empty) return;
    const wb = db.batch();
    snap.docs.forEach((d) => wb.delete(d.ref));
    await wb.commit();
  }
}

async function cleanup() {
  console.log("Deleting test data...");
  for (const c of ["clock_events", "daily_summaries", "users", "locations", "kiosks"]) {
    await deleteByOrg(c).catch((e) => console.warn(`  could not clear ${c}: ${e.message}`));
  }
  for (const id of created.locationIds) await db.collection("recent_scans").doc(id).delete().catch(() => {});
  await db.collection("organizations").doc(orgId).delete().catch(() => {});
  for (let i = 0; i < created.uids.length; i += 1000) {
    await auth.deleteUsers(created.uids.slice(i, i + 1000)).catch((e) => console.warn(`  could not delete users: ${e.message}`));
  }
}

// ---------------------------------------------------------------- report
function report(elapsed) {
  console.log("\n================ RESULTS ================");
  console.log(`target        ${baseUrl}`);
  console.log(`project       ${serviceAccount.project_id}`);
  console.log(`employees     ${EMPLOYEES}   kiosks ${KIOSKS}   ramp ${RAMP_S}s   rounds ${ROUNDS}`);
  for (const kind of ["scan", "kioskToken"]) {
    const sorted = [...stats[kind]].sort((a, b) => a - b);
    const ok = statusCounts[kind][200] || 0;
    console.log(`\n${kind === "scan" ? "POST /api/check-in/scan" : "POST /api/kiosk/token"}`);
    console.log(`  requests ${sorted.length}   ok ${ok}   failed ${sorted.length - ok}   status ${JSON.stringify(statusCounts[kind])}`);
    console.log(`  latency ms   p50 ${pct(sorted, 50).toFixed(0)}   p95 ${pct(sorted, 95).toFixed(0)}   p99 ${pct(sorted, 99).toFixed(0)}   max ${(sorted.at(-1) || 0).toFixed(0)}`);
  }
  console.log(`\nscan throughput  ${(stats.scan.length / elapsed).toFixed(1)} per second over ${elapsed.toFixed(0)} s`);
  if (errorSamples.size) {
    console.log("\nError samples:");
    for (const [k, n] of errorSamples) console.log(`  ${n} x ${k}`);
  }
  console.log("\nReads and writes per scan: compare the Firestore usage page before and after this run.");
}

// ---------------------------------------------------------------- main
(async () => {
  let exitCode = 0;
  try {
    const { kiosks } = await setup();

    console.log(`Signing in ${EMPLOYEES} test employees...`);
    const tokens = new Map();
    const employees = created.uids.filter((u) => u.includes("_e"));
    await pool(employees, 20, async (uid) => tokens.set(uid, await idTokenFor(uid)));

    const elapsed = await run({ kiosks, tokens });
    report(elapsed);
  } catch (e) {
    console.error("\nload-test failed:", e?.message || e);
    exitCode = 1;
  } finally {
    if (KEEP) console.log(`\n--keep: test data left in place (org ${orgId}).`);
    else await cleanup();
    await deleteApp(app).catch(() => {});
  }
  process.exit(exitCode);
})();
