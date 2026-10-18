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
const TILE_GRID = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4";

interface TodayPanelProps {
  data: TodaySummaryData | null;
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
  /** Remove one person's work-from-home day for today. Provided by the page, which does the fetching. */
  onRemoveWfh?: (employeeId: string) => Promise<void>;
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

export function TodayPanel({ data, loading, error, onRefresh, onRemoveWfh }: TodayPanelProps) {
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
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {/* Count tiles */}
      <div className={TILE_GRID}>
        <Tile
          tone="mint"
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
          label="On leave"
          icon={<Calendar className="size-4" />}
          value={counts.onLeave}
          note="Approved leave today"
        />
        <Tile
          tone="white"
          label="Working from home"
          icon={<Home className="size-4" />}
          value={counts.wfh}
          note="Working remotely today"
        />
        <Tile
          tone="white"
          label="Absent"
          icon={<UserX className="size-4" />}
          value={counts.absent}
          note="Expected, not arrived"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live activity */}
        <Card className="border-border/80 shadow-sm lg:col-span-7">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Live activity</CardTitle>
            <CardDescription className="text-xs">
              {activityNote}
              {data.truncated ? " Very busy day: some events may not be counted." : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.events.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <Clock className="size-8 mx-auto text-muted-foreground/60" />
                <p className="text-sm font-medium text-[#0E2322]">No check-ins yet today</p>
                <p className="text-xs text-muted-foreground">
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
                  <Link to="/history" className="text-xs font-semibold text-[#0E2322] hover:underline">
                    View full history →
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-5 space-y-6">
          {/* Late today */}
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Late today</CardTitle>
              <CardDescription className="text-xs">
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
                          <p className="text-xs text-muted-foreground truncate">{person.department}</p>
                        )}
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono bg-amber-100 text-amber-900">
                        {person.arrivedAt}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <NotArrivedCard people={data.notArrived} expected={counts.expected} />

          {(data.wfhPeople?.length ?? 0) > 0 && (
            <WfhTodayList
              people={data.wfhPeople ?? []}
              loading={false}
              error={null}
              onRetry={() => onRefresh?.()}
              onRemove={onRemoveWfh}
            />
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
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {updated && <span className="text-xs text-slate-500">Last updated {updated}</span>}
        {onRefresh && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="border-slate-200 text-xs"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
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
  label,
  icon,
  value,
  note,
}: {
  tone: TileTone;
  label: string;
  icon: ReactNode;
  value: ReactNode;
  note: string;
}) {
  const t = TILE_TONES[tone];
  return (
    <div className={`${t.box} p-5 rounded-3xl border shadow-xs flex flex-col justify-between gap-3 min-w-0`}>
      <div className={`flex items-start justify-between gap-2 ${t.label}`}>
        <span className="text-xs font-semibold uppercase tracking-wider leading-snug">{label}</span>
        <span className={`p-2 rounded-xl shrink-0 ${t.icon}`}>{icon}</span>
      </div>
      <div>
        <div className="text-3xl font-extrabold text-[#0E2322]">{value}</div>
        <div className={`text-xs mt-2 font-medium ${t.note}`}>{note}</div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span className="shrink-0 inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900">
      {children}
    </span>
  );
}

function StatusPill({ type }: { type: "in" | "out" }) {
  const isIn = type === "in";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
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
        <div className="w-9 h-9 shrink-0 rounded-full bg-[#0E2322] text-[#C0FD9B] font-extrabold flex items-center justify-center text-xs">
          {event.initials}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-medium text-[#0E2322] truncate min-w-0">{event.name}</p>
            {event.late && <Tag>Late</Tag>}
            {event.lateExcused && <Tag>Late, excused</Tag>}
            {event.earlyDeparture && <Tag>Early departure</Tag>}
          </div>
          {meta && <p className="text-xs text-muted-foreground truncate">{meta}</p>}
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
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Not arrived yet</CardTitle>
        <CardDescription className="text-xs">
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
                    <p className="text-xs text-muted-foreground truncate">{person.department}</p>
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
                  className="text-xs text-[#0E2322]"
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
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} className="text-xs">
              Try again
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
