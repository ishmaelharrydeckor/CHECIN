import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildTimezoneOptions, clockIn, searchTimezones, suggestedInstead, withZone } from "@/lib/timezone-options";

interface Props {
  id: string;
  /** The IANA name currently chosen, e.g. "Africa/Lagos". */
  value: string;
  onChange: (zone: string) => void;
  /** The zone the person's device reports, used to warn when the organization is on UTC by mistake. */
  detected?: string | null;
}

/**
 * Pick the organization's timezone by searching for a city or country, instead of typing a technical
 * name. Shows the time there right now, so a wrong choice is obvious at a glance.
 */
export function TimezonePicker({ id, value, onChange, detected }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The clock only runs in the browser: rendering it on the server would not match and React would complain.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const baseOptions = useMemo(
    () =>
      buildTimezoneOptions(
        typeof Intl !== "undefined" && (Intl as any).supportedValuesOf
          ? ((Intl as any).supportedValuesOf("timeZone") as string[])
          : ["Africa/Accra"],
        new Date(),
      ),
    [],
  );
  // The stored value stays choosable even if this browser lists the same place under another spelling.
  const options = useMemo(() => withZone(baseOptions, value, new Date()), [baseOptions, value]);
  const selected = options.find((o) => o.id === value) ?? null;
  const shown = useMemo(() => searchTimezones(options, query), [options, query]);
  const there = now && selected ? clockIn(selected.id, now) : "";
  const suggestion = now ? suggestedInstead(value, detected ?? null, now) : null;
  const suggestedLabel = suggestion ? (options.find((o) => o.id === suggestion)?.label ?? suggestion) : "";

  return (
    <div className="space-y-1.5">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 w-full justify-between text-sm font-normal"
          >
            <span className="truncate text-left">{selected ? selected.label : value ? `${value} (not recognised)` : "Choose a timezone"}</span>
            <span className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
              {selected && <span>{selected.offsetLabel}</span>}
              <ChevronsUpDown className="size-3.5 opacity-60" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="p-0" style={{ width: "var(--radix-popover-trigger-width)", minWidth: 260 }}>
          {/* Our own search matches city, country, zone name and offset, so the built-in filter is off. */}
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search a city or country" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>No match. Try a city or a country.</CommandEmpty>
              <CommandGroup>
                {shown.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={o.id}
                    onSelect={() => {
                      onChange(o.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check className={`mr-2 size-4 ${o.id === value ? "opacity-100" : "opacity-0"}`} />
                    <span className="flex-1 truncate">{o.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{o.offsetLabel}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {there && (
        <p className="text-[11px] text-muted-foreground">
          It is {there} there now. Check that this matches the clock where your team works.
        </p>
      )}

      {suggestion && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-100 px-2.5 py-1.5 text-[11px] text-amber-900">
          <span>
            Your organization is set to UTC, but this device looks like it is in {suggestedLabel}. Late times and daily
            totals follow this setting.
          </span>
          <button
            type="button"
            onClick={() => onChange(suggestion)}
            className="font-semibold underline underline-offset-2"
          >
            Use {suggestedLabel}
          </button>
        </div>
      )}
    </div>
  );
}
