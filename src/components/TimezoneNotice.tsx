import { Link } from "@tanstack/react-router";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { timezoneNoticeText } from "@/lib/timezone-check";

/**
 * Shown to organization admins until the timezone has been confirmed (see src/lib/timezone-check.ts).
 * On the dashboard it links to Settings; in Settings it offers "Keep this timezone" and "Choose timezone".
 */
export function TimezoneNotice({
  timezone,
  onConfirm,
  onChoose,
  confirming = false,
}: {
  timezone: string;
  /** Settings only: keep the current timezone and mark it confirmed. */
  onConfirm?: () => void;
  /** Settings only: open the edit form. Omit on the dashboard, which links to Settings instead. */
  onChoose?: () => void;
  confirming?: boolean;
}) {
  return (
    <div role="alert" className="rounded-2xl border border-[#F5E6B0] bg-[#FCF2CB] p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#854D0E]" aria-hidden />
        <div className="min-w-0 space-y-3">
          <p className="text-sm font-semibold text-[#854D0E]">Confirm your timezone</p>
          <p className="text-[13px] text-[#854D0E]">{timezoneNoticeText(timezone)}</p>
          <div className="flex flex-wrap gap-2">
            {onChoose ? (
              <Button type="button" onClick={onChoose} className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium">
                Choose timezone
              </Button>
            ) : (
              <Button asChild className="h-10 bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium">
                <Link to="/settings">Choose timezone in Settings</Link>
              </Button>
            )}
            {onConfirm && (
              <Button type="button" variant="outline" disabled={confirming} onClick={onConfirm} className="h-10 border-[#854D0E]/30 text-xs font-medium text-[#854D0E]">
                {confirming && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Keep {timezone || "UTC"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
