import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { firebaseAuth } from "@/integrations/firebase/config";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DepartmentListEditor } from "@/components/DepartmentListEditor";
import { DEFAULT_DEPARTMENT, matchDepartment } from "@/lib/departments";

export const Route = createFileRoute("/_authenticated/departments")({
  head: () => ({ meta: [{ title: "Departments — ChecIN" }] }),
  component: DepartmentsPage,
});

interface Member {
  uid: string;
  displayName: string;
  email: string;
  department: string;
  /** Who they report to. A manager (or admin) reports to themself. */
  managerId?: string | null;
}

const PEOPLE_SHOWN = 100;

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await firebaseAuth.currentUser?.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function DepartmentsPage() {
  const { user, isOrgAdmin } = useAuth();

  const [saved, setSaved] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<string[]>([DEFAULT_DEPARTMENT]);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [movingUid, setMovingUid] = useState<string | null>(null);
  const [reassigningUid, setReassigningUid] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [deptRes, memberRes] = await Promise.all([
        authedFetch("/api/organization/departments"),
        authedFetch("/api/admin/staff-invites"),
      ]);
      const deptData = await deptRes.json().catch(() => null);
      const memberData = await memberRes.json().catch(() => null);
      if (!deptRes.ok || !deptData?.departments) {
        throw new Error(deptData?.error || "Could not load the departments.");
      }
      if (!memberRes.ok || !Array.isArray(memberData?.members)) {
        throw new Error(memberData?.error || "Could not load your people.");
      }
      setSaved(deptData.departments as string[]);
      setDraft(deptData.departments as string[]);
      setMembers(memberData.members as Member[]);
    } catch (e: any) {
      setLoadError(e?.message || "Could not reach the server. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changed = useMemo(
    () => saved !== null && JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft],
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await authedFetch("/api/organization/departments", {
        method: "PUT",
        body: JSON.stringify({ departments: draft }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.departments) {
        setSaveError(data?.error || "Could not save the departments.");
        return;
      }
      setSaved(data.departments);
      setDraft(data.departments);
      toast.success("Departments saved");
    } catch {
      setSaveError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (member: Member, department: string) => {
    const before = member.department;
    setMovingUid(member.uid);
    setMembers((prev) => prev && prev.map((m) => (m.uid === member.uid ? { ...m, department } : m)));
    try {
      const res = await authedFetch("/api/organization/member-department", {
        method: "PUT",
        body: JSON.stringify({ uid: member.uid, department }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not change the department.");
      toast.success(`${member.displayName} is now in ${data?.department || department}`);
    } catch (e: any) {
      setMembers((prev) => prev && prev.map((m) => (m.uid === member.uid ? { ...m, department: before } : m)));
      toast.error(e?.message || "Could not change the department.");
    } finally {
      setMovingUid(null);
    }
  };

  // Moving an employee to another manager is the admin's call. The server keeps their login, the
  // roster and pending leave in step, and signs the person out once so it applies.
  const handleReassign = async (member: Member, managerId: string) => {
    const before = member.managerId ?? null;
    const target = leaders.find((l) => l.uid === managerId);
    setReassigningUid(member.uid);
    setMembers((prev) => prev && prev.map((m) => (m.uid === member.uid ? { ...m, managerId } : m)));
    try {
      const res = await authedFetch("/api/organization/member-manager", {
        method: "PUT",
        body: JSON.stringify({ uid: member.uid, managerId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Could not change the manager.");
      const moved = data?.pendingLeaveMoved ? ` ${data.pendingLeaveMoved} pending leave request(s) moved with them.` : "";
      toast.success(`${member.displayName} now reports to ${target?.displayName ?? "the new manager"}.${moved} They will be signed out once.`);
    } catch (e: any) {
      setMembers((prev) => prev && prev.map((m) => (m.uid === member.uid ? { ...m, managerId: before } : m)));
      toast.error(e?.message || "Could not change the manager.");
    } finally {
      setReassigningUid(null);
    }
  };

  // Managers report to themselves; the admin (this viewer) can also be someone's manager.
  const leaders = useMemo(
    () =>
      (members ?? [])
        .filter((m) => m.managerId === m.uid || m.uid === user?.id)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [members, user?.id],
  );

  // A manager sees and moves their team; they cannot move themselves (an admin decides that).
  const people = useMemo(() => {
    if (!members) return [];
    const q = search.trim().toLowerCase();
    return members
      .filter((m) => isOrgAdmin || m.uid !== user?.id)
      .filter((m) => !q || m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [members, search, isOrgAdmin, user?.id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Departments</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isOrgAdmin
            ? "The departments of your organization. Everyone belongs to exactly one."
            : "Move people on your team between the departments your organization admin has set up."}
        </p>
      </div>

      {loadError && (
        <Card className="border-border/80 shadow-sm">
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm font-medium text-[#0E2322]">Couldn't load departments</p>
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={load} className="text-xs">
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {!loadError && saved === null && (
        <div className="space-y-6" aria-busy="true" aria-label="Loading departments">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {!loadError && saved !== null && members !== null && (
        <>
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Your departments</CardTitle>
              <CardDescription className="text-xs">
                {isOrgAdmin
                  ? "A department that still has people in it can't be removed. Move them first."
                  : "Only your organization admin can add or remove departments."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <DepartmentListEditor id="departments-editor" value={draft} onChange={setDraft} disabled={!isOrgAdmin} />
              {isOrgAdmin && (
                <div className="space-y-2">
                  {saveError && (
                    <p role="alert" className="text-xs text-destructive">
                      {saveError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={handleSave}
                      disabled={!changed || saving}
                      className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-1.5" /> Saving...
                        </>
                      ) : (
                        "Save departments"
                      )}
                    </Button>
                    {changed && !saving && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setDraft(saved);
                          setSaveError(null);
                        }}
                        className="border-slate-200 text-xs"
                      >
                        Undo changes
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">People</CardTitle>
              <CardDescription className="text-xs">
                {isOrgAdmin
                  ? "Choose a department and a manager for each person. They can't change their own. Changing a manager signs that person out once; their past check-ins stay where they were."
                  : "Your team. Choose a department for each person."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email"
                  aria-label="Search people"
                  className="h-10 pl-9 text-sm"
                />
              </div>

              {people.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {search ? "No one matches your search." : "No one to show yet. Invite people from the Roster."}
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-border/70">
                    {people.slice(0, PEOPLE_SHOWN).map((m) => {
                      // A person whose saved department is no longer on the list is shown under General.
                      const current = matchDepartment(saved, m.department) ?? DEFAULT_DEPARTMENT;
                      return (
                        <li key={m.uid} className="py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#0E2322] truncate">{m.displayName}</p>
                            <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                            <label className="block">
                              <span className="block text-[11px] text-muted-foreground mb-0.5">Department</span>
                              <select
                                aria-label={`Department for ${m.displayName}`}
                                value={current}
                                disabled={movingUid === m.uid}
                                onChange={(e) => handleMove(m, e.target.value)}
                                className="h-10 w-full sm:w-52 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C0FD9B] disabled:opacity-60 cursor-pointer"
                              >
                                {saved.map((d) => (
                                  <option key={d} value={d}>
                                    {d}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {isOrgAdmin && m.managerId && m.managerId !== m.uid && (
                              <label className="block">
                                <span className="block text-[11px] text-muted-foreground mb-0.5">Manager</span>
                                <select
                                  aria-label={`Manager for ${m.displayName}`}
                                  value={m.managerId}
                                  disabled={reassigningUid === m.uid}
                                  onChange={(e) => handleReassign(m, e.target.value)}
                                  className="h-10 w-full sm:w-52 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C0FD9B] disabled:opacity-60 cursor-pointer"
                                >
                                  {!leaders.some((l) => l.uid === m.managerId) && (
                                    <option value={m.managerId}>Current manager</option>
                                  )}
                                  {leaders.map((l) => (
                                    <option key={l.uid} value={l.uid}>
                                      {l.displayName}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {people.length > PEOPLE_SHOWN && (
                    <p className="text-xs text-muted-foreground">
                      Showing the first {PEOPLE_SHOWN} of {people.length}. Use the search to find the rest.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
