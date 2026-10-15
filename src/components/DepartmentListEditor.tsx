import { useState } from "react";
import { Lock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_DEPARTMENT,
  MAX_DEPARTMENTS,
  MAX_DEPARTMENT_NAME,
  SUGGESTED_DEPARTMENTS,
  buildDepartmentList,
  cleanDepartmentName,
  matchDepartment,
} from "@/lib/departments";

interface Props {
  id: string;
  /** The whole list, "General" first. */
  value: string[];
  onChange: (list: string[]) => void;
  disabled?: boolean;
  /** Tap-to-add suggestions, for the sign-up screen. */
  showSuggestions?: boolean;
}

/**
 * Edit an organization's departments: add by typing, remove with the cross, or tap a suggestion.
 * "General" is always there and cannot be removed. Used at sign-up and on the Departments page.
 */
export function DepartmentListEditor({ id, value, onChange, disabled, showSuggestions }: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = (raw: string) => {
    const name = cleanDepartmentName(raw);
    if (!name) return;
    const existing = matchDepartment(value, name);
    if (existing) {
      setError(`"${existing}" is already on your list.`);
      return;
    }
    const built = buildDepartmentList([...value, name]);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    setDraft("");
    onChange(built.list);
  };

  const remove = (name: string) => {
    setError(null);
    onChange(value.filter((d) => d !== name));
  };

  const suggestions = showSuggestions
    ? SUGGESTED_DEPARTMENTS.filter((s) => !matchDepartment(value, s))
    : [];
  const full = value.length >= MAX_DEPARTMENTS;

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2" aria-label="Departments">
        {value.map((name) => {
          const locked = name === DEFAULT_DEPARTMENT;
          return (
            <li
              key={name}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                locked ? "bg-slate-100 text-slate-700" : "bg-[#CBEED3] text-[#0E2322]"
              }`}
            >
              {locked && <Lock className="size-3" aria-hidden="true" />}
              <span className="break-words">{name}</span>
              {!locked && !disabled && (
                <button
                  type="button"
                  onClick={() => remove(name)}
                  aria-label={`Remove ${name}`}
                  className="-mr-1 rounded-full p-1 hover:bg-white/60 cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {!disabled && (
        <>
          <div className="flex gap-2">
            <Input
              id={id}
              value={draft}
              maxLength={MAX_DEPARTMENT_NAME}
              placeholder={full ? "The list is full" : "Add a department, e.g. Marketing"}
              disabled={full}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add(draft);
                }
              }}
              className="h-10 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => add(draft)}
              disabled={full || !cleanDepartmentName(draft)}
              className="h-10 shrink-0 border-slate-200 text-xs"
            >
              <Plus className="size-4 mr-1" /> Add
            </Button>
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          {suggestions.length > 0 && !full && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Tap to add:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => add(s)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {value.length} of {MAX_DEPARTMENTS}. "{DEFAULT_DEPARTMENT}" is always there for people not yet placed.
          </p>
        </>
      )}
    </div>
  );
}
