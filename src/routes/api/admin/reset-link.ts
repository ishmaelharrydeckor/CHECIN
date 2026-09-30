import { createFileRoute } from "@tanstack/react-router";
import {
  firestoreAdmin,
  getAuthAdmin,
  resolveTargetInScope,
  verifyCallerToken,
} from "@/integrations/firebase/admin.server";
import { checkRateLimit } from "@/lib/rate-limit.server";

/**
 * Admin-generated password reset link.
 *
 * Lets an org admin (whole org) or a manager (own team only) create a one-time reset link for
 * a team member and hand it over personally. No email is sent, so it works even when the
 * member's email address is not a real inbox. The caller's role and org always come from the
 * verified token; the target must be in the caller's scope, and org admins can never be reset here.
 */
export const Route = createFileRoute("/api/admin/reset-link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"), {
            checkRevoked: true,
          });
          if (!caller) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          if (!caller.orgId || (caller.role !== "org_admin" && caller.role !== "manager")) {
            return Response.json(
              { error: "Only an organization admin or manager can generate reset links" },
              { status: 403 },
            );
          }

          const rate = await checkRateLimit(`reset_link_${caller.uid}`, {
            limit: 20,
            windowMs: 60 * 60 * 1000,
          });
          if (!rate.allowed) {
            return Response.json(
              { error: `Too many reset links generated. Try again in ${rate.retryAfterMinutes} minute(s).` },
              { status: 429 },
            );
          }

          const body = await request.json();
          const targetUid = String(body?.targetUid || "").trim();
          if (!targetUid) {
            return Response.json({ error: "targetUid is required" }, { status: 400 });
          }
          if (targetUid === caller.uid) {
            return Response.json(
              { error: "To change your own password, use Forgot password on the sign-in page." },
              { status: 400 },
            );
          }

          // Target must be in the caller's org (and own team for managers) — same 404 otherwise
          const target = await resolveTargetInScope(caller, targetUid);
          if (!target) {
            return Response.json({ error: "User not found in your organization" }, { status: 404 });
          }
          if (target.role === "org_admin") {
            return Response.json(
              { error: "Organization admin passwords can't be reset from here." },
              { status: 403 },
            );
          }

          const auth = getAuthAdmin();
          const user = await auth.getUser(targetUid);
          if (!user.email) {
            return Response.json({ error: "This account has no email address" }, { status: 400 });
          }

          const link = await auth.generatePasswordResetLink(user.email);

          // Audit trail (locked collection). The link itself is never stored or logged.
          await firestoreAdmin.collection("audit_logs").add({
            type: "password_reset_link_generated",
            orgId: caller.orgId,
            actorUid: caller.uid,
            actorRole: caller.role,
            targetUid,
            at: new Date().toISOString(),
          });

          return Response.json({ ok: true, link, email: user.email });
        } catch (err) {
          console.error("POST /api/admin/reset-link error:", err);
          return Response.json({ error: "Could not generate a reset link" }, { status: 500 });
        }
      },
    },
  },
});
