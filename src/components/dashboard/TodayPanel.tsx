import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { formatClock, type TodayEventRow, type TodaySummaryData } from "@/lib/attendance-today";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WfhTodayList } from "@/components/wfh/WfhTodayList";
import { Calendar, CheckCircle2, ChevronDown, ChevronUp, Clock, Home, RefreshCw, UserX } from "lucide-react";

/**
 * The "Today" panel for the manager dashboard.
 *
 * Presentational only: it renders exactly what it is given. It does not fetch,
 * does not import Firebase, has no timers, and calculates nothing. Every count,
 * list and time comes from the server (see attendance-today.ts).
 */

const LATE_LIST_LIMIT = 20;
const NOT_ARRIVED_COLLAPSE_AT = 8;
// Two tiles per row on a phone, four on a desktop: the page stays short and the four numbers sit together.
const TILE_GRID = "grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4";

interface TodayPanelProps {
  data: TodaySummaryData | null;
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
  /** Remove one person's work-from-home day for today. Provided by the page, which does the fetching. */
  onRemoveWfh?: (employeeId: string) => Promise<void>;
  /** Show the live activity list beside the late and not-arrived lists. The dashboard shows it lower down instead. */
  showActivity?: boolean;
  /** Offer a link from the late list to the late-arrivals review page (managers and admins only). */
  canReviewLate?: boolean;
}

/** "Tuesday, 6 Oct" from the server's day key. Only formats the date, no clock involved. */
function formatDayLabel(dayKey: string): string {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function TodayPanel({
  data,
  loading,
  error,
  onRefresh,
  onRemoveWfh,
  showActivity = true,
  canReviewLate = false,
}: TodayPanelProps) {
  if (!data && loading) return <TodayLoading onRefresh={onRefresh} />;
  if (!data) return <TodayUnavailable message={error} onRefresh={onRefresh} />;

  const { counts } = data;
  const dayLabel = formatDayLabel(data.dayKey);
  // One entrance? Then the entrance name adds nothing, so leave it out.
  const showEntrance = new Set(data.events.map((e) => e.location).filter(Boolean)).size > 1;

  const eventsShown = data.events.length;
  const activityNote =
    data.eventsTotal === 0
      ? `No check-ins on ${dayLabel} yet.`
      : data.eventsTotal > eventsShown
        ? `Showing the latest ${eventsShown} of ${data.eventsTotal} events on ${dayLabel}.`
        : `${data.eventsTotal} ${data.eventsTotal === 1 ? "event" : "events"} on ${dayLabel}.`;

  const lateShown = data.late.slice(0, LATE_LIST_LIMIT);

  return (
    <section className="space-y-6" aria-label="Today">
      <PanelHeader
        subtitle={`${dayLabel} · times in your organization's timezone`}
        updated={formatClock(data.generatedAt, data.timezone).slice(0, 5)}
        refreshing={loading}
        onRefresh={onRefresh}
      />

      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}

      {/* Count tiles */}
      <div className={TILE_GRID}>
        <Tile
          tone="white"
          href="#todays-checkins"
          label="Present"
          icon={<CheckCircle2 className="size-4" />}
          value={
            <>
              {counts.present} <span className="text-sm font-normal text-slate-700">/ {counts.expected}</span>
            </>
          }
          note={`${counts.onSite} on site now`}
        />
        <Tile
          tone={counts.late > 0 ? "butter" : "white"}
          href={counts.late > 0 ? "#late-today" : undefined}
          label="Late"
          icon={<Clock className="size-4" />}
          value={counts.late}
          note={
            counts.late > 0
              ? `Arrived after reporting time${counts.lateExcused ? `, ${counts.lateExcused} excused` : ""}`
              : counts.lateExcused
                ? `No late arrivals (${counts.lateExcused} excused)`
                : "No late arrivals"
          }
        />
        <Tile
          tone="white"
          href={(data.wfhPeople?.length ?? 0) > 0 ? "#away" : undefined}
          label="Away"
          icon={<Calendar className="size-4" />}
          value={counts.onLeave + counts.wfh}
          note={`${counts.wfh} working from home · ${counts.onLeave} on leave`}
        />
        <Tile
          tone={counts.absent > 0 ? "butter" : "white"}
          href={counts.absent > 0 ? "#not-arrived" : undefined}
          label="Absent"
          icon={<UserX className="size-4" />}
          value={counts.absent}
          note="Expected, not arrived"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live activity */}
        {showActivity && (
        <Card className="border-border/80 shadow-sm lg:col-span-7">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Live activity</CardTitle>
            <CardDescription className="text-[13px]">
              {activityNote}
              {data.truncated ? " Very busy day: some events may not be counted." : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.events.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <Clock className="size-8 mx-auto text-muted-foreground/60" />
                <p className="text-sm font-medium text-[#0E2322]">No check-ins yet today</p>
                <p className="text-[13px] text-muted-foreground">
                  When people check in or out, they will appear here.
                </p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border/70">
                  {data.events.map((event) => (
                    <ActivityRow key={event.id} event={event} showEntrance={showEntrance} />
                  ))}
                </ul>
                <div className="pt-3 mt-1 border-t border-border/70 text-right">
                  <Link to="/history" className="text-[13px] font-semibold text-[#0E2322] hover:underline">
                    View full history →
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        )}

        <div className={showActivity ? "lg:col-span-5 space-y-6" : "lg:col-span-12 space-y-6"}>
          <div className={showActivity ? "space-y-6" : "grid grid-cols-1 lg:grid-cols-2 gap-6 items-start"}>
            <NotArrivedCard people={data.notArrived} expected={counts.expected} />
            {/* Late today */}
            <Card id="late-today" className="scroll-mt-20 border-border/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Late today</CardTitle>
                <CardDescription className="text-[13px]">
                  {data.late.length === 0
                    ? "No late arrivals so far."
                    : data.late.length > lateShown.length
                      ? `Showing the first ${lateShown.length} of ${data.late.length} late arrivals.`
                      : `${data.late.length} arrived after reporting time.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {lateShown.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No late arrivals today.</div>
                ) : (
                  <ul className="divide-y divide-border/70">
                    {lateShown.map((person) => (
                      <li key={person.employeeId} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#0E2322] truncate">{person.name}</p>
                          {person.department && (
                            <p className="text-[13px] text-muted-foreground truncate">{person.department}</p>
                          )}
                        </div>
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold font-mono bg-amber-100 text-amber-900">
                          {person.arrivedAt}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {canReviewLate && data.late.length > 0 && (
                  <div className="pt-3 mt-1 border-t border-border/70 text-right">
                    <Link to="/late-arrivals" className="text-[13px] font-semibold text-[#0E2322] hover:underline">
                      Review late arrivals →
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {(data.wfhPeople?.length ?? 0) > 0 && (
            <WfhStrip people={data.wfhPeople ?? []} onRetry={() => onRefresh?.()} onRemove={onRemoveWfh} />
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function PanelHeader({
  subtitle,
  updated,
  refreshing,
  onRefresh,
}: {
  subtitle: string;
  updated?: string;
  refreshing: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-[#0E2322]">Today</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {updated && <span className="text-[13px] text-slate-500">Last updated {updated}</span>}
        {onRefresh && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh today's numbers"
            title="Refresh today's numbers"
            className="size-8 text-slate-600"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>
    </div>
  );
}

type TileTone = "white" | "mint" | "butter";

const TILE_TONES: Record<TileTone, { box: string; label: string; icon: string; note: string }> = {
  white: {
    box: "bg-white border-slate-200/80",
    label: "text-slate-500",
    icon: "bg-slate-50 text-slate-700",
    note: "text-slate-500",
  },
  mint: {
    box: "bg-[#CBEED3] border-[#B2E2BD]",
    label: "text-[#0E2322]",
    icon: "bg-white/70 text-emerald-900",
    note: "text-[#0E2322]",
  },
  butter: {
    box: "bg-[#FCF2CB] border-[#F5E6B0]",
    label: "text-[#854D0E]",
    icon: "bg-white/70 text-[#854D0E]",
    note: "text-[#854D0E]",
  },
};

function Tile({
  tone,
  href,
  label,
  icon,
  value,
  note,
}: {
  tone: TileTone;
  /** Where tapping the tile jumps to on this page. Leave out when there is nothing to jump to. */
  href?: string;
  label: string;
  icon: ReactNode;
  value: ReactNode;
  note: string;
}) {
  const t = TILE_TONES[tone];
  const box = `${t.box} p-5 rounded-3xl border shadow-xs flex flex-col justify-between gap-3 min-w-0`;
  const body = (
    <>
      <div className={`flex items-start justify-between gap-2 ${t.label}`}>
        <span className="text-xs font-semibold uppercase tracking-wider leading-snug">{label}</span>
        <span className={`p-2 rounded-xl shrink-0 ${t.icon}`}>{icon}</span>
      </div>
      <div>
        <div className="text-3xl font-extrabold text-[#0E2322]">{value}</div>
        <div className={`text-[13px] mt-2 font-medium ${t.note}`}>{note}</div>
      </div>
    </>
  );
  return href ? (
    <a href={href} className={`${box} no-underline hover:shadow-md transition-shadow focus-visible:outline-2 focus-visible:outline-[#0E2322]`}>
      {body}
    </a>
  ) : (
    <div className={box}>{body}</div>
  );
}

/** Work from home is routine, not urgent: one quiet line that opens into the full list (with Remove) on tap. */
function WfhStrip({
  people,
  onRetry,
  onRemove,
}: {
  people: NonNullable<TodaySummaryData["wfhPeople"]>;
  onRetry: () => void;
  onRemove?: (employeeId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const preview = people.slice(0, 3).map((p) => p.name);
  const more = people.length - preview.length;
  return (
    <div id="away" className="scroll-mt-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-5 py-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 min-w-0 text-sm">
          <Home className="size-4 shrink-0 text-slate-500" aria-hidden />
          <span className="font-semibold text-[#0E2322] shrink-0">Working from home today</span>
          <span className="text-slate-500 truncate">
            · {preview.join(", ")}
            {more > 0 ? ` and ${more} more` : ""}
          </span>
        </span>
        <span className="flex items-center gap-1 shrink-0 text-[13px] font-semibold text-[#0E2322]">
          {people.length}
          {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
        </span>
      </button>
      {open && (
        <div className="mt-3">
          <WfhTodayList people={people} loading={false} error={null} onRetry={onRetry} onRemove={onRemove} />
        </div>
      )}
    </div>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span className="shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">
      {children}
    </span>
  );
}

function StatusPill({ type }: { type: "in" | "out" }) {
  const isIn = type === "in";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
        isIn ? "bg-[#CBEED3] text-[#0E2322]" : "bg-slate-100 text-slate-700"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isIn ? "bg-emerald-600" : "bg-slate-400"}`} />
      {isIn ? "Clocked in" : "Clocked out"}
    </span>
  );
}

function ActivityRow({ event, showEntrance }: { event: TodayEventRow; showEntrance: boolean }) {
  const meta = [event.department, showEntrance ? event.location : ""].filter(Boolean).join(" · ");
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 shrink-0 rounded-full bg-[#0E2322] text-[#C0FD9B] font-extrabold flex items-center justify-center text-[13px]">
          {event.initials}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-medium text-[#0E2322] truncate min-w-0">{event.name}</p>
            {event.late && <Tag>Late</Tag>}
            {event.lateExcused && <Tag>Late, excused</Tag>}
            {event.earlyDeparture && <Tag>Early departure</Tag>}
          </div>
          {meta && <p className="text-[13px] text-muted-foreground truncate">{meta}</p>}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="font-mono text-sm text-[#0E2322]">{event.time}</span>
        <StatusPill type={event.type} />
      </div>
    </li>
  );
}

function NotArrivedCard({
  people,
  expected,
}: {
  people: TodaySummaryData["notArrived"];
  expected: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = people.length > NOT_ARRIVED_COLLAPSE_AT;
  const rows = collapsible && !expanded ? people.slice(0, NOT_ARRIVED_COLLAPSE_AT) : people;

  return (
    <Card id="not-arrived" className="scroll-mt-20 border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Not arrived yet</CardTitle>
        <CardDescription className="text-[13px]">
          {people.length === 0
            ? expected === 0
              ? "No one is expected today."
              : "Everyone expected has checked in."
            : `${people.length} expected, not here yet.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {people.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {expected === 0 ? "No one is expected today." : "Everyone expected has checked in."}
          </div>
        ) : (
          <>
            <ul className={`divide-y divide-border/70 ${expanded ? "max-h-80 overflow-y-auto pr-1" : ""}`}>
              {rows.map((person) => (
                <li key={person.employeeId} className="py-3 min-w-0">
                  <p className="text-sm font-medium text-[#0E2322] truncate">{person.name}</p>
                  {person.department && (
                    <p className="text-[13px] text-muted-foreground truncate">{person.department}</p>
                  )}
                </li>
              ))}
            </ul>
            {collapsible && (
              <div className="pt-3 mt-1 border-t border-border/70">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  className="text-[13px] text-[#0E2322]"
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="size-4 mr-1.5" /> Show fewer
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-4 mr-1.5" /> Show all {people.length}
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Loading and error states
// ---------------------------------------------------------------------------

function TodayLoading({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <section className="space-y-6" aria-busy="true" aria-label="Loading today's check-ins">
      <PanelHeader subtitle="Loading today's check-ins…" refreshing onRefresh={onRefresh} />
      <div className={TILE_GRID}>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-3xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="border-border/80 shadow-sm lg:col-span-7">
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </CardContent>
        </Card>
        <div className="lg:col-span-5 space-y-6">
          {[0, 1].map((i) => (
            <Card key={i} className="border-border/80 shadow-sm">
              <CardContent className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function TodayUnavailable({ message, onRefresh }: { message: string | null; onRefresh?: () => void }) {
  return (
    <section className="space-y-6" aria-label="Today">
      <PanelHeader subtitle="Today's check-ins" refreshing={false} />
      <Card className="border-border/80 shadow-sm">
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-sm font-medium text-[#0E2322]">Couldn't load today's check-ins</p>
          <p role="alert" className="text-sm text-destructive">
            {message ?? "Today's numbers aren't available yet."}
          </p>
          {onRefresh && (
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} className="text-[13px]">
              Try again
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
