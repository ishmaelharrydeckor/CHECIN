import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { shortcutsFor, type ShortcutDef } from "@/lib/shortcuts";

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {keys.map((k, i) =>
        k === "then" || k === "and" || k === "to" ? (
          <span key={i} className="text-xs text-slate-500">
            {k}
          </span>
        ) : (
          <kbd key={i} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-[#0E2322]">
            {k}
          </kbd>
        ),
      )}
    </span>
  );
}

function Group({ title, rows }: { title: string; rows: ShortcutDef[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-[#0E2322]">{title}</h3>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {rows.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-4 px-3 py-2">
            <span className="text-sm text-[#0E2322]">{s.label}</span>
            <Keys keys={s.keys} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The card shown by "?". It lists only what this person can use, from the same table the keys are read from. */
export function ShortcutsHelp({ open, onOpenChange, canManage }: { open: boolean; onOpenChange: (open: boolean) => void; canManage: boolean }) {
  const all = shortcutsFor(canManage);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>
          They do nothing while you are typing in a box. You can switch the single-letter ones off in My account.
        </DialogDescription>
        <div className="space-y-5">
          <Group title="Everyone" rows={all.filter((s) => s.tier === 1)} />
          <Group title="Daily work" rows={all.filter((s) => s.tier === 2)} />
          <Group title="Reviewing the work diary" rows={all.filter((s) => s.tier === 3)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
