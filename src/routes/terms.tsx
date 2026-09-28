import { createFileRoute, Link } from "@tanstack/react-router";
import { ChecInLogo } from "@/components/ChecInLogo";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — ChecIN" },
      { name: "description", content: "Terms of Service for ChecIN Workforce Attendance SaaS." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#0E2322] flex flex-col font-sans">
      <header className="border-b border-[#EBEBEB] bg-white/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center no-underline">
            <ChecInLogo size={26} />
          </Link>
          <div className="flex gap-4 text-sm font-medium">
            <Link to="/privacy" className="hover:text-emerald-700 transition-colors">
              Privacy Policy
            </Link>
            <Link to="/auth" className="hover:text-emerald-700 transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-12 prose prose-stone">
        <div className="flex items-center gap-4 pb-6 border-b border-[#EBEBEB] not-prose mb-8">
          <ChecInLogo size={42} showText={false} />
          <div>
            <h1 className="text-3xl font-medium tracking-tight text-[#0E2322] m-0">Terms of Service</h1>
            <p className="text-[#6D6D6D] text-sm mt-1">
              ChecIN Technologies Inc. · Workforce Verification & Attendance Platform
            </p>
          </div>
        </div>

        <p className="text-sm text-[#6D6D6D]">Last updated: September 2026</p>

        <h2 className="text-xl font-medium text-[#0E2322] mt-8">1. Acceptance of Terms</h2>
        <p>
          By creating an organization account, pairing a kiosk tablet, or checking in via the ChecIN
          application (&quot;the Service&quot;), your organization agrees to be bound by these Terms of Service.
        </p>

        <h2 className="text-xl font-medium text-[#0E2322] mt-8">2. Organizational Accounts &amp; Roles</h2>
        <p>
          Organizations maintain independent data isolation boundaries. Organization Administrators are
          responsible for maintaining authorized manager and employee access, issuing staff invitations, and
          managing paired physical entrance kiosk hardware.
        </p>

        <h2 className="text-xl font-medium text-[#0E2322] mt-8">3. Physical Presence Verification</h2>
        <p>
          ChecIN relies on short-lived cryptographic tokens displayed by authorized entrance kiosks to verify
          physical presence. Users agree not to tamper with, photograph, forward, or reverse-engineer kiosk
          tokens, pairing codes, or device secrets.
        </p>

        <h2 className="text-xl font-medium text-[#0E2322] mt-8">4. Service Availability &amp; SLA</h2>
        <p>
          We strive for 99.9% uptime across our verification endpoints. Kiosks and scanner applications
          require an active internet connection to authenticate and verify check-in tokens against server clocks.
        </p>

        <h2 className="text-xl font-medium text-[#0E2322] mt-8">5. Termination &amp; Data Export</h2>
        <p>
          Organizations may terminate their subscription at any time. Attendance history and timesheet records
          remain exportable in standard formats (CSV, PDF) throughout the active subscription and for 30 days
          following cancellation.
        </p>
      </main>

      <PublicFooter />
    </div>
  );
}
