import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactElement } from "react";
import { BarChart3, Briefcase, CalendarClock, FileBarChart, Smartphone, Users, type LucideIcon } from "lucide-react";
import { firebaseAuth } from "@/integrations/firebase/config";
import { ChecInLogo } from "@/components/ChecInLogo";
import { CountUp, FocusText, useScrollReveal } from "@/components/landing/Motion";
import {
  ActivityPanel,
  CountdownRing,
  DoorPairing,
  TabletScreen,
  LeavePanel,
  NoticePanel,
  QrTablet,
  RecordsPanel,
} from "@/components/landing/ProductVisuals";

// What each kind of person gets. Every line describes something the product does today.
const ROLE_CARDS: { role: string; line: string; Icon: LucideIcon }[] = [
  { role: "Owners & HR", line: "One live view of who is in, late or away, across the whole organization.", Icon: Briefcase },
  { role: "Team Managers", line: "Their own team only, with leave and shift swaps to approve.", Icon: Users },
  { role: "Employees", line: "One tap to check in and out, and their own record to look back on.", Icon: Smartphone },
  { role: "Operations", line: "Shifts, rotas and who is covering, planned in one place.", Icon: CalendarClock },
  { role: "Finance", line: "Attendance and leave reports you can export to Excel or PDF.", Icon: FileBarChart },
  { role: "Leadership", line: "Attendance trends across teams, without asking anyone for a spreadsheet.", Icon: BarChart3 },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ChecIN — Modern Attendance That Proves People Were Actually There" },
      {
        name: "description",
        content:
          "ChecIN puts a rotating 15-second QR code on a tablet at your entrance. Employees scan with their mobile browser to check in and out. No GPS spoofing, no screenshot sharing.",
      },
      { property: "og:title", content: "ChecIN — Attendance That Proves People Were There" },
      {
        property: "og:description",
        content:
          "Tamper-resistant physical entrance check-in with dynamic rotating QR codes. No app store install required.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "ChecIN — Attendance That Proves People Were There" },
      {
        name: "twitter:description",
        content:
          "ChecIN puts a QR code on a tablet at your entrance that changes every 15 seconds. Tamper-resistant attendance for modern teams.",
      },
    ],
  }),
  component: LandingPage,
});

type CapabilityKey = "attendance" | "leave" | "announcements" | "records";

const CAPABILITY_DATA: Record<
  CapabilityKey,
  { title: string; Visual: () => ReactElement; alt: string; description: string }
> = {
  attendance: {
    title: "Real-Time Attendance",
    Visual: ActivityPanel,
    alt: "A live list of check-ins and check-outs with who arrived late",
    description: "See check-ins and check-outs as they happen, with who arrived late and who has not arrived yet.",
  },
  leave: {
    title: "Leave & Absence Management",
    Visual: LeavePanel,
    alt: "A list of leave requests with approved and pending status",
    description: "Employees ask for leave, their manager approves or declines, and approved leave shows up in attendance.",
  },
  announcements: {
    title: "Announcements & Team Updates",
    Visual: NoticePanel,
    alt: "A company notice and the phone notification that goes with it",
    description: "Post a notice to everyone or to one team, and send it to their phones.",
  },
  records: {
    title: "Tamper-Resistant Records",
    Visual: RecordsPanel,
    alt: "An attendance register with a letter and colour for each day, and an export button",
    description: "Every check-in is verified on the server before it is recorded. Export registers and reports to Excel or PDF.",
  },
};

const FAQ_ITEMS = [
  {
    id: 1,
    question: "How does a check-in actually work?",
    answer:
      "A tablet at your entrance shows a QR code that refreshes every 15 seconds. Employees scan it with their phone camera or browser. ChecIN records the check-in, and scans again on the way out to record the check-out.",
  },
  {
    id: 2,
    question: "Can someone check in for a colleague with a screenshot?",
    answer:
      "No. The code changes every 15 seconds, so a photo or screenshot goes stale almost immediately. And only your paired tablet can produce a valid code for your entrance, so there is nothing to copy from anywhere else.",
  },
  {
    id: 3,
    question: "Do employees need to install an app?",
    answer:
      "There's nothing to find in an app store. ChecIN opens in any phone's mobile browser and can be added to the home screen as a Progressive Web App (PWA), so it sits right there like a native icon.",
  },
  {
    id: 4,
    question: "What hardware do we need?",
    answer:
      "One basic tablet at each entrance, mounted and plugged in. Setup takes about ten minutes: you enter a one-time pairing code from your dashboard, and the tablet takes it from there. Adding another office later just means pairing another tablet. If a tablet is lost or stolen, you simply revoke its secret from the dashboard.",
  },
  {
    id: 5,
    question: "Does ChecIN track where my people are?",
    answer:
      "No. ChecIN never asks for anyone's location. Presence is proven by scanning the code at your entrance, not by GPS.",
  },
  {
    id: 6,
    question: "What if the internet goes down?",
    answer:
      "Checking in needs a connection, because the server has to confirm the code is fresh. If a phone is offline, the check-in fails and says so. Nothing is saved for later. The tablet keeps trying to reconnect, and it hides a code that has gone stale.",
  },
  {
    id: 7,
    question: "What about people who work from home?",
    answer:
      "Employees can mark a day as work from home ahead of time. Managers see it, and it counts as present without a scan.",
  },
  {
    id: 8,
    question: "Is our data kept separate from other companies?",
    answer:
      "Yes. Each company's people and records are kept completely apart. A manager sees only their own team, and nobody can see another company's data.",
  },
];

function LandingPage() {
  const navigate = useNavigate();
  const [activeCap, setActiveCap] = useState<CapabilityKey>("attendance");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // The capability tabs move on by themselves until the person chooses one, and wait while they look.
  const [autoCap, setAutoCap] = useState(true);
  const [capPaused, setCapPaused] = useState(false);
  useScrollReveal();

  const advanceCap = () =>
    setActiveCap((current) => {
      const order: CapabilityKey[] = ["attendance", "leave", "announcements", "records"];
      return order[(order.indexOf(current) + 1) % order.length];
    });

  useEffect(() => {
    // If already signed in, provide convenient navigation
    const unsub = firebaseAuth.onAuthStateChanged((user) => {
      // Intentionally not auto-redirecting so user can still see the marketing page,
      // but if needed can navigate to dashboard
    });
    return () => unsub();
  }, [navigate]);

  const toggleFaq = (id: number) => {
    setOpenFaq((prev) => (prev === id ? null : id));
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#0E2322] font-sans antialiased selection:bg-[#C0FD9B] selection:text-[#0E2322]">
      {/* FLOATING HEADER */}
      <header className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-[1140px] h-[64px] sm:h-[68px] bg-white/95 backdrop-blur-md rounded-[20px] px-4 sm:px-6 flex items-center justify-between shadow-[0_4px_25px_rgba(0,0,0,0.06)] border border-[#EBEBEB]">
        <a href="#hero" className="flex items-center no-underline">
          <ChecInLogo size={28} textColor="#0E2322" markColor="#0E2322" />
        </a>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center space-x-7 text-[15px] font-medium text-[#0E2322]">
          <a href="#benefits" className="hover:opacity-70 transition">
            Benefits
          </a>
          <a href="#why" className="hover:opacity-70 transition">
            Why ChecIN
          </a>
          <a href="#capabilities" className="hover:opacity-70 transition">
            Capabilities
          </a>
          <a href="#pricing" className="hover:opacity-70 transition">
            Pricing
          </a>
          <a href="#faq" className="hover:opacity-70 transition">
            FAQ
          </a>
        </nav>

        {/* Right Action Buttons */}
        <div className="flex items-center space-x-2.5">
          <Link
            to="/auth"
            className="h-[43px] px-4 sm:px-5 rounded-[14px] border border-[#0E2322] text-[#0E2322] text-[13.5px] font-medium hover:bg-black/5 active:scale-95 transition inline-flex items-center justify-center no-underline"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            className="h-[43px] px-5 sm:px-6 rounded-[14px] bg-[#0E2322] text-white text-[13.5px] font-medium hover:bg-[#163331] active:scale-95 transition shadow-sm inline-flex items-center justify-center no-underline"
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* HERO SECTION */}
      <section
        id="hero"
        className="relative bg-[#0E2322] text-white pt-36 sm:pt-44 pb-0 px-4 sm:px-6 overflow-hidden text-center"
      >
        <div className="max-w-[1040px] mx-auto relative z-10">
          {/* Mint Pill Badge */}
          <div className="landing-rise landing-rise-1 inline-flex items-center px-4 py-1.5 rounded-[10px] border border-[#263F37] backdrop-blur-[2px] bg-transparent text-[#C0FD9B] text-[14px] mb-8 font-medium">
            Attendance you can trust
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl md:text-[76px] lg:text-[80px] font-medium tracking-[-0.04em] text-white leading-[1.0] text-center mb-6">
            <FocusText text="Attendance that proves people were actually there." />
          </h1>

          {/* Subheading */}
          <p className="landing-rise landing-rise-3 text-base sm:text-[18px] text-[#ADC4BD] max-w-[680px] mx-auto mb-10 leading-relaxed font-normal">
            ChecIN puts a QR code on a tablet at your entrance that changes every 15 seconds. Your team
            scans it with their phone to check in and out. No GPS to spoof, no screenshot to pass around,
            no timesheets to chase.
          </p>

          {/* CTA Buttons */}
          <div className="landing-rise landing-rise-4 flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-14">
            <Link
              to="/auth"
              className="w-full sm:w-auto h-[48px] px-7 rounded-[14px] bg-[#FFD153] text-[#122300] font-medium text-[15px] hover:brightness-105 active:scale-95 transition shadow-lg inline-flex items-center justify-center no-underline"
            >
              Start Free Trial
            </Link>
            <Link
              to="/kiosk"
              className="w-full sm:w-auto h-[48px] px-7 rounded-[14px] bg-[#263F37] text-white font-medium text-[15px] hover:bg-[#315248] active:scale-95 transition inline-flex items-center justify-center no-underline"
            >
              Launch Live Kiosk
            </Link>
          </div>

          {/* The manager dashboard, drawn from the real components with sample numbers */}
          <div
            role="img"
            aria-label="The ChecIN manager dashboard: how many people are in, late, away or absent today"
            className="landing-rise landing-rise-5 relative mx-auto max-w-[1126px] rounded-t-[20px] shadow-[0_-10px_50px_rgba(0,0,0,0.5)] overflow-hidden"
          >
            <img src="/images/product/dashboard.webp" alt="The ChecIN manager dashboard: people present, late, away and absent today, with who is late and who has not arrived" width={1600} height={875} loading="lazy" decoding="async" className="w-full h-auto block" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0E2322] to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* BENEFITS SECTION */}
      <section id="benefits" className="py-24 px-4 sm:px-6 max-w-7xl mx-auto">
        <div data-reveal className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-block text-sm text-[#0E2322] bg-[#E8FCE4] px-4 py-1.5 rounded-full mb-4 font-medium">
            Benefits
          </div>
          <h2 className="text-3xl sm:text-[42px] leading-[1.2] font-normal tracking-[-0.02em] text-[#0E2322] mb-4">
            Stop chasing timesheets.
          </h2>
          <p className="text-lg sm:text-[20px] text-[#6D6D6D] max-w-[686px] mx-auto leading-[1.4] font-normal">
            Stop reconciling timesheets at the end of the month. See who's in, right now.
          </p>
        </div>

        {/* 3 Full-Bleed Photograph Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
          {/* Card 1: 15 sec */}
          <div data-reveal="1" className="relative h-[530px] rounded-[24px] overflow-hidden shadow-lg group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0E2322] to-[#1F4A3F]" />
            <div className="absolute inset-x-0 top-[128px] flex justify-center px-4">
              <QrTablet compact onDark />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/5 p-8 flex flex-col justify-between text-white">
              <div>
                <div className="text-[54px] font-medium text-[#C0FD9B] tracking-tight leading-none mb-2">
                  <CountUp to={15} /> sec
                </div>
                <div className="text-[18px] text-white/90 font-normal">code expiration</div>
              </div>
              <div>
                <h3 className="text-[28px] font-normal tracking-[-0.02em] text-white mb-2 leading-tight">
                  A code that expires
                </h3>
                <p className="text-[18px] text-[#B3B3B3] leading-[1.4] font-normal">
                  Every code expires 15 seconds after it appears, so an old photo is worthless.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: One-tap check-in */}
          <div data-reveal="2" className="relative h-[530px] rounded-[24px] overflow-hidden shadow-lg group">
            <img
              src="/images/landing/checkin-phone.webp"
              alt="A woman in a white shirt checks her phone beside a large window"
              width={900}
              height={1350}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div
              aria-hidden
              className="absolute top-6 left-6 inline-flex items-center gap-2 rounded-full bg-[#CBEED3] px-3.5 py-1.5 text-sm font-semibold text-[#0E2322] shadow-lg"
            >
              <span className="size-2 rounded-full bg-emerald-600" />
              Checked in 08:12
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/5 p-8 flex flex-col justify-between text-white">
              <div />
              <div>
                <h3 className="text-[28px] font-normal tracking-[-0.02em] text-white mb-2 leading-tight">
                  One-tap check-in
                </h3>
                <p className="text-[18px] text-[#B3B3B3] leading-[1.4] font-normal">
                  Add ChecIN to your phone's home screen. Scan on the way in, scan on the way out. That's
                  the whole routine.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Live team view */}
          <div data-reveal="3" className="relative h-[530px] rounded-[24px] overflow-hidden shadow-lg group">
            <img
              src="/images/landing/team-lagos-office.webp"
              alt="A group of colleagues talking together in an office in Lagos"
              width={1400}
              height={934}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div
              aria-hidden
              className="absolute top-6 left-6 inline-flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-1.5 text-sm font-semibold text-[#0E2322] shadow-lg"
            >
              <span className="size-2 rounded-full bg-emerald-600 animate-pulse" />
              34 of 38 in
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/5 p-8 flex flex-col justify-between text-white">
              <div />
              <div>
                <h3 className="text-[28px] font-normal tracking-[-0.02em] text-white mb-2 leading-tight">
                  Live team view
                </h3>
                <p className="text-[18px] text-[#B3B3B3] leading-[1.4] font-normal">
                  Managers see who's in and who's out as scans happen, without asking around.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY CHECIN (Dual Tinted Bento Cards: Butter #FCF2CB & Soft Mint #CBEED3) */}
      <section id="why" className="py-24 bg-[#FAFAFA] border-y border-slate-100 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div data-reveal className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-block text-sm text-[#0E2322] bg-[#E8FCE4] px-4 py-1.5 rounded-full mb-4 font-medium">
              Why ChecIN
            </div>
            <h2 className="text-3xl sm:text-[42px] leading-[1.2] font-normal tracking-[-0.02em] text-[#0E2322] mb-4">
              Built so the door does the checking.
            </h2>
            <p className="text-lg sm:text-[20px] text-[#6D6D6D] max-w-[686px] mx-auto leading-[1.4] font-normal">
              Most attendance tools trust the employee's phone. ChecIN trusts the door.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Bento 1: Butter Card */}
            <div data-reveal="1" className="bg-[#FCF2CB] rounded-[32px] p-8 sm:p-10 flex flex-col justify-between border border-[#F5E6B0] shadow-sm">
              <div className="mb-8 rounded-2xl overflow-hidden shadow-lg border border-amber-200/60 bg-white">
                <div role="img" aria-label="The ChecIN entrance tablet showing its check-in code, with a fifteen second countdown" className="h-[280px] bg-gradient-to-br from-amber-50 to-white flex items-center justify-center gap-5 px-4">
                  <TabletScreen src="/images/product/kiosk-code.webp" imgWidth={640} imgHeight={640} className="w-[170px] sm:w-[220px]" />
                  <CountdownRing compact />
                </div>
              </div>
              <div>
                <h3 className="text-2xl sm:text-[28px] font-normal tracking-[-0.02em] text-[#0A0A0A] mb-3 leading-tight">
                  A code that expires
                </h3>
                <p className="text-[#6D6D6D] text-base sm:text-[18px] leading-[1.4] font-normal">
                  The QR changes every 15 seconds. A screenshot sent to a colleague is stale almost
                  immediately.
                </p>
              </div>
            </div>

            {/* Bento 2: Soft Mint Card */}
            <div data-reveal="2" className="bg-[#CBEED3] rounded-[32px] p-8 sm:p-10 flex flex-col justify-between border border-[#B2E2BD] shadow-sm">
              <div className="mb-8 rounded-2xl overflow-hidden shadow-lg border border-emerald-200/60 bg-white">
                <div role="img" aria-label="The ChecIN tablet setup screen taking a one-time pairing code, linking the tablet to one entrance and to your account" className="h-[280px] bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center">
                  <DoorPairing />
                </div>
              </div>
              <div>
                <h3 className="text-2xl sm:text-[28px] font-normal tracking-[-0.02em] text-[#0A0A0A] mb-3 leading-tight">
                  A tablet with a secret handshake
                </h3>
                <p className="text-[#6D6D6D] text-base sm:text-[18px] leading-[1.4] font-normal">
                  Each entrance tablet is paired once with your account. Nothing else can pretend to be that
                  door.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CAPABILITIES: Interactive Vertical Tabs + Preview Panel */}
      <section id="capabilities" className="py-24 px-4 sm:px-6 max-w-7xl mx-auto">
        <div data-reveal className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-block text-sm text-[#0E2322] bg-[#E8FCE4] px-4 py-1.5 rounded-full mb-4 font-medium">
            What's included
          </div>
          <h2 className="text-3xl sm:text-[42px] leading-[1.2] font-normal tracking-[-0.02em] text-[#0E2322] mb-4">
            Everything a growing team needs at the door.
          </h2>
          <p className="text-lg sm:text-[20px] text-[#6D6D6D] max-w-[686px] mx-auto leading-[1.4] font-normal">
            ChecIN brings real-time attendance, leave requests, announcements, and tamper-resistant
            records together at your entrance.
          </p>
        </div>

        <div
          data-reveal
          data-paused={capPaused}
          onMouseEnter={() => setCapPaused(true)}
          onMouseLeave={() => setCapPaused(false)}
          onFocus={() => setCapPaused(true)}
          onBlur={() => setCapPaused(false)}
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
        >
          {/* Left Vertical Tabs */}
          <div className="lg:col-span-5 space-y-3">
            {(
              [
                ["attendance", "Real-Time Attendance"],
                ["leave", "Leave & Absence Management"],
                ["announcements", "Announcements & Team Updates"],
                ["records", "Tamper-Resistant Records"],
              ] as const
            ).map(([key, label]) => {
              const isActive = activeCap === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setActiveCap(key);
                    setAutoCap(false);
                  }}
                  className={`relative overflow-hidden w-full text-left p-6 sm:p-7 rounded-[14px] text-xl sm:text-[24px] leading-[1.2] tracking-[-0.02em] flex items-center justify-between transition cursor-pointer ${
                    isActive
                      ? "bg-[#C0FD9B] text-[#0E2322] font-medium shadow-sm"
                      : "bg-[#F5F5F5] hover:bg-[#EBEBEB] text-[#0E2322] font-normal"
                  }`}
                >
                  <span>{label}</span>
                  <span className={`text-xl sm:text-[24px] ${isActive ? "text-[#0E2322]" : "text-[#0E2322]/60"}`}>
                    →
                  </span>
                  {isActive && autoCap && (
                    <span
                      key={key}
                      aria-hidden
                      onAnimationEnd={advanceCap}
                      className="landing-progress absolute left-0 bottom-0 h-1 bg-[#0E2322]/60"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Large Preview Card */}
          <div className="lg:col-span-7 bg-[#FFFDF5] border border-amber-200/50 rounded-[32px] p-6 sm:p-8 shadow-md">
            <div
              role="img"
              aria-label={CAPABILITY_DATA[activeCap].alt}
              className="rounded-2xl overflow-hidden shadow-2xl border border-slate-200/80 h-[360px] sm:h-[455px]"
            >
              {(() => {
                const Visual = CAPABILITY_DATA[activeCap].Visual;
                return <Visual />;
              })()}
            </div>
            <p className="mt-4 text-sm sm:text-base text-[#6D6D6D] font-medium">
              {CAPABILITY_DATA[activeCap].description}
            </p>
          </div>
        </div>
      </section>

      {/* WHO IT IS FOR: photo strip and role cards */}
      <section id="teams" className="py-24 bg-[#FAFAFA] border-y border-slate-100 px-4 sm:px-6 text-center">
        <div className="max-w-4xl mx-auto mb-16">
          <div className="inline-block text-sm text-[#0E2322] bg-[#E8FCE4] px-4 py-1.5 rounded-full mb-4 font-medium">
            Who it's for
          </div>
          <h2 className="text-3xl sm:text-[42px] leading-[1.2] font-normal tracking-[-0.02em] text-[#0E2322] mb-4">
            Everyone sees their part,<br className="hidden sm:inline" /> and only their part.
          </h2>
          <p className="text-lg sm:text-[20px] text-[#6D6D6D] max-w-[686px] mx-auto leading-[1.4] font-normal">
            Owners see the whole organization, managers see their own team, and employees see their own record.
          </p>
        </div>

        <div data-reveal className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[
            {
              src: "/images/landing/team-laptop.webp",
              alt: "Four women in colourful outfits gathered around a laptop",
              label: "Office teams",
              width: 1400,
              height: 934,
              position: "object-center",
            },
            {
              src: "/images/landing/health-nurses.webp",
              alt: "Four nurses in matching blue uniforms and white headscarves",
              label: "Clinics and hospitals",
              width: 900,
              height: 1164,
              position: "object-[50%_25%]",
            },
            {
              src: "/images/landing/manager-tablet.webp",
              alt: "A smiling man holds a tablet in one hand and a phone to his ear",
              label: "Managers on the move",
              width: 1400,
              height: 934,
              position: "object-center",
            },
          ].map((tile) => (
            <figure key={tile.label} className="relative h-[260px] sm:h-[300px] rounded-3xl overflow-hidden shadow-lg">
              <img
                src={tile.src}
                alt={tile.alt}
                width={tile.width}
                height={tile.height}
                loading="lazy"
                decoding="async"
                className={`absolute inset-0 w-full h-full object-cover ${tile.position}`}
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 pb-4 pt-12 text-left text-white text-lg font-medium tracking-[-0.01em]">
                {tile.label}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="max-w-4xl mx-auto relative px-4 py-8">
          {/* Who it is for: one card per role, saying what that role gets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
            {ROLE_CARDS.map(({ role, line, Icon }, i) => (
              <div
                key={role}
                data-reveal={String((i % 3) + 1)}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-full bg-[#CBEED3] text-[#0E2322]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-xl font-medium tracking-[-0.02em] text-[#0E2322]">{role}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-[#6D6D6D]">{line}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING SECTION: Monthly / Yearly Toggle & 3 Cards */}
      <section id="pricing" className="py-24 px-4 sm:px-6 max-w-7xl mx-auto">
        <div data-reveal className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-block text-sm text-[#0E2322] bg-[#E8FCE4] px-4 py-1.5 rounded-full mb-4 font-medium">
            Pricing
          </div>
          <h2 className="text-3xl sm:text-[42px] leading-[1.2] font-normal tracking-[-0.02em] text-[#0E2322] mb-4">
            Simple Pricing That Scales With You
          </h2>
          <p className="text-lg sm:text-[20px] text-[#6D6D6D] max-w-[686px] mx-auto leading-[1.4] font-normal mb-8">
            Transparent per-employee pricing: implementation, integrations, and compliance packs included.
          </p>

          {/* Monthly / Yearly Switcher */}
          <div className="inline-flex items-center bg-slate-100 p-1.5 rounded-full border border-slate-200">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-6 py-2 rounded-full text-base sm:text-[18px] font-medium tracking-[-0.15px] transition cursor-pointer ${
                billingCycle === "monthly"
                  ? "bg-white text-[#0E2322] shadow-sm"
                  : "text-[#6D6D6D] hover:text-[#0E2322]"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={`px-6 py-2 rounded-full text-base sm:text-[18px] font-medium tracking-[-0.15px] flex items-center space-x-1.5 transition cursor-pointer ${
                billingCycle === "yearly"
                  ? "bg-white text-[#0E2322] shadow-sm"
                  : "text-[#6D6D6D] hover:text-[#0E2322]"
              }`}
            >
              <span>Yearly</span>
              <span className="bg-[#FFD153] text-[#122300] text-[12px] px-2 py-0.5 rounded-full font-bold ml-1">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {/* Starter Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-[32px] p-8 sm:p-10 flex flex-col justify-between shadow-sm">
            <div>
              <h3 className="text-2xl sm:text-[28px] font-normal tracking-[-0.02em] text-[#0E2322] mb-2">
                Starter
              </h3>
              <p className="text-base sm:text-[20px] text-[#6D6D6D] leading-[1.3] mb-6 font-normal">
                For small teams getting attendance under control.
              </p>
              <div className="flex items-baseline mb-4">
                <span className="text-5xl sm:text-[58px] font-medium tracking-tight text-[#0E2322]">$0</span>
                <span className="text-base sm:text-[20px] text-[#6D6D6D] ml-2 font-normal">
                  /User/Month
                </span>
              </div>
              <p className="text-xs sm:text-[14px] font-normal text-[#6D6D6D] bg-slate-100 px-3 py-1.5 rounded-md mb-8 inline-block">
                Free Up To 15 Employees
              </p>
              <ul className="space-y-4 text-base sm:text-[16px] text-[#6D6D6D] font-normal">
                <li className="flex items-center">
                  <span className="text-emerald-700 font-bold mr-3 text-lg">✓</span> Time Clock & Timesheets
                </li>
                <li className="flex items-center">
                  <span className="text-emerald-700 font-bold mr-3 text-lg">✓</span> Leave Requests & Balances
                </li>
                <li className="flex items-center">
                  <span className="text-emerald-700 font-bold mr-3 text-lg">✓</span> 1 Location · Basic Reports
                </li>
                <li className="flex items-center">
                  <span className="text-emerald-700 font-bold mr-3 text-lg">✓</span> Email Support
                </li>
              </ul>
            </div>
            <Link
              to="/auth"
              className="w-full mt-10 py-3.5 rounded-full bg-[#C0FD9B] hover:opacity-90 text-[#122300] font-medium text-base sm:text-[16px] transition text-center inline-block no-underline"
            >
              Get Started Free
            </Link>
          </div>

          {/* Growth Card (Featured Dark Card) */}
          <div className="bg-[#0E2322] text-white border-2 border-[#C0FD9B]/40 rounded-[32px] p-8 sm:p-10 flex flex-col justify-between shadow-2xl relative">
            <div>
              <h3 className="text-2xl sm:text-[28px] font-normal tracking-[-0.02em] text-[#C0FD9B] mb-2">
                Growth
              </h3>
              <p className="text-base sm:text-[20px] text-[#ADC4BD] leading-[1.3] mb-6 font-normal">
                For scaling companies with managers and multiple shifts.
              </p>
              <div className="flex items-baseline mb-4">
                <span className="text-5xl sm:text-[58px] font-medium tracking-tight text-white">
                  {billingCycle === "yearly" ? "$6.40" : "$8"}
                </span>
                <span className="text-base sm:text-[20px] text-[#ADC4BD] ml-2 font-normal">
                  /User/Month
                </span>
              </div>
              <p className="text-xs sm:text-[14px] font-normal text-[#ADC4BD] bg-white/10 px-3 py-1.5 rounded-md mb-8 inline-block">
                {billingCycle === "yearly"
                  ? "Billed Annually · Save 20%"
                  : "Billed Monthly · Flexible Cancellation"}
              </p>
              <ul className="space-y-4 text-base sm:text-[16px] text-white/90 font-normal">
                <li className="flex items-center">
                  <span className="text-[#C0FD9B] font-bold mr-3 text-lg">✓</span> Everything In Starter
                </li>
                <li className="flex items-center">
                  <span className="text-[#C0FD9B] font-bold mr-3 text-lg">✓</span> Kiosk Rotating QR Handshake
                </li>
                <li className="flex items-center">
                  <span className="text-[#C0FD9B] font-bold mr-3 text-lg">✓</span> Multi-Manager Workgroups
                </li>
                <li className="flex items-center">
                  <span className="text-[#C0FD9B] font-bold mr-3 text-lg">✓</span> Leave Approval Workflows
                </li>
                <li className="flex items-center">
                  <span className="text-[#C0FD9B] font-bold mr-3 text-lg">✓</span> Unlimited Locations & Exports
                </li>
              </ul>
            </div>
            <Link
              to="/auth"
              className="w-full mt-10 py-3.5 rounded-full bg-[#FFD153] hover:brightness-105 text-[#122300] font-medium text-base sm:text-[16px] transition shadow-lg text-center inline-block no-underline"
            >
              Start 14-Day Trial
            </Link>
          </div>

          {/* Enterprise Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-[32px] p-8 sm:p-10 flex flex-col justify-between shadow-sm">
            <div>
              <h3 className="text-2xl sm:text-[28px] font-normal tracking-[-0.02em] text-[#0E2322] mb-2">
                Enterprise
              </h3>
              <p className="text-base sm:text-[20px] text-[#6D6D6D] leading-[1.3] mb-6 font-normal">
                For 1,000+ employees across regional offices.
              </p>
              <div className="flex items-baseline mb-4">
                <span className="text-5xl sm:text-[58px] font-medium tracking-tight text-[#0E2322]">
                  Custom
                </span>
              </div>
              <p className="text-xs sm:text-[14px] font-normal text-[#6D6D6D] bg-slate-100 px-3 py-1.5 rounded-md mb-8 inline-block">
                Volume Pricing & SLA Guarantee
              </p>
              <ul className="space-y-4 text-base sm:text-[16px] text-[#6D6D6D] font-normal">
                <li className="flex items-center">
                  <span className="text-emerald-700 font-bold mr-3 text-lg">✓</span> Everything In Growth
                </li>
                <li className="flex items-center">
                  <span className="text-emerald-700 font-bold mr-3 text-lg">✓</span> SSO, SCIM & Audit Logs
                </li>
                <li className="flex items-center">
                  <span className="text-emerald-700 font-bold mr-3 text-lg">✓</span> Payroll & HRIS Integration
                </li>
                <li className="flex items-center">
                  <span className="text-emerald-700 font-bold mr-3 text-lg">✓</span> Statutory Compliance Per Region
                </li>
                <li className="flex items-center">
                  <span className="text-emerald-700 font-bold mr-3 text-lg">✓</span> Dedicated Account Manager
                </li>
              </ul>
            </div>
            <a
              href="mailto:support@checin.com?subject=Enterprise%20Inquiry"
              className="w-full mt-10 py-3.5 rounded-full bg-[#C0FD9B] hover:opacity-90 text-[#122300] font-medium text-base sm:text-[16px] transition text-center inline-block no-underline"
            >
              Contact Enterprise
            </a>
          </div>
        </div>
      </section>

      {/* CUSTOMER STORIES */}
      <section id="stories" className="py-24 bg-[#FAFAFA] border-t border-slate-100 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div data-reveal className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-block text-sm text-[#0E2322] bg-[#E8FCE4] px-4 py-1.5 rounded-full mb-4 font-medium">
              Customer stories
            </div>
            <h2 className="text-3xl sm:text-[42px] leading-[1.2] font-normal tracking-[-0.02em] text-[#0E2322] mb-4">
              Be one of our first teams.
            </h2>
            <p className="text-lg sm:text-[20px] text-[#6D6D6D] max-w-[686px] mx-auto leading-[1.4] font-normal">
              We're onboarding a first group of pilot teams. Their stories will appear here once they have
              something real to say.
            </p>
          </div>

          <div className="max-w-2xl mx-auto bg-white rounded-[28px] p-8 sm:p-12 border border-slate-200/80 shadow-sm text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#E8FCE4] flex items-center justify-center text-[#0E2322]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <p className="text-base sm:text-[20px] text-[#0E2322] leading-[1.4] font-medium tracking-[-0.02em] mb-2">
              Pilot Cohort In Progress
            </p>
            <p className="text-sm sm:text-[16px] text-[#6D6D6D] leading-[1.4] font-normal">
              Want to pilot ChecIN with your workforce?{" "}
              <Link to="/auth" className="font-medium text-[#0E2322] underline underline-offset-4">
                Create an account to join the pilot.
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* FAQ ACCORDION */}
      <section id="faq" className="py-24 px-4 sm:px-6 max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-[42px] leading-[1.2] font-normal tracking-[-0.02em] text-[#0E2322]">
            Questions, answered.
          </h2>
          <p className="text-lg sm:text-[20px] text-[#6D6D6D] max-w-[686px] mx-auto mt-4 leading-[1.4] font-normal">
            The things people ask before they put a tablet on the wall.
          </p>
        </div>

        <div className="space-y-2">
          {FAQ_ITEMS.map((item) => {
            const isOpen = openFaq === item.id;
            return (
              <div key={item.id} className="border-b border-slate-200/80 py-5">
                <button
                  onClick={() => toggleFaq(item.id)}
                  className="w-full flex justify-between items-center text-left py-2 font-normal text-xl sm:text-[24px] leading-snug tracking-[-0.02em] text-[#0E2322] group cursor-pointer"
                >
                  <span className="group-hover:text-emerald-800 transition">{item.question}</span>
                  <span
                    className={`text-2xl text-[#0E2322] transition-transform duration-300 inline-block font-light ${
                      isOpen ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
                {isOpen && (
                  <div className="text-base sm:text-[18px] text-[#6D6D6D] pt-3 pb-2 leading-[1.5] font-normal animate-in fade-in duration-200">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* DARK FOOTER */}
      <footer className="bg-[#0E2322] text-white py-20 px-4 sm:px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between gap-12">
          <div>
            <div className="flex items-center mb-4">
              <ChecInLogo size={28} textColor="#FFFFFF" markColor="#C0FD9B" />
            </div>
            <p className="text-[16px] text-white/60 max-w-sm leading-relaxed font-normal">
              Attendance you can trust, one scan at a time.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-10">
            <div>
              <h4 className="font-medium text-[#C0FD9B] mb-4 uppercase tracking-[0.86px] text-[14px]">
                Product
              </h4>
              <ul className="space-y-3 text-[16px] text-white/70">
                <li>
                  <a href="#benefits" className="hover:text-white transition">
                    Benefits
                  </a>
                </li>
                <li>
                  <a href="#why" className="hover:text-white transition">
                    Why ChecIN
                  </a>
                </li>
                <li>
                  <a href="#capabilities" className="hover:text-white transition">
                    Capabilities
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-white transition">
                    Pricing
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-[#C0FD9B] mb-4 uppercase tracking-[0.86px] text-[14px]">
                Legal
              </h4>
              <ul className="space-y-3 text-[16px] text-white/70">
                <li>
                  <Link to="/privacy" className="hover:text-white transition">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-white transition">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-[#C0FD9B] mb-4 uppercase tracking-[0.86px] text-[14px]">
                Access
              </h4>
              <ul className="space-y-3 text-[16px] text-white/70">
                <li>
                  <Link to="/kiosk" className="hover:text-white transition">
                    Entrance Tablet (Kiosk)
                  </Link>
                </li>
                <li>
                  <Link to="/scan" className="hover:text-white transition">
                    Mobile Scanner (PWA)
                  </Link>
                </li>
                <li>
                  <Link to="/auth" className="hover:text-white transition">
                    Manager Portal
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between text-[14px] text-white/40">
          <div>© {new Date().getFullYear()} ChecIN Technologies Inc. All rights reserved.</div>
          <div className="mt-2 sm:mt-0">No GPS. No app store. Just the door.</div>
        </div>
      </footer>
    </div>
  );
}
