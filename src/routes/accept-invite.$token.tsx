import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  firebaseAuth,
  googleProvider,
  signInWithPopup,
  onAuthStateChanged,
  syncUserToFirestore,
  fbSignOut,
} from "@/integrations/firebase/config";
import { signInWithCustomToken } from "firebase/auth";
import { refreshUserClaims } from "@/lib/auth-claims";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ShieldCheck,
  UserCheck,
  AlertCircle,
  Building2,
  Lock,
  User,
  Briefcase,
  Mail,
  Loader2,
  ArrowRight,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { ChecInLogo } from "@/components/ChecInLogo";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/accept-invite/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Accept Team Invitation — ChecIN" }] }),
  component: AcceptInvitePage,
});

const DEPARTMENTS = [
  "Operations",
  "Engineering",
  "Product Design",
  "Sales",
  "Finance",
  "Customer Support",
  "Marketing",
  "Human Resources",
  "General",
];

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();

  const [loadingToken, setLoadingToken] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<{
    email: string;
    role: string;
    orgId: string;
    orgName: string;
    expiresAt: string;
  } | null>(null);

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("Operations");
  const [password, setPassword] = useState("");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [grantedRole, setGrantedRole] = useState<string | null>(null);

  // 1. Fetch public invite metadata on load
  useEffect(() => {
    let active = true;
    const fetchInvite = async () => {
      try {
        const res = await fetch(`/api/admin/staff-invites?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!active) return;

        if (res.ok && data.ok && data.invite) {
          setInviteData(data.invite);
          const nameSuggestion = data.invite.email
            .split("@")[0]
            .replace(/[._]/g, " ")
            .replace(/\b\w/g, (c: string) => c.toUpperCase());
          setFullName(nameSuggestion);
        } else {
          setInviteError(data.error || "This invitation link is invalid or has expired.");
        }
      } catch {
        if (active) setInviteError("Could not verify invitation link. Please check your internet connection.");
      } finally {
        if (active) setLoadingToken(false);
      }
    };

    fetchInvite();
    return () => {
      active = false;
    };
  }, [token]);

  // Track Firebase auth session if user is logged in
  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      setSignedInEmail(u?.email ?? null);
      if (u?.displayName && !fullName) {
        setFullName(u.displayName);
      }
    });
    return unsub;
  }, [fullName]);

  const isMatchingUser = Boolean(
    signedInEmail &&
      inviteData?.email &&
      signedInEmail.toLowerCase() === inviteData.email.toLowerCase(),
  );

  const handleSignOutCurrent = async () => {
    try {
      await fbSignOut(firebaseAuth);
      setSignedInEmail(null);
      toast.success("Signed out. You can now activate your invited account.");
    } catch {
      toast.error("Could not sign out current session");
    }
  };

  // Google sign in helper
  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      await syncUserToFirestore(result.user);
      if (result.user.displayName) {
        setFullName(result.user.displayName);
      }
      toast.success("Google account verified! Please confirm your profile below.");
    } catch (err: any) {
      if (err.code === "auth/popup-blocked") {
        toast.error("Browser blocked the Google popup (common in Incognito). You can register directly with a password below!");
      } else {
        toast.error(err?.message || "Google sign-in was canceled");
      }
    }
  };

  // Profile activation submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || fullName.trim().length < 2) {
      toast.error("Please enter your full name");
      return;
    }

    const currentUser = firebaseAuth.currentUser;
    const isMatching = Boolean(
      currentUser?.email &&
        inviteData?.email &&
        currentUser.email.toLowerCase() === inviteData.email.toLowerCase(),
    );

    if (!isMatching && (!password || password.length < 6)) {
      toast.error("Please choose a password with at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      const idToken = isMatching ? await currentUser!.getIdToken() : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (idToken) headers.Authorization = `Bearer ${idToken}`;

      const res = await fetch("/api/admin/staff-invites", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          token,
          fullName: fullName.trim(),
          department,
          password: password || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Could not accept the invitation");
      }

      if (data.customToken) {
        await signInWithCustomToken(firebaseAuth, data.customToken);
      } else if (currentUser) {
        await currentUser.getIdToken(true);
      }

      await refreshUserClaims();

      setGrantedRole(data.role);
      setDone(true);
      toast.success(`Welcome to ${inviteData?.orgName || "the team"}, ${data.displayName || fullName}!`);

      setTimeout(() => {
        if (data.role === "employee") {
          navigate({ to: "/scan" });
        } else {
          navigate({ to: "/dashboard" });
        }
      }, 1500);
    } catch (err: any) {
      toast.error(err?.message || "Failed to activate your account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#0E2322] flex flex-col font-sans">
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="mb-6">
          <ChecInLogo size={36} />
        </div>

        <Card className="w-full max-w-md border-border/80 shadow-lg rounded-3xl overflow-hidden bg-white">
          {done ? (
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#E8FCE4] text-[#0E2322] flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="size-10 text-emerald-600" />
              </div>
              <div className="font-extrabold text-2xl text-[#0E2322]">
                Welcome, {fullName}!
              </div>
              <p className="text-xs sm:text-sm text-slate-500 max-w-xs mx-auto">
                Your profile has been created for <strong className="text-slate-800">{inviteData?.orgName}</strong>.
                Redirecting you to your {grantedRole === "employee" ? "entrance scanner" : "dashboard"}...
              </p>
            </CardContent>
          ) : loadingToken ? (
            <CardContent className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#0E2322]" />
              <div className="text-sm font-semibold text-slate-700">
                Verifying single-use invitation...
              </div>
            </CardContent>
          ) : inviteError ? (
            <CardContent className="py-10 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <AlertCircle className="size-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Invitation Not Found</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  {inviteError}
                </p>
              </div>
              <Link to="/auth" className="inline-block">
                <Button className="bg-[#0E2322] text-[#C0FD9B] hover:bg-[#163331] text-xs font-bold rounded-xl h-10 px-5">
                  Go to Sign In
                </Button>
              </Link>
            </CardContent>
          ) : (
            <>
              <CardHeader className="text-center pb-4 pt-6 px-6">
                <div className="mx-auto size-12 rounded-2xl bg-[#E8FCE4] text-[#0E2322] flex items-center justify-center mb-2 shadow-xs">
                  <UserCheck className="size-6 text-[#122300]" />
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold mx-auto mb-1">
                  <Building2 className="w-3 h-3 text-slate-500" />
                  <span>{inviteData?.orgName || "Company Invitation"}</span>
                </div>
                <CardTitle className="text-xl font-extrabold tracking-tight text-[#0E2322]">
                  Join {inviteData?.orgName}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Set up your employee credentials to start checking in at entrance kiosks.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 px-6 pb-6">
                {/* Invited Email Badge */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        Invited Email
                      </div>
                      <div className="font-semibold text-slate-800">{inviteData?.email}</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-[#E8FCE4] text-[#122300] font-bold text-[10px] uppercase">
                    {inviteData?.role === "manager" ? "Team Manager" : "Employee"}
                  </span>
                </div>

                {/* Account Conflict Alert if already signed in with a DIFFERENT email */}
                {signedInEmail && !isMatchingUser && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 space-y-1.5">
                    <div className="font-semibold">Signed in as a different user:</div>
                    <div className="font-mono text-[11px] text-amber-900 bg-white/70 px-2 py-1 rounded">
                      {signedInEmail}
                    </div>
                    <p className="text-[11px] text-amber-700">
                      This invite is for <strong>{inviteData?.email}</strong>. Please switch accounts or register below with a password.
                    </p>
                    <button
                      type="button"
                      onClick={handleSignOutCurrent}
                      className="text-xs font-bold text-amber-900 underline flex items-center gap-1 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Sign out {signedInEmail}</span>
                    </button>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Your Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. Kofi Mensah"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#C0FD9B]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Department
                    </label>
                    <div className="relative">
                      <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#C0FD9B] bg-white appearance-none cursor-pointer"
                      >
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {!isMatchingUser && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Create Scanner Password
                        </label>
                        <span className="text-[10px] text-slate-400">Min 6 characters</span>
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#C0FD9B]"
                        />
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-[#0E2322] hover:bg-[#163331] text-[#C0FD9B] font-bold h-11 rounded-xl text-xs sm:text-sm transition shadow-sm mt-2 flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span>{submitting ? "Activating Profile..." : "Accept & Activate Account"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>

                {/* Google Sign-in alternative */}
                {!isMatchingUser && (
                  <div className="pt-2">
                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-slate-200"></div>
                      <span className="flex-shrink mx-3 text-[11px] text-slate-400 uppercase font-medium">
                        or with Google
                      </span>
                      <div className="flex-grow border-t border-slate-200"></div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGoogleSignIn}
                      className="w-full mt-2 h-10 rounded-xl border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center space-x-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                      <span>Continue with Google</span>
                    </Button>
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
      <PublicFooter />
    </div>
  );
}
