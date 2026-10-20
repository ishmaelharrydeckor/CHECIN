import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, type LucideIcon } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { badgeLabel, badgeText } from "@/lib/nav-helpers";

export interface JumpItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** How many things are waiting on that page (0 for none). */
  count?: number;
}

/**
 * "Jump to": a search over the pages in the person's own menu, opened by the button or Ctrl/Cmd+K. It lists
 * only the pages the menu already shows them, so it can never lead anywhere the menu would not.
 */
export function JumpTo({ items }: { items: JumpItem[] }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    navigate({ to: to as never });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Jump to a page"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-500 hover:bg-slate-50 transition focus:outline-none"
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden lg:inline">Jump to</span>
        <kbd className="hidden lg:inline rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-medium text-slate-500">Ctrl K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">Jump to a page</DialogTitle>
        <DialogDescription className="sr-only">Type a page name, then press Enter to open it.</DialogDescription>
        <CommandInput placeholder="Jump to a page…" />
        <CommandList>
          <CommandEmpty>No page with that name.</CommandEmpty>
          <CommandGroup heading="Pages">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem key={item.to} value={item.label} onSelect={() => go(item.to)} className="cursor-pointer">
                  <Icon className="mr-2 size-4" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {(item.count ?? 0) > 0 && (
                    <span aria-label={badgeLabel(item.count ?? 0)} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                      {badgeText(item.count ?? 0)}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
