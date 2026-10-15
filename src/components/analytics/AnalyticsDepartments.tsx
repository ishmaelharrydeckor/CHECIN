import type { AnalyticsDepartment } from "@/lib/analytics-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "./format";

const DEPARTMENT_LIMIT = 10;

interface AnalyticsDepartmentsProps {
  departments: AnalyticsDepartment[];
}

/**
 * Compact list of departments, in the order the server sends them, at most 10.
 * An empty department name is shown as "No department", never as "General".
 */
export function AnalyticsDepartments({ departments }: AnalyticsDepartmentsProps) {
  const shown = departments.slice(0, DEPARTMENT_LIMIT);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">By department</CardTitle>
        <CardDescription className="text-xs">
          {departments.length === 0
            ? "No department figures for this period."
            : departments.length > shown.length
              ? `Showing the top ${shown.length} of ${departments.length} departments.`
              : `${departments.length} ${departments.length === 1 ? "department" : "departments"}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Nothing to show here yet.</div>
        ) : (
          <ul className="divide-y divide-border/70">
            {shown.map((d, i) => (
              <li key={`${d.department}-${i}`} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${d.department ? "text-[#0E2322]" : "text-muted-foreground"}`}
                  >
                    {d.department || "No department"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.people} {d.people === 1 ? "person" : "people"}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-5 text-right">
                  <Figure label="Attendance" value={formatPercent(d.attendancePercent)} />
                  <Figure label="On time" value={formatPercent(d.punctualityPercent)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[3.5rem]">
      <p className="text-sm font-semibold text-[#0E2322]">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
