import { Button } from "@/components/ui/button";
import { Loader2, MailWarning } from "lucide-react";
import {
  RESEND_COOLDOWN_SECONDS,
  sendButtonState,
  sendErrorMessage,
  type SendStatus,
} from "@/lib/verify-email-screens";
import { useCooldown } from "./useCooldown";

/**
 * Account page banner (task 1.4a, design section 4). Never blocks anything:
 * it only explains that email notifications need a verified address.
 * Hidden when `verified` is true.
 */
export function VerifyEmailBanner({
  verified,
  email,
  status,
  onSend,
  cooldownSeconds = RESEND_COOLDOWN_SECONDS,
  errorMessage,
}: {
  verified: boolean;
  email?: string | null;
  status: SendStatus;
  onSend: () => void;
  cooldownSeconds?: number;
  errorMessage?: string | null;
}) {
  const secondsLeft = useCooldown(status, cooldownSeconds);
  if (verified) return null;

  const button = sendButtonState(status, secondsLeft, "Send verification email");

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#F5E6B0] bg-[#FCF2CB] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <MailWarning className="mt-0.5 size-4 shrink-0 text-[#854D0E]" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-[#854D0E]">
            Verify your email to receive email notifications
          </p>
          {status === "sent" ? (
            <p role="status" className="text-xs text-[#854D0E]">
              We sent a link{email ? <> to <span className="font-semibold break-words">{email}</span></> : null}. Open it to
              confirm your address.
            </p>
          ) : status === "error" ? (
            <p role="alert" className="text-xs text-destructive">
              {sendErrorMessage(errorMessage)}
            </p>
          ) : (
            <p className="text-xs text-[#854D0E]">
              Check-ins, push and the inbox keep working either way.
            </p>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onSend}
        disabled={button.disabled}
        className="h-10 shrink-0 border-[#F5E6B0] bg-white text-xs self-start sm:self-auto"
      >
        {status === "sending" && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
        {button.label}
      </Button>
    </div>
  );
}
