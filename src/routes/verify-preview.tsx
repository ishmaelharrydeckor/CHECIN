import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { CheckYourEmailCard } from "@/components/verify/CheckYourEmailCard";
import { FinishSetupScreen } from "@/components/verify/FinishSetupScreen";
import { VerifyEmailBanner } from "@/components/verify/VerifyEmailBanner";
import type { FinishSetupState, SendStatus } from "@/lib/verify-email-screens";

/**
 * TEMPORARY PREVIEW (task 1.4a). Delete this route once the screens are wired
 * into the real sign-up flow and the Account page.
 *
 * Shows every state of the email verification screens with sample props, so
 * they can be checked without the real flow. Nothing here sends an email.
 */
export const Route = createFileRoute("/verify-preview")({
  head: () => ({
    meta: [
      { title: "Email verification preview — ChecIN" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyPreviewPage,
});

const SAMPLE_EMAIL = "ama.mensah@example.com";
const LONG_EMAIL = "a.very.long.address.for.the.finance.department@subsidiary.example-company.com";
const noop = () => {};

function VerifyPreviewPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0E2322]">
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
          <p className="font-semibold">Temporary preview (task 1.4a)</p>
          <p>
            Sample data only; nothing is sent. The integrator deletes this page after wiring the
            screens into sign-up and the Account page.
          </p>
        </div>

        <Section title="Try it" note="Resend and Send behave as they will for real (sending, then a 60-second wait).">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <LiveCheckYourEmail />
            <LiveBanner />
          </div>
        </Section>

        <Section title="Check your email" note="Every state of CheckYourEmailCard.">
          <Grid>
            <Labelled label="idle">
              <CheckYourEmailCard email={SAMPLE_EMAIL} status="idle" onResend={noop} onStartOver={noop} />
            </Labelled>
            <Labelled label="sending">
              <CheckYourEmailCard email={SAMPLE_EMAIL} status="sending" onResend={noop} onStartOver={noop} />
            </Labelled>
            <Labelled label="sent (cooldown running)">
              <CheckYourEmailCard email={SAMPLE_EMAIL} status="sent" onResend={noop} onStartOver={noop} />
            </Labelled>
            <Labelled label="error">
              <CheckYourEmailCard
                email={SAMPLE_EMAIL}
                status="error"
                errorMessage="Too many emails were sent to this address. Please wait a few minutes."
                onResend={noop}
                onStartOver={noop}
              />
            </Labelled>
            <Labelled label="idle, long address">
              <CheckYourEmailCard email={LONG_EMAIL} status="idle" onResend={noop} onStartOver={noop} />
            </Labelled>
          </Grid>
        </Section>

        <Section title="Finish setup" note="Every state of FinishSetupScreen.">
          <Grid>
            {(["working", "error", "expired"] as FinishSetupState[]).map((state) => (
              <Labelled key={state} label={state}>
                <FinishSetupScreen state={state} onRetry={noop} onStartAgain={noop} />
              </Labelled>
            ))}
          </Grid>
        </Section>

        <Section title="Account page banner" note="Every state of VerifyEmailBanner. When verified, nothing is shown.">
          <div className="space-y-4">
            {(["idle", "sending", "sent", "error"] as SendStatus[]).map((status) => (
              <Labelled key={status} label={status === "sent" ? "sent (cooldown running)" : status}>
                <VerifyEmailBanner verified={false} email={SAMPLE_EMAIL} status={status} onSend={noop} />
              </Labelled>
            ))}
            <Labelled label="verified (renders nothing)">
              <div className="rounded-xl border border-dashed border-slate-200 p-4">
                <VerifyEmailBanner verified email={SAMPLE_EMAIL} status="idle" onSend={noop} />
              </div>
            </Labelled>
          </div>
        </Section>
      </div>
    </div>
  );
}

/** Pretends to send: "sending" for a moment, then "sent" (or "error" every third try). */
function useFakeSend() {
  const [status, setStatus] = useState<SendStatus>("idle");
  const [tries, setTries] = useState(0);
  const send = () => {
    setStatus("sending");
    const next = tries + 1;
    setTries(next);
    window.setTimeout(() => setStatus(next % 3 === 0 ? "error" : "sent"), 900);
  };
  return { status, send };
}

function LiveCheckYourEmail() {
  const { status, send } = useFakeSend();
  return (
    <Labelled label="CheckYourEmailCard (every third send fails)">
      <CheckYourEmailCard email={SAMPLE_EMAIL} status={status} onResend={send} onStartOver={noop} />
    </Labelled>
  );
}

function LiveBanner() {
  const { status, send } = useFakeSend();
  return (
    <Labelled label="VerifyEmailBanner (every third send fails)">
      <VerifyEmailBanner verified={false} email={SAMPLE_EMAIL} status={status} onSend={send} />
    </Labelled>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-[#0E2322]">{title}</h2>
        <p className="text-xs text-slate-500">{note}</p>
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      {children}
    </div>
  );
}
