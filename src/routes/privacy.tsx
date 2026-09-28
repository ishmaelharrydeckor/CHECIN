import { createFileRoute, Link } from "@tanstack/react-router";
import { ChecInLogo } from "@/components/ChecInLogo";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — ChecIN" },
      { name: "description", content: "Privacy policy for ChecIN Workforce Attendance SaaS." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#0E2322] flex flex-col font-sans">
      <header className="border-b border-[#EBEBEB] bg-white/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center no-underline">
            <ChecInLogo size={26} />
          </Link>
          <div className="flex gap-4 text-sm font-medium">
            <Link to="/terms" className="hover:text-emerald-700 transition-colors">
              Terms of Service
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
            <h1 className="text-3xl font-medium tracking-tight text-[#0E2322] m-0">Privacy Policy</h1>
            <p className="text-[#6D6D6D] text-sm mt-1">
              ChecIN Technologies Inc. · Workforce Verification & Data Protection
            </p>
          </div>
        </div>

        <p className="text-sm text-[#6D6D6D]">Last updated: September 2026</p>

        <h2 className="text-xl font-medium text-[#0E2322] mt-8">1. Privacy Principles &amp; No GPS Tracking</h2>
        <p>
          ChecIN is designed around employee privacy. Unlike legacy attendance systems that require continuous
          background geolocation tracking or intrusive geofencing permissions, ChecIN verifies physical presence
          using a localized tablet QR code at entrance points. We do not track, collect, or store employee GPS
          locations.
        </p>

        <h2 className="text-xl font-medium text-[#0E2322] mt-8">2. Information We Collect</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <b>Account Information:</b> Name, corporate email address, and authentication identifiers managed via
            Firebase Authentication.
          </li>
          <li>
            <b>Attendance Events:</b> Timestamped check-in and check-out records linked to the specific authorized
            entrance kiosk identifier.
          </li>
          <li>
            <b>Organizational Metadata:</b> Organization name, department groupings, manager assignments, and
            approved leave requests.
          </li>
        </ul>

        <h2 className="text-xl font-medium text-[#0E2322] mt-8">3. Multi-Tenant Data Isolation</h2>
        <p>
          All organizational data is partitioned by strict tenant boundaries (`orgId`). Employees can only
          view their own attendance history; managers are restricted to their assigned teams; and organization
          administrators control tenant-wide settings. Data is never shared or commingled across organizations.
        </p>

        <h2 className="text-xl font-medium text-[#0E2322] mt-8">4. Security &amp; Encryption</h2>
        <p>
          All communication is encrypted in transit via TLS 1.3. Cryptographic tokens and kiosk device secrets
          are protected using timing-safe HMAC verification and SHA-256 one-way hashing.
        </p>

        <h2 className="text-xl font-medium text-[#0E2322] mt-8">5. Contact Information</h2>
        <p>
          For data protection inquiries or GDPR/statutory data requests, contact our privacy officer at{" "}
          <a href="mailto:privacy@checin.com" className="text-emerald-700 underline">
            privacy@checin.com
          </a>
          .
        </p>
      </main>

      <PublicFooter />
    </div>
  );
}
