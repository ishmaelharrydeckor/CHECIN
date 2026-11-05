import { createFileRoute } from "@tanstack/react-router";
import { TimesheetView } from "@/components/timesheet/TimesheetView";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/reports/timesheets")({
  head: () => ({
    meta: [
      { title: "Timesheets — ChecIN" },
      {
        name: "description",
        content: "Hours worked by each person over a range of days, opened day by day, with CSV, Excel and PDF downloads.",
      },
    ],
  }),
  component: TimesheetsPage,
});

/** Managers and admins only (the menu and the reports guard already keep employees out; this is the second lock). */
function TimesheetsPage() {
  const { isOrgAdmin, isManager } = useAuth();
  if (!isOrgAdmin && !isManager) return null;
  return <TimesheetView />;
}
