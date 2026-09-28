import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, Plus, Users, Trash2, Pencil, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/departments")({
  head: () => ({ meta: [{ title: "Workforce Departments & Teams — ChecIN" }] }),
  component: DepartmentsPage,
});

interface Department {
  id: string;
  name: string;
  code: string;
  leadName: string;
  memberCount: number;
}

const INITIAL_DEPARTMENTS: Department[] = [
  {
    id: "dept-1",
    name: "Engineering & IT",
    code: "ENG",
    leadName: "Kwame Mensah",
    memberCount: 14,
  },
  {
    id: "dept-2",
    name: "Operations & Facilities",
    code: "OPS",
    leadName: "Abena Poku",
    memberCount: 8,
  },
  {
    id: "dept-3",
    name: "Finance & Accounting",
    code: "FIN",
    leadName: "David Osei",
    memberCount: 5,
  },
  {
    id: "dept-4",
    name: "People & Human Resources",
    code: "HR",
    leadName: "Ama Serwaa",
    memberCount: 4,
  },
];

function DepartmentsPage() {
  const { user, isOrgAdmin } = useAuth();
  const [departments, setDepartments] = useState<Department[]>(INITIAL_DEPARTMENTS);
  const [isAdding, setIsAdding] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [deptLead, setDeptLead] = useState("");

  const handleAddDept = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim() || !deptCode.trim()) {
      toast.error("Please provide both a department name and short code.");
      return;
    }

    const newDept: Department = {
      id: `dept-${Date.now()}`,
      name: deptName.trim(),
      code: deptCode.trim().toUpperCase(),
      leadName: deptLead.trim() || "Unassigned",
      memberCount: 0,
    };

    setDepartments([...departments, newDept]);
    setDeptName("");
    setDeptCode("");
    setDeptLead("");
    setIsAdding(false);
    toast.success(`Department "${newDept.name}" created!`);
  };

  const handleDelete = (id: string) => {
    setDepartments(departments.filter((d) => d.id !== id));
    toast.success("Department removed.");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">
            Departments &amp; Teams
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Organize workforce rosters, shift groupings, and assigned team managers.
          </p>
        </div>
        {isOrgAdmin && !isAdding && (
          <Button
            onClick={() => setIsAdding(true)}
            className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
          >
            <Plus className="size-4 mr-1.5" /> Add Department
          </Button>
        )}
      </div>

      {/* Add Department Form */}
      {isAdding && (
        <Card className="border-border/80 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Create New Department</CardTitle>
            <CardDescription className="text-xs">
              Employees can be assigned to this department for team-level timesheet reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddDept} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="dept-name" className="text-xs font-medium">
                    Department Name
                  </Label>
                  <Input
                    id="dept-name"
                    placeholder="e.g. Product Design"
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                    className="h-10 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dept-code" className="text-xs font-medium">
                    Code (Short identifier)
                  </Label>
                  <Input
                    id="dept-code"
                    placeholder="e.g. DES"
                    value={deptCode}
                    onChange={(e) => setDeptCode(e.target.value)}
                    className="h-10 text-sm uppercase"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dept-lead" className="text-xs font-medium">
                    Assigned Team Manager
                  </Label>
                  <Input
                    id="dept-lead"
                    placeholder="e.g. Kwame Mensah"
                    value={deptLead}
                    onChange={(e) => setDeptLead(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAdding(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                >
                  Create Department
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Departments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {departments.map((dept) => (
          <Card key={dept.id} className="border-border/70 shadow-sm hover:shadow-md transition">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="size-10 rounded-xl bg-slate-100 flex items-center justify-center text-[#0E2322] font-bold text-sm">
                  {dept.code}
                </div>
                {isOrgAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(dept.id)}
                    className="text-muted-foreground hover:text-rose-600 h-8 w-8 p-0"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>

              <div className="mt-4">
                <h3 className="font-semibold text-base text-[#0E2322]">{dept.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Lead: {dept.leadName}</p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <Users className="size-3.5 text-slate-500" /> {dept.memberCount} members
                </span>
                <Badge className="bg-[#E8FCE4] text-[#122300] border-none text-[11px] font-medium">
                  Active
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
