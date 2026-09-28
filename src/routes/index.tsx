import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { firebaseAuth } from "@/integrations/firebase/config";
import { ChecInLogo } from "@/components/ChecInLogo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ChecIN — Modern Attendance That Proves People Were Actually There" },
      {
        name: "description",
        content:
          "ChecIN puts a rotating 15-second QR code on a tablet at your entrance. Employees scan with their mobile browser to check in and out. No GPS spoofing, no screenshot sharing.",
      },
      { property: "og:title", content: "ChecIN — Modern Workforce Check-In & Timesheet SaaS" },
      {
        property: "og:description",
        content:
          "Tamper-resistant physical entrance check-in with dynamic rotating QR codes. No app store install required.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "ChecIN — Modern Attendance SaaS" },
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
  { title: string; image: string; alt: string; description: string }
> = {
  attendance: {
    title: "Real-Time Attendance",
    image: "https://framerusercontent.com/images/PdCbUkepQPMwsqLNqnMFOhMlk.jpg",
    alt: "Workforce Visibility Interface",
    description: "Live live attendance tracking showing clock-ins, verified doors, and real-time status.",
  },
  leave: {
    title: "Leave & Absence Management",
    image: "https://framerusercontent.com/images/rDrThS7T8gy6JcC143xhaX5D5w4.png",
    alt: "Leave requests and approvals view",
    description: "Streamlined leave requests, balance tracking, and team manager approvals.",
  },
  announcements: {
    title: "Announcements & Team Updates",
    image: "https://framerusercontent.com/images/JhkDQnOZHJUfSwC2jfLzLjxrjI.jpg",
    alt: "Team updates and notifications",
    description: "Keep whole teams informed with broadcast company updates and push notifications.",
  },
  records: {
    title: "Tamper-Resistant Records",
    image: "https://framerusercontent.com/images/PZhh8usK41VfjRZFlBmcldnrNo.jpg",
    alt: "Audit logs and verified records",
    description: "Cryptographically verified presence logs, automated timesheets, and exportable reports.",
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
      "The code changes every 15 seconds, so a photo or screenshot goes stale almost immediately. The tablet is also the only device with the physical device secret capable of generating valid tokens for your entrance.",
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
    question: "Is our data kept separate from other companies?",
    answer:
      "Yes. ChecIN enforces a strict multi-tenant boundary with Firebase custom claims and default-deny database rules. Every company's people and records are completely isolated.",
  },
];

function LandingPage() {
  const navigate = useNavigate();
  const [activeCap, setActiveCap] = useState<CapabilityKey>("attendance");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
      {/* FLOATING HEADER (Exact 1:1 from preview.html) */}
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

      {/* HERO SECTION (Exact 1:1 Dark Forest Background & Typography) */}
      <section
        id="hero"
        className="relative bg-[#0E2322] text-white pt-36 sm:pt-44 pb-0 px-4 sm:px-6 overflow-hidden text-center"
      >
        <div className="max-w-[1040px] mx-auto relative z-10">
          {/* Mint Pill Badge */}
          <div className="inline-flex items-center px-4 py-1.5 rounded-[10px] border border-[#263F37] backdrop-blur-[2px] bg-transparent text-[#C0FD9B] text-[14px] mb-8 font-medium">
            Attendance you can trust
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl md:text-[76px] lg:text-[80px] font-medium tracking-[-0.04em] text-white leading-[1.0] text-center mb-6">
            Attendance that proves people were actually there.
          </h1>

          {/* Subheading */}
          <p className="text-base sm:text-[18px] text-[#ADC4BD] max-w-[680px] mx-auto mb-10 leading-relaxed font-normal">
            ChecIN puts a QR code on a tablet at your entrance that changes every 15 seconds. Your team
            scans it with their phone to check in and out. No GPS to spoof, no screenshot to pass around,
            no timesheets to chase.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-14">
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

          {/* Framer Hero Dashboard Mockup */}
          <div className="relative mx-auto max-w-[1126px] rounded-t-[20px] shadow-[0_-10px_50px_rgba(0,0,0,0.5)] overflow-hidden">
            <img
              src="https://framerusercontent.com/images/7EKiDY1Dnw1gb2S7E1Mej2ws.svg"
              alt="ChecIN entrance tablet showing a rotating QR code, with an employee's phone scanning it"
              className="w-full rounded-t-[20px] object-cover"
              loading="eager"
            />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0E2322] to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* BENEFITS SECTION: Less Chasing. More Clarity. */}
      <section id="benefits" className="py-24 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-block text-sm text-[#0E2322] bg-[#E8FCE4] px-4 py-1.5 rounded-full mb-4 font-medium">
            Benefits
          </div>
          <h2 className="text-3xl sm:text-[42px] leading-[1.2] font-normal tracking-[-0.02em] text-[#0E2322] mb-4">
            Less Chasing. More Clarity.
          </h2>
          <p className="text-lg sm:text-[20px] text-[#6D6D6D] max-w-[686px] mx-auto leading-[1.4] font-normal">
            Stop reconciling timesheets at the end of the month. See who's in, right now.
          </p>
        </div>

        {/* 3 Full-Bleed Photograph Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
          {/* Card 1: 15 sec */}
          <div className="relative h-[530px] rounded-[24px] overflow-hidden shadow-lg group">
            <img
              src="https://framerusercontent.com/images/VU1SuO5yfzG9ySp7MMgBg8MFlbY.jpg"
              alt="Every code expires in 15 seconds"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/25 p-8 flex flex-col justify-between text-white">
              <div>
                <div className="text-[54px] font-medium text-[#C0FD9B] tracking-tight leading-none mb-2">
                  15 sec
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
          <div className="relative h-[530px] rounded-[24px] overflow-hidden shadow-lg group">
            <img
              src="https://framerusercontent.com/images/ao2qDHyGSusoHRHkHOoT4ADGOVs.jpg"
              alt="One-tap check-in"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/25 p-8 flex flex-col justify-between text-white">
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
          <div className="relative h-[530px] rounded-[24px] overflow-hidden shadow-lg group">
            <img
              src="https://framerusercontent.com/images/98puRycJIIGDcH3mYEiwoeSPqk8.jpg"
              alt="Live team view"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/25 p-8 flex flex-col justify-between text-white">
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
          <div className="text-center max-w-3xl mx-auto mb-16">
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
            <div className="bg-[#FCF2CB] rounded-[32px] p-8 sm:p-10 flex flex-col justify-between border border-[#F5E6B0] shadow-sm">
              <div className="mb-8 rounded-2xl overflow-hidden shadow-lg border border-amber-200/60 bg-white">
                <img
                  src="https://framerusercontent.com/images/rDrThS7T8gy6JcC143xhaX5D5w4.png"
                  alt="A code that expires UI"
                  className="w-full object-cover"
                />
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
            <div className="bg-[#CBEED3] rounded-[32px] p-8 sm:p-10 flex flex-col justify-between border border-[#B2E2BD] shadow-sm">
              <div className="mb-8 rounded-2xl overflow-hidden shadow-lg border border-emerald-200/60 bg-white">
                <img
                  src="https://framerusercontent.com/images/JhkDQnOZHJUfSwC2jfLzLjxrjI.jpg"
                  alt="A tablet with a secret handshake UI"
                  className="w-full object-cover"
                />
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

      {/* CORE CAPABILITIES: Interactive Vertical Tabs + Embedded Dashboard Screen */}
      <section id="capabilities" className="py-24 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-block text-sm text-[#0E2322] bg-[#E8FCE4] px-4 py-1.5 rounded-full mb-4 font-medium">
            Core Capabilities
          </div>
          <h2 className="text-3xl sm:text-[42px] leading-[1.2] font-normal tracking-[-0.02em] text-[#0E2322] mb-4">
            Everything a growing team needs at the door.
          </h2>
          <p className="text-lg sm:text-[20px] text-[#6D6D6D] max-w-[686px] mx-auto leading-[1.4] font-normal">
            ChecIN brings real-time attendance, leave requests, announcements, and tamper-resistant
            records together at your entrance.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
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
                  onClick={() => setActiveCap(key)}
                  className={`w-full text-left p-6 sm:p-7 rounded-[14px] text-xl sm:text-[24px] leading-[1.2] tracking-[-0.02em] flex items-center justify-between transition cursor-pointer ${
                    isActive
                      ? "bg-[#C0FD9B] text-[#0E2322] font-medium shadow-sm"
                      : "bg-[#F5F5F5] hover:bg-[#EBEBEB] text-[#0E2322] font-normal"
                  }`}
                >
                  <span>{label}</span>
                  <span className={`text-xl sm:text-[24px] ${isActive ? "text-[#0E2322]" : "text-[#0E2322]/60"}`}>
                    →
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Large Preview Card */}
          <div className="lg:col-span-7 bg-[#FFFDF5] border border-amber-200/50 rounded-[32px] p-6 sm:p-8 shadow-md">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-slate-200/80">
              <img
                src={CAPABILITY_DATA[activeCap].image}
                alt={CAPABILITY_DATA[activeCap].alt}
                className="w-full object-cover transition-opacity duration-300"
              />
            </div>
            <p className="mt-4 text-sm sm:text-base text-[#6D6D6D] font-medium">
              {CAPABILITY_DATA[activeCap].description}
            </p>
          </div>
        </div>
      </section>

      {/* BUILT FOR EVERY TEAM: Laptop Ecosystem Frame */}
      <section id="teams" className="py-24 bg-[#FAFAFA] border-y border-slate-100 px-4 sm:px-6 text-center">
        <div className="max-w-4xl mx-auto mb-16">
          <div className="inline-block text-sm text-[#0E2322] bg-[#E8FCE4] px-4 py-1.5 rounded-full mb-4 font-medium">
            Built For Every Team
          </div>
          <h2 className="text-3xl sm:text-[42px] leading-[1.2] font-normal tracking-[-0.02em] text-[#0E2322] mb-4">
            One Platform For Everyone<br className="hidden sm:inline" /> Behind Attendance.
          </h2>
          <p className="text-lg sm:text-[20px] text-[#6D6D6D] max-w-[686px] mx-auto leading-[1.4] font-normal">
            Whether you run one office or a handful, ChecIN fits the way your team already works.
          </p>
        </div>

        <div className="max-w-4xl mx-auto relative px-4 py-8">
          <div className="rounded-3xl border border-slate-200 shadow-2xl overflow-hidden bg-white p-2">
            <img
              src="https://framerusercontent.com/images/PZhh8usK41VfjRZFlBmcldnrNo.jpg"
              alt="ChecIN Desktop Mockup"
              className="w-full rounded-2xl"
            />
          </div>

          {/* Floating Team Chips */}
          <div className="flex flex-wrap items-center justify-center gap-3.5 mt-8">
            {[
              { label: "Owners & HR", color: "bg-emerald-500" },
              { label: "Team Managers", color: "bg-amber-500" },
              { label: "Employees", color: "bg-blue-500" },
              { label: "Operations", color: "bg-purple-500" },
              { label: "Finance", color: "bg-teal-500" },
              { label: "Leadership", color: "bg-indigo-500" },
            ].map((chip) => (
              <span
                key={chip.label}
                className="bg-white border border-slate-200 shadow-sm px-5 py-2 rounded-full text-[16px] font-normal tracking-[-0.02em] text-[#0A0A0A] flex items-center"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${chip.color} mr-2.5`} />
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING SECTION: Monthly / Yearly Toggle & 3 Cards */}
      <section id="pricing" className="py-24 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-14">
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

      {/* CUSTOMER STORIES (Exact 1:1 Layout) */}
      <section id="stories" className="py-24 bg-[#FAFAFA] border-t border-slate-100 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-block text-sm text-[#0E2322] bg-[#E8FCE4] px-4 py-1.5 rounded-full mb-4 font-medium">
              Customer stories
            </div>
            <h2 className="text-3xl sm:text-[42px] leading-[1.2] font-normal tracking-[-0.02em] text-[#0E2322] mb-4">
              Real Teams. Verified Attendance.
            </h2>
            <p className="text-lg sm:text-[20px] text-[#6D6D6D] max-w-[686px] mx-auto leading-[1.4] font-normal">
              Coming soon. We're onboarding our first cohort of corporate pilot teams, and their stories
              will appear here.
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
              Want to pilot ChecIN with your workforce? Get in touch to join our launch program.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ ACCORDION (Exact 1:1 Layout & Transitions) */}
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

      {/* DARK FOOTER (Exact 1:1 from preview.html) */}
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
                <li>
                  <a href="#faq" className="hover:text-white transition">
                    Security Architecture
                  </a>
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
          <div className="mt-2 sm:mt-0">Modern Attendance For Modern Teams</div>
        </div>
      </footer>
    </div>
  );
}
