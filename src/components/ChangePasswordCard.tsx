import { useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "sonner";
import { KeyRound, Loader2, Lock } from "lucide-react";
import {
  MIN_PASSWORD_LENGTH,
  describePasswordChangeError,
  hasPasswordSignIn,
  validatePasswordChange,
} from "@/lib/password-change";

/**
 * Change password (task 1.3).
 *
 * Runs entirely in the browser with the Firebase Auth client SDK: the current
 * password is re-checked (reauthenticateWithCredential), then updatePassword.
 * No password is logged, stored, or sent to our own server.
 * Hidden for accounts that only sign in with Google.
 */
export function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fbUser = firebaseAuth.currentUser;
  const providerIds = fbUser?.providerData.map((p) => p.providerId);

  if (!fbUser) return null;

  if (!hasPasswordSignIn(providerIds)) {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <KeyRound className="size-4 text-[#0E2322]" /> Password
          </CardTitle>
          <CardDescription className="text-xs">
            You sign in with Google, so there's no ChecIN password to change. Manage your password
            in your Google account instead.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const problem = validatePasswordChange({ current, next, confirm });
    if (problem) {
      setError(problem);
      return;
    }

    const user = firebaseAuth.currentUser;
    if (!user || !user.email) {
      setError("Please sign in again and try once more.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Proves the person at the keyboard knows the current password.
      const credential = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, next);

      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed.");
    } catch (err) {
      // Log only the error code, never the error object or any password.
      const code = (err as { code?: string } | null)?.code;
      console.warn("Password change failed:", code ?? "unknown");
      setError(describePasswordChangeError(code));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <KeyRound className="size-4 text-[#0E2322]" /> Change password
        </CardTitle>
        <CardDescription className="text-xs">
          Enter your current password, then choose a new one (at least {MIN_PASSWORD_LENGTH}{" "}
          characters).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword" className="text-xs font-medium text-[#0E2322]">
              Current password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <PasswordInput
                id="currentPassword"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="h-10 pl-9 text-sm"
                autoComplete="current-password"
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPassword" className="text-xs font-medium text-[#0E2322]">
              New password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <PasswordInput
                id="newPassword"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="h-10 pl-9 text-sm"
                autoComplete="new-password"
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmNewPassword" className="text-xs font-medium text-[#0E2322]">
              Confirm new password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <PasswordInput
                id="confirmNewPassword"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-10 pl-9 text-sm"
                autoComplete="new-password"
                disabled={saving}
              />
            </div>
            {confirm.length > 0 && confirm !== next && (
              <p className="text-xs text-rose-600">Passwords don't match yet.</p>
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={saving}
            className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
          >
            {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
