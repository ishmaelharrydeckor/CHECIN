import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { signInWithPopup, signInWithCustomToken } from "firebase/auth";
import {
  firebaseAuth,
  onAuthStateChanged,
  googleProvider,
  syncUserToFirestore,
} from "@/integrations/firebase/config";
import { refreshUserClaims } from "@/lib/auth-claims";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Building2, ShieldCheck, Check, Sparkles, Mail, Lock } from "lucide-react";
import { ChecInLogo } from "@/components/ChecInLogo";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign In & Register — ChecIN" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "register">("signin");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Registration Form
  const [orgName, setOrgName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [timezone, setTimezone] = useState(
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC",
  );

  // Direct Login Form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        setCurrentUserEmail(user.email ?? null);
        try {
          const res = await user.getIdTokenResult();
          const role = res.claims.role as string | undefined;
          if (role === "employee") {
            navigate({ to: "/scan" });
          } else if (role === "org_admin" || role === "manager") {
            navigate({ to: "/dashboard" });
          }
        } catch {
          // Stay on auth page
        }
      } else {
        setCurrentUserEmail(null);
      }
    });
    return () => unsub();
  }, [navigate]);

  // 1-Click Instant Demo Manager Login
  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      const res = await fetch("/api/auth/demo-login", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.customToken) {
        throw new Error(data?.error || "Failed to create demo session");
      }

      await signInWithCustomToken(firebaseAuth, data.customToken);
      await refreshUserClaims();
      toast.success("Signed in as Demo Organization Administrator!");
      navigate({ to: "/dashboard" });
    } catch (err: unknown) {
      console.error("Demo login error:", err);
      const errorObj = err as { message?: string };
      toast.error(errorObj?.message || "Demo login failed");
    } finally {
      setDemoLoading(false);
    }
  };

  // Google OAuth Sign In
  const handleSignInGoogle = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      await syncUserToFirestore(result.user);
      const tokenResult = await result.user.getIdTokenResult(true);
      await refreshUserClaims();

      const role = tokenResult.claims.role as string | undefined;
      const orgId = tokenResult.claims.orgId as string | undefined;

      if (!orgId || !role) {
        setCurrentUserEmail(result.user.email);
        toast.info(
          "Signed in with Google! Now enter your company name below to complete registration.",
        );
        setTab("register");
        return;
      }

      toast.success(`Welcome back, ${result.user.displayName || "User"}!`);
      if (role === "employee") {
        navigate({ to: "/scan" });
      } else {
        navigate({ to: "/dashboard" });
      }
    } catch (err: unknown) {
      console.error("Sign-in error:", err);
      const errorObj = err as { code?: string; message?: string };
      if (errorObj?.code === "auth/operation-not-allowed") {
        toast.error(
          "Google Sign-In is not enabled in your Firebase Console yet. Please use Email Sign-In below or click 1-Click Demo Login.",
          { duration: 6000 },
        );
      } else if (errorObj?.code === "auth/popup-closed-by-user") {
        toast.info("Sign-in popup was closed.");
      } else if (errorObj?.code === "auth/popup-blocked") {
        toast.error("Sign-in popup was blocked by your browser. Please allow popups or use email.");
      } else {
        toast.error(errorObj?.message || "Failed to sign in with Google.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Direct Email & Password Login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.customToken) {
        throw new Error(data?.error || "Could not sign in with this email");
      }

      await signInWithCustomToken(firebaseAuth, data.customToken);
      await refreshUserClaims();
      toast.success(`Welcome back, ${data.displayName || "User"}!`);
      navigate({ to: "/dashboard" });
    } catch (err: unknown) {
      console.error("Email login error:", err);
      const errorObj = err as { message?: string };
      toast.error(errorObj?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  // Company / Organization Registration
  const handleRegisterOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || orgName.trim().length < 2) {
      toast.error("Please enter a valid company name (at least 2 characters).");
      return;
    }

    setLoading(true);
    try {
      const user = firebaseAuth.currentUser;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      let body: Record<string, string> = {
        orgName: orgName.trim(),
        timezone,
      };

      if (user) {
        const idToken = await user.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      } else {
        if (!regEmail.trim() || !regEmail.includes("@")) {
          toast.error("Please provide your work email address.");
          setLoading(false);
          return;
        }
        body.email = regEmail.trim();
        body.password = regPassword;
      }

      const res = await fetch("/api/auth/register-org", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Could not register organization");
      }

      if (data.customToken) {
        await signInWithCustomToken(firebaseAuth, data.customToken);
      } else if (user) {
        await user.getIdToken(true);
      }

      await refreshUserClaims();
      toast.success(`Organization "${data.orgName}" registered successfully!`);
      navigate({ to: "/dashboard" });
    } catch (err: unknown) {
      console.error("Registration error:", err);
      const errorObj = err as { message?: string };
      toast.error(errorObj?.message || "Failed to register organization.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen grid lg:grid-cols-2 bg-[#FDFBF7] font-sans">
      {/* Left branding column */}
      <div className="hidden lg:flex relative flex-col justify-between p-12 text-white bg-[#0E2322] overflow-hidden border-r border-[#1E3A38]">
        <div className="relative z-10 flex items-center justify-between">
          <Link to="/" className="no-underline">
            <ChecInLogo size={32} textColor="#FFFFFF" markColor="#C0FD9B" />
          </Link>
          <Link to="/">
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/5 hover:bg-white/10 text-white"
            >
              <ArrowLeft className="size-4 mr-1.5" />
              Back to site
            </Button>
          </Link>
        </div>

        <div className="relative z-10 my-auto max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#263F37] border border-[#3A5B51] px-4 py-1.5 text-xs font-medium text-[#C0FD9B]">
            <span className="h-2 w-2 rounded-full bg-[#C0FD9B] animate-pulse" />
            Zero GPS Spoofing · Tamper-Resistant
          </div>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-[1.1] text-white">
            Attendance that proves people were actually there.
          </h1>
          <p className="text-[#ADC4BD] text-base leading-relaxed">
            One 15-second rotating QR code at your entrance tablet. One tap on your employee's phone.
            No timesheets to chase, no proxy check-ins.
          </p>

          <div className="pt-4 space-y-3">
            {[
              "Physical entrance presence guaranteed via rotating QR tokens",
              "Works directly in any mobile browser (installable PWA)",
              "Multi-tenant company isolation with live attendance feed",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-sm text-[#ADC4BD]">
                <div className="size-5 rounded-full bg-[#C0FD9B]/20 text-[#C0FD9B] flex items-center justify-center shrink-0">
                  <Check className="size-3" />
                </div>
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-xs text-white/50">
          © {new Date().getFullYear()} ChecIN Technologies Inc. · All rights reserved.
        </div>
      </div>

      {/* Right form column */}
      <div className="relative flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile top bar */}
          <div className="lg:hidden flex items-center justify-between pb-4 border-b border-slate-200">
            <Link to="/" className="no-underline">
              <ChecInLogo size={28} />
            </Link>
            <Link to="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="size-4 mr-1" />
                Back
              </Button>
            </Link>
          </div>

          {/* 1-Click Demo Shortcut Banner */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#0E2322] to-[#1C3B38] text-white shadow-sm border border-[#2B4B48] flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#C0FD9B]">
                <Sparkles className="size-3.5" /> 8:00 AM Presentation Mode
              </div>
              <p className="text-[11px] text-white/80 leading-tight">
                Instant access to manager dashboard with live staff roster.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleDemoLogin}
              disabled={demoLoading}
              className="bg-[#C0FD9B] hover:bg-[#A8F07D] text-[#0E2322] font-bold text-xs h-8 px-3 shrink-0 shadow cursor-pointer"
            >
              {demoLoading ? <Loader2 className="size-3.5 animate-spin" /> : "⚡ Demo Login"}
            </Button>
          </div>

          <Card className="border-border/70 shadow-sm bg-white rounded-2xl">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl font-medium tracking-tight text-[#0E2322]">
                {tab === "signin" ? "Welcome back" : "Register your company"}
              </CardTitle>
              <CardDescription className="text-sm text-[#6D6D6D]">
                {tab === "signin"
                  ? "Sign in with your corporate account or email to access your workspace."
                  : "Set up your organization tenant in under 60 seconds."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as "signin" | "register")}
                className="w-full"
              >
                <TabsList className="grid grid-cols-2 w-full mb-6">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="register">Register Company</TabsTrigger>
                </TabsList>

                {/* SIGN IN TAB */}
                <TabsContent value="signin" className="space-y-4">
                  {/* Google OAuth Button */}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2.5 h-11 font-medium shadow-sm hover:bg-slate-50 cursor-pointer text-sm"
                    onClick={handleSignInGoogle}
                    disabled={loading}
                  >
                    <svg className="size-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    Continue with Google
                  </Button>

                  <div className="relative flex items-center justify-center my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <span className="relative bg-white px-3 text-xs text-muted-foreground uppercase">
                      or sign in with email
                    </span>
                  </div>

                  {/* Email & Password Direct Login */}
                  <form onSubmit={handleEmailLogin} className="space-y-3.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="loginEmail" className="text-xs font-medium text-[#0E2322]">
                        Work Email
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 size-4 text-muted-foreground" />
                        <Input
                          id="loginEmail"
                          type="email"
                          placeholder="name@company.com"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="h-10 pl-9 text-sm"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="loginPassword" className="text-xs font-medium text-[#0E2322]">
                        Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 size-4 text-muted-foreground" />
                        <Input
                          id="loginPassword"
                          type="password"
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="h-10 pl-9 text-sm"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-10 bg-[#0E2322] hover:bg-[#163331] text-white font-medium text-sm transition"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-1.5" />
                          Authenticating...
                        </>
                      ) : (
                        "Sign In with Email"
                      )}
                    </Button>
                  </form>

                  <div className="pt-3 text-center text-xs text-muted-foreground border-t border-slate-100">
                    New company?{" "}
                    <button
                      type="button"
                      onClick={() => setTab("register")}
                      className="font-semibold text-[#0E2322] underline cursor-pointer"
                    >
                      Register your organization here
                    </button>
                  </div>
                </TabsContent>

                {/* REGISTER COMPANY TAB */}
                <TabsContent value="register">
                  {currentUserEmail && (
                    <div className="mb-4 p-3 rounded-xl bg-[#E8FCE4] border border-[#C0FD9B] text-xs text-[#122300] flex items-center gap-2">
                      <Check className="size-4 shrink-0 text-emerald-700" />
                      <span>
                        Signed in as <b>{currentUserEmail}</b>. Now enter your company name:
                      </span>
                    </div>
                  )}

                  <form onSubmit={handleRegisterOrg} className="space-y-3.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="orgName" className="text-xs font-medium text-[#0E2322]">
                        Company / Organization Name
                      </Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-3 size-4 text-muted-foreground" />
                        <Input
                          id="orgName"
                          type="text"
                          placeholder="e.g. Acme Innovations Ltd"
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                          required
                          className="h-10 pl-9 text-sm"
                        />
                      </div>
                    </div>

                    {!currentUserEmail && (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="regEmail" className="text-xs font-medium text-[#0E2322]">
                            Admin Work Email
                          </Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 size-4 text-muted-foreground" />
                            <Input
                              id="regEmail"
                              type="email"
                              placeholder="manager@company.com"
                              value={regEmail}
                              onChange={(e) => setRegEmail(e.target.value)}
                              required
                              className="h-10 pl-9 text-sm"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="regPassword" className="text-xs font-medium text-[#0E2322]">
                            Password (Optional)
                          </Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-3 size-4 text-muted-foreground" />
                            <Input
                              id="regPassword"
                              type="password"
                              placeholder="••••••••"
                              value={regPassword}
                              onChange={(e) => setRegPassword(e.target.value)}
                              className="h-10 pl-9 text-sm"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="timezone" className="text-xs font-medium text-[#0E2322]">
                        Primary Timezone
                      </Label>
                      <Input
                        id="timezone"
                        type="text"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="h-10 text-xs text-muted-foreground"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-11 bg-[#0E2322] hover:bg-[#163331] text-white font-medium shadow-sm transition mt-2 cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-1.5" />
                          Creating Workspace...
                        </>
                      ) : (
                        "Create Organization & Continue"
                      )}
                    </Button>

                    <p className="text-center text-xs text-muted-foreground leading-relaxed pt-1">
                      Includes 14-day free trial on Growth plan. No credit card required.
                    </p>

                    <div className="pt-3 text-center text-xs text-muted-foreground border-t border-slate-100">
                      Already registered?{" "}
                      <button
                        type="button"
                        onClick={() => setTab("signin")}
                        className="font-semibold text-[#0E2322] underline cursor-pointer"
                      >
                        Sign in to existing account
                      </button>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
