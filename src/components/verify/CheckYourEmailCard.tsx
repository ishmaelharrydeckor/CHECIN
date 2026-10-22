import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, MailCheck } from "lucide-react";
import {
  RESEND_COOLDOWN_SECONDS,
  sendButtonState,
  sendErrorMessage,
  type SendStatus,
} from "@/lib/verify-email-screens";
import { useCooldown } from "./useCooldown";

/**
 * "Check your email" (task 1.4a, design section 3 step 4).
 *
 * Screen only: the parent sends the email and passes the result in `status`.
 * When `status` becomes "sent", Resend waits `cooldownSeconds` (60 by default).
 */
export function CheckYourEmailCard({
  email,
  onResend,
  onStartOver,
  status,
  cooldownSeconds = RESEND_COOLDOWN_SECONDS,
  errorMessage,
}: {
  email: string;
  onResend: () => void;
  onStartOver: () => void;
  status: SendStatus;
  cooldownSeconds?: number;
  errorMessage?: string | null;
}) {
  const secondsLeft = useCooldown(status, cooldownSeconds);
  const resend = sendButtonState(status, secondsLeft, "Resend email");
  const sending = status === "sending";

  return (
    <Card className="border-border/70 shadow-sm bg-white rounded-2xl">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-[#CBEED3]">
          <MailCheck className="size-5 text-[#0E2322]" />
        </div>
        <CardTitle className="text-2xl font-medium tracking-tight text-[#0E2322]">
          Check your email
        </CardTitle>
        <CardDescription className="text-sm text-[#6D6D6D]">
          We sent a link to <span className="font-semibold text-[#0E2322] break-words">{email}</span>.
          Open it to confirm your address and finish setting up your organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground text-center">
          Can't find it? Check your spam or junk folder. The link works for 24 hours.
        </p>

        {status === "sent" && (
          <p role="status" className="text-xs text-emerald-600 text-center">
            We sent a new link. It can take a minute to arrive.
          </p>
        )}
        {status === "error" && (
          <p role="alert" className="text-xs text-destructive text-center">
            {sendErrorMessage(errorMessage)}
          </p>
        )}

        <Button
          type="button"
          onClick={onResend}
          disabled={resend.disabled}
          className="w-full h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
        >
          {sending && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
          {resend.label}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onStartOver}
          disabled={sending}
          className="w-full h-10 text-xs text-slate-600"
        >
          Wrong address? Start over
        </Button>
      </CardContent>
    </Card>
  );
}
