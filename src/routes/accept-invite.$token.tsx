import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  firebaseAuth,
  googleProvider,
  signInWithPopup,
  onAuthStateChanged,
  syncUserToFirestore,
} from "@/integrations/firebase/config";
import { refreshUserClaims } from "@/lib/auth-claims";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShieldCheck, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { ChecInLogo } from "@/components/ChecInLogo";
import { PublicFooter } from "@/components/PublicFooter";

export const Route = createFileRoute("/accept-invite/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Accept Invitation — ChecIN" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);
  const [grantedRole, setGrantedRole] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (user) => {
      setSignedInEmail(user?.email ?? null);
      setChecking(false);
    });
    return unsub;
  }, []);

  const signIn = async () => {
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      await syncUserToFirestore(result.user);
    } catch (err: any) {
      toast.error(err?.message || "Sign-in failed");
    }
  };

  const accept = async () => {
    const user = firebaseAuth.currentUser;
    if (!user) return toast.error("Please sign in first");

    setAccepting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/admin/staff-invites", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not accept the invitation");

      // Custom claims are baked into the ID token at issue time, so force a refresh
      await user.getIdToken(true);
      await refreshUserClaims();

      setGrantedRole(data.role);
      setDone(true);
      toast.success(
        data.role === "manager"
          ? "Welcome! You are now a Team Manager."
          : "Welcome! Your employee profile is active.",
      );

      setTimeout(() => {
        if (data.role === "employee") {
          navigate({ to: "/scan" });
        } else {
          navigate({ to: "/dashboard" });
        }
      }, 1500);
    } catch (err: any) {
      toast.error(err?.message || "Could not accept the invitation");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#0E2322] flex flex-col font-sans">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8">
          <ChecInLogo size={34} />
        </div>

        <Card className="w-full max-w-md border-border/80 shadow-md">
          {done ? (
            <CardContent className="pt-6 text-center space-y-4">
              <CheckCircle2 className="size-14 text-emerald-600 mx-auto" />
              <div className="font-medium text-2xl text-[#0E2322]">Invitation accepted</div>
              <p className="text-sm text-muted-foreground">
                Redirecting you to your {grantedRole === "employee" ? "scanner" : "dashboard"}…
              </p>
            </CardContent>
          ) : (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto size-12 rounded-full bg-[#E8FCE4] text-[#0E2322] flex items-center justify-center mb-2">
                  <UserCheck className="size-6 text-[#122300]" />
                </div>
                <CardTitle className="text-xl font-medium tracking-tight">Team Invitation</CardTitle>
                <CardDescription>
                  You have been invited to join your company on ChecIN. Sign in with your corporate email
                  to activate your profile.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {checking ? (
                  <p className="text-sm text-center text-muted-foreground">Checking session…</p>
                ) : signedInEmail ? (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm">
                      <div className="text-xs text-muted-foreground mb-0.5">Signed in as</div>
                      <div className="font-medium text-[#0E2322]">{signedInEmail}</div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Must match the invited email address.
                      </p>
                    </div>
                    <Button
                      className="w-full bg-[#C0FD9B] hover:bg-[#aef584] text-[#122300] font-medium h-11"
                      onClick={accept}
                      disabled={accepting}
                    >
                      {accepting ? "Activating Profile…" : "Accept & Join Team"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => firebaseAuth.signOut()}
                    >
                      Sign in with a different email
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-center text-muted-foreground">
                      Sign in with the email address your company invited to activate your account.
                    </p>
                    <Button
                      className="w-full h-11 font-medium bg-[#0E2322] text-white hover:bg-[#163331]"
                      onClick={signIn}
                    >
                      Sign in with Google
                    </Button>
                  </>
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
