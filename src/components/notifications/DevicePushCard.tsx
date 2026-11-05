import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Smartphone } from "lucide-react";
import type { DevicePushState } from "@/lib/notifications";

const STATES: Record<DevicePushState, { pill: string; pillClass: string; text: string }> = {
  on: {
    pill: "On",
    pillClass: "bg-[#CBEED3] text-[#0E2322]",
    text: "This device gets your notifications.",
  },
  off: {
    pill: "Off",
    pillClass: "bg-slate-100 text-slate-700",
    text: "Turn this on to get leave decisions, shift changes and announcements on this device.",
  },
  blocked: {
    pill: "Blocked",
    pillClass: "bg-amber-100 text-amber-900",
    text:
      "Your browser is blocking notifications from ChecIN. To allow them, open the site settings (the icon to the left of the web address), set Notifications to Allow, then reload this page.",
  },
  ios_needs_home_screen: {
    pill: "Needs the Home Screen app",
    pillClass: "bg-slate-100 text-slate-700",
    text:
      "On iPhone and iPad, notifications only work from the ChecIN app on your Home Screen. In Safari, tap Share, then Add to Home Screen, then open ChecIN from there.",
  },
  unsupported: {
    pill: "Not available",
    pillClass: "bg-slate-100 text-slate-500",
    text: "This browser can't show notifications. Try a recent version of Chrome, Edge, Firefox or Safari.",
  },
};

/**
 * "This device" card for the Account page (task 2.6). Screen only: the parent
 * works out `state` (see devicePushStateFrom) and does the actions.
 * Send me a test does nothing until the integrator connects `onSendTest`.
 */
export function DevicePushCard({
  state,
  loading = false,
  busy = false,
  testing = false,
  errorMessage,
  onTurnOn,
  onTurnOff,
  onSendTest,
  onRetry,
}: {
  state: DevicePushState;
  loading?: boolean;
  busy?: boolean;
  testing?: boolean;
  errorMessage?: string | null;
  onTurnOn: () => void;
  onTurnOff: () => void;
  onSendTest: () => void;
  onRetry?: () => void;
}) {
  const info = STATES[state];

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Smartphone className="size-4 text-[#0E2322]" /> This device
        </CardTitle>
        <CardDescription className="text-xs">Notifications are set up separately on each phone or computer.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div aria-busy="true">
            <span className="sr-only">Checking this device…</span>
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${info.pillClass}`}>
                  {info.pill}
                </span>
                <p className="text-xs text-muted-foreground break-words">{info.text}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {state === "on" && (
                  <>
                    <Button
                      type="button"
                      onClick={onSendTest}
                      disabled={busy || testing}
                      className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                    >
                      {testing && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                      Send me a test
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onTurnOff}
                      disabled={busy || testing}
                      className="h-10 border-slate-200 text-xs"
                    >
                      Turn off
                    </Button>
                  </>
                )}
                {state === "off" && (
                  <Button
                    type="button"
                    onClick={onTurnOn}
                    disabled={busy}
                    className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                  >
                    {busy && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                    Turn on
                  </Button>
                )}
              </div>
            </div>
            {errorMessage && (
              <div className="flex flex-wrap items-center gap-3">
                <p role="alert" className="text-xs text-destructive">
                  {errorMessage}
                </p>
                {onRetry && (
                  <Button type="button" variant="outline" onClick={onRetry} className="h-9 border-slate-200 text-xs">
                    Try again
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
