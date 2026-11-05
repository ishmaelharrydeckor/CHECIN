import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationPrefs } from "@/lib/notifications";
import { useNotificationPrefs } from "./useNotifications";

/** The preferences card for the Account page (task 2.6). The integrator mounts it. */
export function NotificationPreferencesCard() {
  const { prefs, loading, error, saving, setPref, refresh } = useNotificationPrefs();
  return (
    <NotificationPreferencesView
      prefs={prefs}
      loading={loading}
      error={error}
      saving={saving}
      onChange={setPref}
      onRetry={refresh}
    />
  );
}

/** The card drawn from data passed in, so every state can be previewed. */
export function NotificationPreferencesView({
  prefs,
  loading,
  error,
  saving,
  onChange,
  onRetry,
}: {
  prefs: NotificationPrefs | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  onChange: (key: "pushEnabled" | NotificationCategory, value: boolean) => void;
  onRetry: () => void;
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Notifications</CardTitle>
        <CardDescription className="text-xs">
          Choose what ChecIN tells you about. These settings apply to all your devices. Your inbox keeps everything either way.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            <span className="sr-only">Loading your notification settings…</span>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error || !prefs ? (
          <div className="py-6 text-center space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {error ?? "Couldn't load your notification settings."}
            </p>
            <Button type="button" variant="outline" onClick={onRetry} className="h-10 border-slate-200 text-xs">
              Try again
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0E2322]">
                  Push notifications are {prefs.pushEnabled ? "on" : "off"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {prefs.pushEnabled
                    ? "You get the kinds switched on below on your devices."
                    : "Nothing is pushed to your devices. New items still appear in your inbox."}
                </p>
              </div>
              <Switch
                aria-label="Push notifications"
                checked={prefs.pushEnabled}
                disabled={saving}
                onCheckedChange={(v) => onChange("pushEnabled", v)}
              />
            </div>

            <ul className="divide-y divide-border/70 rounded-xl border border-slate-200 px-4">
              {NOTIFICATION_CATEGORIES.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-4 py-3">
                  <div className={`min-w-0 ${prefs.pushEnabled ? "" : "opacity-60"}`}>
                    <p className="text-sm font-medium text-[#0E2322]">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.note}</p>
                  </div>
                  <Switch
                    aria-label={c.label}
                    checked={prefs[c.key]}
                    disabled={saving || !prefs.pushEnabled}
                    onCheckedChange={(v) => onChange(c.key, v)}
                  />
                </li>
              ))}
            </ul>

            <ul className="divide-y divide-border/70 rounded-xl border border-dashed border-slate-200 px-4" aria-label="Other channels">
              {["Email", "SMS"].map((channel) => (
                <li key={channel} className="flex items-center justify-between gap-4 py-3 text-slate-400">
                  <p className="text-sm font-medium">{channel}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                    Coming later
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
