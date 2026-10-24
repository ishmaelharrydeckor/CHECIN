import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Loader2, TriangleAlert } from "lucide-react";
import type { FinishSetupState } from "@/lib/verify-email-screens";

/**
 * "Finishing setting up your organization" (task 1.4a, design section 3 step 6).
 *
 * Screen only: the parent calls the finish route and passes the result in `state`.
 */
export function FinishSetupScreen({
  state,
  onRetry,
  onStartAgain,
  errorMessage,
}: {
  state: FinishSetupState;
  onRetry: () => void;
  onStartAgain: () => void;
  errorMessage?: string | null;
}) {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      <Card className="w-full max-w-md border-border/70 shadow-sm bg-white rounded-2xl">
        {state === "working" && (
          <CardHeader className="text-center py-10" role="status" aria-busy="true">
            <Loader2 className="mx-auto mb-3 size-8 animate-spin text-[#0E2322]" />
            <CardTitle className="text-xl font-medium tracking-tight text-[#0E2322]">
              Finishing setting up your organization
            </CardTitle>
            <CardDescription className="text-sm text-[#6D6D6D]">
              This takes a few seconds. Please keep this page open.
            </CardDescription>
          </CardHeader>
        )}

        {state === "error" && (
          <>
            <CardHeader className="text-center pb-4">
              <TriangleAlert className="mx-auto mb-3 size-8 text-muted-foreground/60" />
              <CardTitle className="text-xl font-medium tracking-tight text-[#0E2322]">
                We couldn't finish setting up your organization
              </CardTitle>
              <CardDescription role="alert" className="text-sm text-destructive">
                {errorMessage?.trim() || "Something went wrong on our side. Your email is confirmed, so you can safely try again."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="outline"
                onClick={onRetry}
                className="w-full h-10 border-slate-200 text-xs"
              >
                Try again
              </Button>
            </CardContent>
          </>
        )}

        {state === "expired" && (
          <>
            <CardHeader className="text-center pb-4">
              <Clock className="mx-auto mb-3 size-8 text-muted-foreground/60" />
              <CardTitle className="text-xl font-medium tracking-tight text-[#0E2322]">
                This sign-up has expired
              </CardTitle>
              <CardDescription className="text-sm text-[#6D6D6D]">
                A sign-up that isn't confirmed within 24 hours is removed. Start again to register
                your company. It only takes a minute.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                onClick={onStartAgain}
                className="w-full h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
              >
                Start again
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
