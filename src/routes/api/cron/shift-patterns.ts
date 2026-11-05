import { createFileRoute } from "@tanstack/react-router";
import { checkCronAuth, cleanCronSecret, presentedCronToken } from "@/lib/cron-auth.server";
import { runRefill } from "@/lib/pattern-refill";
import { fillDuePatterns } from "@/lib/shift-patterns.server";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit.server";
import { correlationId, logEvent } from "@/lib/log.server";

/**
 * The nightly refill of repeating shift patterns (shifts phase 6; docs/SHIFTS-DESIGN.md).
 *
 * Called once a night by Vercel's scheduler (see vercel.json), and by hand with the same secret to test.
 * It tops every organization's patterns up to 62 days ahead, so a pattern never runs dry even if nobody opens
 * the Rota for weeks. Safe to run any number of times: filling a pattern writes only days not yet filled and
 * never overwrites a manual assignment (see `fillPattern`).
 *
 * Nothing in the request is trusted: there is no body, no query and no caller identity. The only way in is
 * the CRON_SECRET bearer token; without it configured, the route refuses everyone.
 */
export const Route = createFileRoute("/api/cron/shift-patterns")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cid = correlationId(request);
        try {
          const auth = checkCronAuth(request.headers.get("authorization"), process.env.CRON_SECRET);

          if (auth === "not_configured") {
            logEvent({ action: "cron.shift_patterns", outcome: "error", correlationId: cid, fields: { reason: "no_secret" } });
            return Response.json({ error: "The nightly refill is not set up on this server." }, { status: 503 });
          }

          if (auth === "denied") {
            // Only wrong attempts are counted, so the real nightly call can never be locked out.
            const rate = await checkRateLimit(`cron_denied_${clientIpFrom(request)}`, {
              limit: 5,
              windowMs: 15 * 60_000,
              failClosed: true,
            });
            // Lengths only, never the values: enough to tell a stray space or the wrong project from a typo.
            logEvent({
              action: "cron.shift_patterns",
              outcome: "denied",
              correlationId: cid,
              fields: {
                limited: !rate.allowed,
                sentLength: presentedCronToken(request.headers.get("authorization")).length,
                expectedLength: cleanCronSecret(process.env.CRON_SECRET).length,
              },
            });
            return rate.allowed
              ? Response.json({ error: "Not allowed." }, { status: 401 })
              : Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
          }

          const summary = await runRefill((max) => fillDuePatterns({ max }));
          logEvent({
            action: "cron.shift_patterns",
            outcome: summary.failed > 0 ? "error" : "ok",
            correlationId: cid,
            fields: { ...summary },
          });
          return Response.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
        } catch (err) {
          logEvent({ action: "cron.shift_patterns", outcome: "error", correlationId: cid, fields: { reason: "exception" } });
          console.error("GET /api/cron/shift-patterns error:", err);
          return Response.json({ error: "The nightly refill failed." }, { status: 500 });
        }
      },
    },
  },
});
