import { Check, TriangleAlert } from "lucide-react";

/**
 * Full-viewfinder result of a scan. The employee's phone is the confirmation, so
 * this has to be unmistakable from arm's length: big, one colour per outcome,
 * and a failure must say plainly that nothing was recorded.
 *
 * Colours follow docs/UI-STYLE-GUIDE.md: mint = in, butter = out, amber = late /
 * early departure, no big red block for a failure.
 */
export type ScanOverlayState =
  | {
      kind: "success";
      type: "in" | "out";
      time: string;
      location: string;
      late: boolean;
      earlyDeparture: boolean;
    }
  | { kind: "failure"; title: string; detail: string };

interface Props {
  state: ScanOverlayState;
  /** Success: scan again. Failure: dismiss and try again. */
  onPrimary: () => void;
}

export function ScanResultOverlay({ state, onPrimary }: Props) {
  if (state.kind === "failure") {
    return (
      <div
        role="alert"
        className="absolute inset-0 z-40 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center"
      >
        <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center mb-4">
          <TriangleAlert className="size-7" aria-hidden />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">{state.title}</h2>
        <p className="text-sm text-white/70 max-w-[260px] mb-6">{state.detail}</p>
        <button
          onClick={onPrimary}
          className="py-2.5 px-6 rounded-xl bg-white text-[#0E2322] text-sm font-bold"
        >
          Try again
        </button>
      </div>
    );
  }

  const isIn = state.type === "in";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`absolute inset-0 z-40 flex flex-col items-center justify-center p-6 text-center ${
        isIn ? "bg-[#CBEED3] text-[#0E2322]" : "bg-[#FCF2CB] text-[#0E2322]"
      }`}
    >
      <div className="w-16 h-16 rounded-full bg-[#0E2322] text-[#C0FD9B] flex items-center justify-center mb-4">
        <Check className="size-8" strokeWidth={3} aria-hidden />
      </div>
      <h2 className="text-3xl font-extrabold tracking-tight mb-1">
        {isIn ? "You're checked in" : "You're checked out"}
      </h2>
      <p className="text-5xl font-extrabold tabular-nums my-2">{state.time.slice(0, 5)}</p>
      <p className="text-sm font-medium opacity-80 mb-3">{state.location}</p>

      {(state.late || state.earlyDeparture) && (
        <div className="flex gap-2 mb-4">
          {state.late && (
            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
              Marked late
            </span>
          )}
          {state.earlyDeparture && (
            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
              Left early
            </span>
          )}
        </div>
      )}

      <button
        onClick={onPrimary}
        className="mt-2 py-2.5 px-6 rounded-xl bg-[#0E2322] text-white text-sm font-bold"
      >
        Scan again
      </button>
    </div>
  );
}
