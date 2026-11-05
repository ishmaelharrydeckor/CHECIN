/**
 * An organization's list of departments.
 *
 * The organization admin owns the list (set at sign-up, edited on the Departments page). A person's
 * department is always one name from that list, set by the server: never typed by the person
 * themselves. "General" is always in the list so nobody is ever left without a department and the
 * list is never empty.
 *
 * Pure rules, shared by the server routes and the screens. No Firebase here.
 */

export const DEFAULT_DEPARTMENT = "General";
export const MAX_DEPARTMENTS = 30;
export const MAX_DEPARTMENT_NAME = 40;

/** Tap-to-add suggestions on the sign-up screen. Only suggestions: the admin can add their own. */
export const SUGGESTED_DEPARTMENTS: readonly string[] = [
  "Operations",
  "Finance",
  "Human Resources",
  "Sales",
  "Customer Service",
  "IT",
  "Administration",
  "Production",
];

/** Trims, collapses repeated spaces and drops control characters. Not a string gives "". */
export function cleanDepartmentName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type DepartmentListResult = { ok: true; list: string[] } | { ok: false; error: string };

/**
 * Turns whatever the admin sent into the stored list: cleaned, no blanks, no duplicates (ignoring
 * upper/lower case, the first spelling wins), "General" first. Refuses a name that is too long or
 * more than 30 departments, rather than quietly cutting them.
 */
export function buildDepartmentList(raw: unknown): DepartmentListResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Please send the departments as a list." };
  }
  const seen = new Set<string>([DEFAULT_DEPARTMENT.toLowerCase()]);
  const list: string[] = [DEFAULT_DEPARTMENT];
  for (const item of raw) {
    const name = cleanDepartmentName(item);
    if (!name) continue;
    if (name.length > MAX_DEPARTMENT_NAME) {
      return {
        ok: false,
        error: `A department name can have at most ${MAX_DEPARTMENT_NAME} characters ("${name.slice(0, 20)}..." is too long).`,
      };
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(name);
  }
  if (list.length > MAX_DEPARTMENTS) {
    return { ok: false, error: `An organization can have at most ${MAX_DEPARTMENTS} departments.` };
  }
  return { ok: true, list };
}

/** The list's own spelling of `name` (ignoring upper/lower case), or null if it is not in the list. */
export function matchDepartment(list: readonly string[], name: unknown): string | null {
  const wanted = cleanDepartmentName(name).toLowerCase();
  if (!wanted) return null;
  return list.find((d) => d.toLowerCase() === wanted) ?? null;
}

/** Reads the list saved on the organization. Anything unexpected falls back to just "General". */
export function storedDepartments(value: unknown): string[] {
  const built = buildDepartmentList(value);
  return built.ok ? built.list : [DEFAULT_DEPARTMENT];
}

/**
 * For organizations created before the list existed: the distinct departments people already have,
 * so nothing disappears. Names that would not be allowed today (too long) are skipped.
 */
export function departmentsInUse(values: readonly unknown[]): string[] {
  const usable = values.filter((v) => {
    const name = cleanDepartmentName(v);
    return name.length > 0 && name.length <= MAX_DEPARTMENT_NAME;
  });
  const built = buildDepartmentList(usable);
  if (built.ok) return built.list;
  // Too many distinct names: keep the first ones that fit. Still starts with "General".
  const capped = buildDepartmentList(usable.slice(0, MAX_DEPARTMENTS - 1));
  return capped.ok ? capped.list.slice(0, MAX_DEPARTMENTS) : [DEFAULT_DEPARTMENT];
}
