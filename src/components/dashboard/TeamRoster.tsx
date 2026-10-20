import { useMemo, useState } from "react";
import { RefreshCw, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FILTER_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  departmentsOf,
  filterCounts,
  filterRoster,
  percentText,
  shiftLabel,
  sortRoster,
  type RosterData,
  type RosterFilter,
  type RosterRow,
} from "@/lib/team-roster";

/**
 * The team roster: who is where today, with their shift, arrival time and this month's attendance and
 * punctuality. A table on a wide screen and a list of cards on a phone. Presentational only: it draws exactly
 * what the server sent (/api/attendance/roster) and calculates nothing but the filters.
 */

const PAGE_SIZE = 50;
const FILTERS: RosterFilter[] = ["all", "here", "late", "away", "missing"];

export function TeamRoster({
  data,
  loading,
  error,
  onRefresh,
}: {
  data: RosterData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [department, setDepartment] = useState("");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const rows = data?.rows ?? [];
  const counts = useMemo(() => filterCounts(rows), [rows]);
  const departments = useMemo(() => departmentsOf(rows), [rows]);
  const shown = useMemo(() => sortRoster(filterRoster(rows, { filter, department, query })), [rows, filter, department, query]);
  const page = shown.slice(0, visible);

  return (
    <Card id="team-roster" className="scroll-mt-20 border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">Team roster</CardTitle>
            <CardDescription className="text-[13px]">
              Where everyone is today, and how they have done since the 1st of the month. Times are in your organization's timezone.
            </CardDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onRefresh} disabled={loading} aria-label="Refresh the roster" title="Refresh the roster" className="size-8 text-slate-600">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && data === null ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm font-medium text-[#0E2322]">Couldn't load the team roster</p>
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} className="text-[13px]">
              Try again
            </Button>
          </div>
        ) : data === null ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading the team roster">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Users className="size-8 mx-auto text-muted-foreground/60" />
            <p className="text-sm font-medium text-[#0E2322]">No one on the roster yet</p>
            <p className="text-[13px] text-muted-foreground">People appear here once they have joined your team.</p>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter the roster">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setFilter(f);
                      setVisible(PAGE_SIZE);
                    }}
                    aria-pressed={filter === f}
                    className={`h-9 rounded-full px-3 text-[13px] font-medium transition ${
                      filter === f ? "bg-[#0E2322] text-[#C0FD9B]" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {FILTER_LABEL[f]} <span className={filter === f ? "text-[#C0FD9B]" : "text-slate-500"}>{counts[f]}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <Input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setVisible(PAGE_SIZE);
                    }}
                    placeholder="Find a person"
                    aria-label="Find a person"
                    className="h-10 pl-8 sm:w-52"
                  />
                </div>
                {departments.length > 1 && (
                  <select
                    value={department}
                    onChange={(e) => {
                      setDepartment(e.target.value);
                      setVisible(PAGE_SIZE);
                    }}
                    aria-label="Filter by department"
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  >
                    <option value="">All departments</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {shown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No one matches. Try another filter or name.</p>
            ) : (
              <>
                {/* Wide screens: a table */}
                <div className="hidden lg:block overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2 text-left font-semibold">Person</th>
                        <th className="px-3 py-2 text-left font-semibold">Today</th>
                        <th className="px-3 py-2 text-left font-semibold">Shift</th>
                        <th className="px-3 py-2 text-left font-semibold">Arrived</th>
                        <th className="px-3 py-2 text-left font-semibold">Attendance</th>
                        <th className="px-3 py-2 text-left font-semibold">On time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.map((r) => (
                        <tr key={r.employeeId} className="border-t border-slate-100">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-[#0E2322]">{r.name}</p>
                            {r.department && <p className="text-[13px] text-muted-foreground">{r.department}</p>}
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusPills row={r} />
                          </td>
                          <td className="px-3 py-2.5 text-[13px] text-slate-700">{shiftLabel(r.shift) || <span className="text-slate-400">–</span>}</td>
                          <td className="px-3 py-2.5 font-mono text-[13px] text-[#0E2322]">{r.firstIn ?? <span className="text-slate-400">–</span>}</td>
                          <td className="px-3 py-2.5">
                            <Bar label="Attendance" value={r.attendance} note={r.daysCounted > 0 ? `${r.daysCounted} days` : undefined} />
                          </td>
                          <td className="px-3 py-2.5">
                            <Bar label="On time" value={r.punctuality} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Phones and tablets: a card per person */}
                <ul className="space-y-2 lg:hidden">
                  {page.map((r) => (
                    <li key={r.employeeId} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#0E2322] break-words">{r.name}</p>
                          {r.department && <p className="text-[13px] text-muted-foreground break-words">{r.department}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm text-[#0E2322]">{r.firstIn ?? ""}</p>
                          {r.firstIn && <p className="text-[11px] text-muted-foreground">arrived</p>}
                        </div>
                      </div>
                      <div className="mt-2">
                        <StatusPills row={r} />
                      </div>
                      {shiftLabel(r.shift) && <p className="mt-2 text-[13px] text-slate-700">{shiftLabel(r.shift)}</p>}
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <Bar label="Attendance" value={r.attendance} note={r.daysCounted > 0 ? `${r.daysCounted} days` : undefined} stacked />
                        <Bar label="On time" value={r.punctuality} stacked />
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-slate-500">
                  <span>
                    Showing {page.length} of {shown.length}
                    {data.truncated ? ". Some people or days may be missing: this is a very large team." : "."}
                  </span>
                  {shown.length > page.length && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)} className="text-[13px]">
                      Show more
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Where the person is, plus a Late or Left-early tag when that applies. Always words, never colour alone. */
function StatusPills({ row }: { row: RosterRow }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[row.status]}`}>
        {row.status === "in" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" aria-hidden />}
        {STATUS_LABEL[row.status]}
      </span>
      {row.late && <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">Late</span>}
      {row.lateExcused && <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">Late, excused</span>}
      {row.earlyDeparture && <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">Left early</span>}
    </div>
  );
}

/** A small bar with the number beside it. No data shows a dash and an empty bar, never a made-up figure. */
function Bar({ label, value, note, stacked = false }: { label: string; value: number | null; note?: string; stacked?: boolean }) {
  return (
    <div className={stacked ? "min-w-0" : "min-w-[8rem]"}>
      {stacked && <p className="text-xs font-medium text-slate-500">{label}</p>}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-[#0E2322]">{percentText(value)}</span>
        {!stacked && note && <span className="text-[11px] text-slate-500">{note}</span>}
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value === null ? "No data yet" : `${value} percent`}
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${value ?? 0}%` }} />
      </div>
      {stacked && note && <p className="mt-1 text-[11px] text-slate-500">{note}</p>}
    </div>
  );
}
