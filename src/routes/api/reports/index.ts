import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";
import { checkRateLimit, sanitizeRateLimitKey } from "@/lib/rate-limit.server";
import { sendNotificationToUser } from "@/lib/push-service.server";
import {
  REPORTS_PER_HOUR,
  isPlatformOwner,
  notificationText,
  parsePlatformOwners,
  validateImageBase64,
  validateReportInput,
  validateStatusUpdate,
} from "@/lib/problem-report";

/**
 * Problem reports ("Report a problem" button).
 *
 *  POST   any signed-in person: send a report (optionally one screenshot)
 *  GET    ?whoami=1  : "am I the platform owner?" (used to show the inbox link)
 *  GET    ?image=ID  : owner only, the screenshot of one report
 *  GET               : owner only, the latest 100 reports
 *  PATCH  owner only : mark a report new / seen / resolved, and add a private note
 *
 * Who sent a report comes ONLY from the verified login token, never from the form (AGENTS.md
 * rule 1). Who may READ reports is a short allowlist of user ids in the server environment
 * variable PLATFORM_OWNER_UIDS. It is deliberately not a company role: a company admin can
 * never read other people's reports. If the variable is empty, nobody can (fail closed).
 * The collections are Admin-SDK only (see firestore.rules).
 */

const MAX_BODY_CHARS = 700_000; // a 450 KB screenshot is about 600,000 base64 characters
const JSON_HEADERS = { "Cache-Control": "private, no-store" };

function owners(): Set<string> {
  return parsePlatformOwners(process.env.PLATFORM_OWNER_UIDS);
}

export const Route = createFileRoute("/api/reports/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) return Response.json({ error: "Please sign in." }, { status: 401 });

          const orgId = typeof caller.orgId === "string" && caller.orgId ? caller.orgId : null;
          if (!orgId) {
            return Response.json({ error: "Your account is not part of a company yet." }, { status: 403 });
          }

          const limit = await checkRateLimit(sanitizeRateLimitKey(`report_${caller.uid}`), {
            limit: REPORTS_PER_HOUR,
            windowMs: 60 * 60 * 1000,
          });
          if (!limit.allowed) {
            return Response.json(
              { error: "You have sent several reports already. Please try again a little later." },
              { status: 429 },
            );
          }

          const text = await request.text();
          if (text.length > MAX_BODY_CHARS) {
            return Response.json({ error: "That report is too large." }, { status: 413 });
          }
          let body: any;
          try {
            body = JSON.parse(text);
          } catch {
            return Response.json({ error: "Bad request." }, { status: 400 });
          }

          const input = validateReportInput(body);
          if (!input.ok) return Response.json({ error: input.error }, { status: 400 });

          let image: { base64: string; bytes: number } | null = null;
          if (body?.imageBase64 !== undefined && body?.imageBase64 !== null && body?.imageBase64 !== "") {
            const img = validateImageBase64(body.imageBase64);
            if (!img.ok) return Response.json({ error: img.error }, { status: 400 });
            image = img.value;
          }

          const role = typeof caller.role === "string" ? caller.role : null;
          const ref = firestoreAdmin.collection("problem_reports").doc();
          const createdAt = new Date().toISOString();

          const batch = firestoreAdmin.batch();
          batch.set(ref, {
            id: ref.id,
            orgId,
            uid: caller.uid,
            email: typeof caller.email === "string" ? caller.email : null,
            role,
            category: input.value.category,
            message: input.value.message,
            page: input.value.page,
            userAgent: input.value.userAgent,
            viewport: input.value.viewport,
            hasImage: image !== null,
            status: "new",
            createdAt,
          });
          if (image) {
            batch.set(firestoreAdmin.collection("problem_report_files").doc(ref.id), {
              reportId: ref.id,
              orgId,
              mime: "image/jpeg",
              bytes: image.bytes,
              data: image.base64,
              createdAt,
            });
          }
          await batch.commit();

          // Tell the owner(s) through the existing bell and web push. A failure here must never
          // lose or reject the report, which is already saved.
          try {
            const text2 = notificationText({ category: input.value.category, role, page: input.value.page });
            await Promise.all(
              [...owners()].map((uid) =>
                sendNotificationToUser(uid, {
                  type: "SYSTEM",
                  title: text2.title,
                  body: text2.body,
                  url: "/owner/reports",
                  entityType: "report",
                  entityId: ref.id,
                  tag: `report-${ref.id}`,
                }),
              ),
            );
          } catch (e) {
            console.warn("Could not notify the owner about a report:", e);
          }

          return Response.json({ ok: true, id: ref.id }, { headers: JSON_HEADERS });
        } catch (err) {
          console.error("POST /api/reports error:", err);
          return Response.json({ error: "Could not send your report. Please try again." }, { status: 500 });
        }
      },

      GET: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) return Response.json({ error: "Please sign in." }, { status: 401 });

          const owner = isPlatformOwner(caller.uid, owners());
          const url = new URL(request.url);

          if (url.searchParams.get("whoami") === "1") {
            return Response.json({ ok: true, owner }, { headers: JSON_HEADERS });
          }
          if (!owner) return Response.json({ error: "Not available." }, { status: 403 });

          const imageId = url.searchParams.get("image");
          if (imageId) {
            if (!/^[A-Za-z0-9]{10,40}$/.test(imageId)) return Response.json({ error: "Bad id." }, { status: 400 });
            const snap = await firestoreAdmin.collection("problem_report_files").doc(imageId).get();
            const data = snap.data();
            if (!snap.exists || !data?.data) return Response.json({ error: "Not found." }, { status: 404 });
            return new Response(Buffer.from(String(data.data), "base64"), {
              headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'",
              },
            });
          }

          const snap = await firestoreAdmin.collection("problem_reports").orderBy("createdAt", "desc").limit(100).get();
          const reports = snap.docs.map((d) => d.data());
          return Response.json({ ok: true, reports }, { headers: JSON_HEADERS });
        } catch (err) {
          console.error("GET /api/reports error:", err);
          return Response.json({ error: "Could not load reports." }, { status: 500 });
        }
      },

      PATCH: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid) return Response.json({ error: "Please sign in." }, { status: 401 });
          if (!isPlatformOwner(caller.uid, owners())) return Response.json({ error: "Not available." }, { status: 403 });

          let body: any;
          try {
            body = JSON.parse(await request.text());
          } catch {
            return Response.json({ error: "Bad request." }, { status: 400 });
          }
          const upd = validateStatusUpdate(body);
          if (!upd.ok) return Response.json({ error: upd.error }, { status: 400 });

          const ref = firestoreAdmin.collection("problem_reports").doc(upd.value.id);
          const snap = await ref.get();
          if (!snap.exists) return Response.json({ error: "Not found." }, { status: 404 });

          const changes: Record<string, unknown> = { updatedAt: new Date().toISOString(), updatedBy: caller.uid };
          if (upd.value.status !== undefined) changes.status = upd.value.status;
          if (upd.value.note !== undefined) changes.ownerNote = upd.value.note;
          await ref.update(changes);

          return Response.json({ ok: true }, { headers: JSON_HEADERS });
        } catch (err) {
          console.error("PATCH /api/reports error:", err);
          return Response.json({ error: "Could not update the report." }, { status: 500 });
        }
      },
    },
  },
});
