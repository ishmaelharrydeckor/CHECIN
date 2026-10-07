/**
 * Rebuilds `daily_summaries` from `clock_events` for a range of days.
 *
 * Summaries are derived data, so this is always safe to re-run: it overwrites a
 * day's summary with exactly what the events say (the same function the scan
 * route uses, src/lib/daily-summary.ts). Run it once after deploying the scan
 * rewrite so history and "today" have summaries, and any time a summary is
 * suspected wrong.
 *
 * Usage (staging unless you say otherwise):
 *   FIREBASE_SERVICE_ACCOUNT=... node scripts/backfill-summaries.mjs --from 2026-10-01 --to 2026-10-07 [--org <orgId>] [--dry-run]
 *
 *   --from / --to   first and last day (YYYY-MM-DD, in each organization's timezone), inclusive
 *   --org           only this organization
 *   --dry-run       print what would be written, write nothing
 *   --allow-production   required if the service account is the production project
 *
 * The service account comes from the environment only; nothing is read from disk.
 */
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { dayKey } from "../src/lib/attendance-day.ts";
import { summaryDocId, summaryFromEvents } from "../src/lib/daily-summary.ts";

const PRODUCTION_PROJECT_ID = process.env.PRODUCTION_FIREBASE_PROJECT_ID || "checin-d172e";

function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name) => process.argv.includes(`--${name}`);
function fail(msg) {
  console.error(`\nbackfill-summaries: ${msg}\n`);
  process.exit(1);
}

const from = flag("from");
const to = flag("to") || from;
const onlyOrg = flag("org");
const dryRun = has("dry-run");
const dayRe = /^\d{4}-\d{2}-\d{2}$/;
if (!from || !dayRe.test(from) || !dayRe.test(to)) fail("give --from YYYY-MM-DD (and optionally --to YYYY-MM-DD).");
if (from > to) fail("--from is after --to.");

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) fail("set FIREBASE_SERVICE_ACCOUNT (staging unless you know you want production).");
let sa;
try {
  const t = raw.trim();
  sa = JSON.parse(t.startsWith("{") ? t : Buffer.from(t, "base64").toString("utf8"));
  if (typeof sa.private_key === "string") sa.private_key = sa.private_key.replace(/[\\]n/g, "\n");
} catch {
  fail("FIREBASE_SERVICE_ACCOUNT could not be parsed.");
}
if (sa.project_id === PRODUCTION_PROJECT_ID && !has("allow-production")) {
  fail(`this is the PRODUCTION project (${PRODUCTION_PROJECT_ID}). Add --allow-production if you really mean it (use --dry-run first).`);
}

const app = initializeApp({ credential: cert(sa), projectId: sa.project_id }, "backfill");
const db = getFirestore(app);

const tzCache = new Map();
async function timezoneOf(orgId) {
  if (!tzCache.has(orgId)) {
    const snap = await db.collection("organizations").doc(orgId).get();
    tzCache.set(orgId, snap.data()?.timezone || "UTC");
  }
  return tzCache.get(orgId);
}

function* daysBetween(a, b) {
  const end = new Date(`${b}T00:00:00.000Z`).getTime();
  for (let t = new Date(`${a}T00:00:00.000Z`).getTime(); t <= end; t += 86_400_000) {
    yield new Date(t).toISOString().slice(0, 10);
  }
}

const MARGIN_MS = 14 * 3_600_000; // timezones run from UTC-12 to UTC+14

async function backfillDay(day) {
  const start = new Date(new Date(`${day}T00:00:00.000Z`).getTime() - MARGIN_MS).toISOString();
  const end = new Date(new Date(`${day}T00:00:00.000Z`).getTime() + 86_400_000 + MARGIN_MS).toISOString();

  const groups = new Map(); // `${orgId}|${employeeId}` -> { identity, events[] }
  let last = null;
  for (;;) {
    let q = db.collection("clock_events").where("timestamp", ">=", start).where("timestamp", "<", end).orderBy("timestamp").limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    for (const d of snap.docs) {
      const e = d.data();
      if (!e.orgId || !e.employeeId || !e.timestamp || (onlyOrg && e.orgId !== onlyOrg)) continue;
      const tz = await timezoneOf(e.orgId);
      const eventDay = e.dayKey || dayKey(e.timestamp, tz);
      if (eventDay !== day) continue;
      const key = `${e.orgId}|${e.employeeId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          identity: {
            orgId: e.orgId,
            managerId: e.managerId ?? null,
            employeeId: e.employeeId,
            employeeName: e.employeeName || "Employee",
            department: e.department || "",
            dayKey: day,
          },
          events: [],
        });
      }
      groups.get(key).events.push({
        type: e.type === "out" ? "out" : "in",
        timestamp: e.timestamp,
        late: e.late === true,
        earlyDeparture: e.earlyDeparture === true,
      });
    }
    if (snap.size < 500) break;
    last = snap.docs[snap.docs.length - 1];
  }

  const nowIso = new Date().toISOString();
  let written = 0;
  let batch = db.batch();
  let inBatch = 0;
  for (const { identity, events } of groups.values()) {
    const summary = summaryFromEvents(events, identity, nowIso);
    if (!summary) continue;
    if (!dryRun) {
      batch.set(db.collection("daily_summaries").doc(summaryDocId(identity.employeeId, day)), summary);
      if (++inBatch >= 400) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }
    written++;
  }
  if (!dryRun && inBatch) await batch.commit();
  console.log(`${day}: ${written} summar${written === 1 ? "y" : "ies"} ${dryRun ? "(dry run, nothing written)" : "written"}`);
}

(async () => {
  console.log(`Project ${sa.project_id}${onlyOrg ? `, org ${onlyOrg}` : ""}, ${from} to ${to}${dryRun ? ", DRY RUN" : ""}`);
  for (const day of daysBetween(from, to)) await backfillDay(day);
  await deleteApp(app);
})().catch((e) => {
  console.error("backfill failed:", e?.message || e);
  process.exit(1);
});
