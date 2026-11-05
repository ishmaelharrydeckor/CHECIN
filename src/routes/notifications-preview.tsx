import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { NotificationBellView } from "@/components/notifications/NotificationBell";
import { NotificationList } from "@/components/notifications/NotificationList";
import { NotificationPreferencesCard, NotificationPreferencesView } from "@/components/notifications/NotificationPreferencesCard";
import { DevicePushCard } from "@/components/notifications/DevicePushCard";
import { useNotifications, type NotificationsData } from "@/components/notifications/useNotifications";
import type { DevicePushState, NotificationItem, NotificationPrefs } from "@/lib/notifications";

/**
 * TEMPORARY PREVIEW (task 2.6). Delete this route once the bell, inbox and
 * cards are wired to the real data.
 *
 * Shows every state of the notification screens. The bell and preferences in
 * "Try it" use the real hook (sample data); the rest are fixed states.
 */
export const Route = createFileRoute("/notifications-preview")({
  head: () => ({
    meta: [
      { title: "Notifications preview — ChecIN" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsPreviewPage,
});

const noop = () => {};

function fixed(partial: Partial<NotificationsData>): NotificationsData {
  return {
    items: [],
    unreadCount: 0,
    loading: false,
    error: null,
    hasMore: false,
    loadMore: noop,
    markRead: noop,
    markAllRead: noop,
    refresh: noop,
    ...partial,
  };
}

const PREFS_SAMPLE: NotificationPrefs = { pushEnabled: true, announcements: true, leave: true, shifts: true, account: false };
const DEVICE_STATES: DevicePushState[] = ["on", "off", "blocked", "ios_needs_home_screen", "unsupported"];

function NotificationsPreviewPage() {
  const live = useNotifications({ pageSize: 5 });
  const many: NotificationsData = fixed({ ...live, unreadCount: 14 });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0E2322]">
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
          <p className="font-semibold">Temporary preview (task 2.6)</p>
          <p>Sample data only. The integrator deletes this page after connecting the real notifications.</p>
        </div>

        <Section title="Try it" note="The bell and the settings card with the sample data. Click an item, Mark all read, or the switches.">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Labelled label="Bell (sample data, opens a short list of 5)">
              <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3">
                <NotificationBellView data={live} onNavigate={noop} />
                <p className="text-xs text-muted-foreground">Bell in the top bar</p>
              </div>
            </Labelled>
            <Labelled label="Preferences (sample data)">
              <NotificationPreferencesCard />
            </Labelled>
          </div>
        </Section>

        <Section title="Bell badge" note="No badge at 0, the number up to 9, then 9+.">
          <div className="flex flex-wrap items-center gap-6 rounded-xl border border-slate-200 bg-white p-4">
            <NotificationBellView data={fixed({})} onNavigate={noop} />
            <NotificationBellView data={fixed({ unreadCount: 3 })} onNavigate={noop} />
            <NotificationBellView data={many} onNavigate={noop} />
          </div>
        </Section>

        <Section title="Notification list" note="Loading, empty, error and filled (unread look different from read).">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Labelled label="loading">
              <ListCard>
                <NotificationList items={[]} loading error={null} onRetry={noop} onOpen={noop} />
              </ListCard>
            </Labelled>
            <Labelled label="empty">
              <ListCard>
                <NotificationList items={[]} loading={false} error={null} onRetry={noop} onOpen={noop} />
              </ListCard>
            </Labelled>
            <Labelled label="error">
              <ListCard>
                <NotificationList
                  items={[]}
                  loading={false}
                  error="Couldn't load your notifications."
                  onRetry={noop}
                  onOpen={noop}
                />
              </ListCard>
            </Labelled>
            <Labelled label="filled (inbox style, with mark read)">
              <ListCard>
                <NotificationList
                  items={live.items as NotificationItem[]}
                  loading={live.loading}
                  error={null}
                  onRetry={noop}
                  onOpen={(item) => live.markRead(item.id)}
                  onMarkRead={live.markRead}
                />
              </ListCard>
            </Labelled>
          </div>
        </Section>

        <Section title="Preferences card" note="Loading, error, push off (categories greyed), push on.">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Labelled label="loading">
              <NotificationPreferencesView prefs={null} loading error={null} saving={false} onChange={noop} onRetry={noop} />
            </Labelled>
            <Labelled label="error">
              <NotificationPreferencesView
                prefs={null}
                loading={false}
                error="Couldn't load your notification settings."
                saving={false}
                onChange={noop}
                onRetry={noop}
              />
            </Labelled>
            <Labelled label="push off">
              <NotificationPreferencesView
                prefs={{ ...PREFS_SAMPLE, pushEnabled: false }}
                loading={false}
                error={null}
                saving={false}
                onChange={noop}
                onRetry={noop}
              />
            </Labelled>
            <Labelled label="push on">
              <NotificationPreferencesView prefs={PREFS_SAMPLE} loading={false} error={null} saving={false} onChange={noop} onRetry={noop} />
            </Labelled>
          </div>
        </Section>

        <Section title="This device" note="Every state of DevicePushCard, plus loading, sending a test and an error.">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {DEVICE_STATES.map((state) => (
              <Labelled key={state} label={state}>
                <DevicePushCard state={state} onTurnOn={noop} onTurnOff={noop} onSendTest={noop} />
              </Labelled>
            ))}
            <Labelled label="loading">
              <DevicePushCard state="off" loading onTurnOn={noop} onTurnOff={noop} onSendTest={noop} />
            </Labelled>
            <Labelled label="on, sending a test">
              <DevicePushCard state="on" testing onTurnOn={noop} onTurnOff={noop} onSendTest={noop} />
            </Labelled>
            <Labelled label="on, test failed">
              <DevicePushCard
                state="on"
                errorMessage="The test didn't arrive. Check that notifications are allowed, then try again."
                onRetry={noop}
                onTurnOn={noop}
                onTurnOff={noop}
                onSendTest={noop}
              />
            </Labelled>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-[#0E2322]">{title}</h2>
        <p className="text-xs text-slate-500">{note}</p>
      </div>
      {children}
    </section>
  );
}

function ListCard({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">{children}</div>;
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      {children}
    </div>
  );
}
