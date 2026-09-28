import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Send,
  Loader2,
  Settings2,
  ExternalLink,
  Shield,
  Clock,
  Info,
  RefreshCw,
  Megaphone,
  FileText,
  Inbox,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getPushPermissionStatus,
  subscribeDeviceToPush,
  unsubscribeDeviceFromPush,
  getExistingPushSubscription,
  isIOS,
  isStandalone,
  PushPermissionStatus,
  PushUserContext,
} from "@/lib/push-client";

/** Crash-proof date formatter for notifications */
function formatNotificationDate(rawDate: any): string {
  if (!rawDate) return "Recently";
  try {
    let dateObj: Date;
    if (typeof rawDate === "string" || typeof rawDate === "number") {
      dateObj = new Date(rawDate);
    } else if (rawDate && typeof rawDate === "object") {
      if ("seconds" in rawDate) {
        dateObj = new Date(rawDate.seconds * 1000);
      } else if ("_seconds" in rawDate) {
        dateObj = new Date(rawDate._seconds * 1000);
      } else {
        dateObj = new Date(rawDate);
      }
    } else {
      dateObj = new Date(rawDate);
    }

    if (isNaN(dateObj.getTime())) {
      return "Recently";
    }

    return dateObj.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Recently";
  }
}

interface PushNotificationManagerProps {
  userContext?: PushUserContext;
  showCard?: boolean;
  onSubscribedChange?: (isSubscribed: boolean) => void;
}

export function PushNotificationManager({
  userContext = { userId: "" },
  showCard = true,
  onSubscribedChange,
}: PushNotificationManagerProps) {
  const [status, setStatus] = useState<PushPermissionStatus>("prompt");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [preferences, setPreferences] = useState({
    pushEnabled: true,
    attendance: true,
    announcements: true,
    assignments: true,
    deadlines: true,
    system: true,
  });

  // Check current device and subscription status
  const checkStatus = useCallback(async () => {
    const currentStatus = getPushPermissionStatus();
    setStatus(currentStatus);

    if (currentStatus === "granted") {
      const sub = await getExistingPushSubscription();
      const active = Boolean(sub);
      setIsSubscribed(active);
      onSubscribedChange?.(active);
    } else {
      setIsSubscribed(false);
      onSubscribedChange?.(false);
    }
  }, [onSubscribedChange]);

  // Load preferences from server
  const loadPreferences = useCallback(async () => {
    if (!userContext.userId) return;
    try {
      const res = await fetch(`/api/push/preferences?userId=${encodeURIComponent(userContext.userId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.preferences) {
          setPreferences(data.preferences);
        }
      }
    } catch {
      // Non-blocking
    }
  }, [userContext.userId]);

  // History state
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<string>("all");

  const loadHistory = useCallback(async () => {
    if (!userContext.userId) return;
    setHistoryLoading(true);
    try {
      const altParam = userContext.studentId ? `&altId=${encodeURIComponent(userContext.studentId)}` : "";
      const res = await fetch(
        `/api/push/notifications?userId=${encodeURIComponent(userContext.userId)}${altParam}`,
      );
      if (res.ok) {
        const data = await res.json();
        setHistory(data.notifications || []);
      }
    } catch {
      // Non-blocking
    } finally {
      setHistoryLoading(false);
    }
  }, [userContext.userId, userContext.studentId]);

  useEffect(() => {
    checkStatus();
    loadPreferences();
    loadHistory();
  }, [checkStatus, loadPreferences, loadHistory]);

  const markAllHistoryRead = async () => {
    try {
      await fetch("/api/push/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userContext.userId, markAllRead: true }),
      });
      setHistory((prev) => prev.map((item) => ({ ...item, isRead: true })));
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark notifications read");
    }
  };

  const markSingleRead = async (notificationId: string) => {
    try {
      await fetch("/api/push/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId, userId: userContext.userId }),
      });
      setHistory((prev) =>
        prev.map((item) => (item.id === notificationId ? { ...item, isRead: true } : item)),
      );
    } catch {
      // Ignore
    }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const result = await subscribeDeviceToPush(userContext);
      setStatus(result.status);
      if (result.success) {
        setIsSubscribed(true);
        onSubscribedChange?.(true);
        toast.success(result.message || "Push notifications enabled!");
      } else {
        if (result.status === "ios_pwa_required") {
          toast.error("Add ChecIN to Home Screen first on iPhone/iPad to enable push notifications.");
        } else {
          toast.error(result.message || "Failed to enable notifications");
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to subscribe device");
    } finally {
      setLoading(false);
      checkStatus();
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    try {
      const ok = await unsubscribeDeviceFromPush(userContext);
      if (ok) {
        setIsSubscribed(false);
        onSubscribedChange?.(false);
        toast.info("Notifications disabled for this device.");
      }
    } catch {
      toast.error("Failed to disable notifications");
    } finally {
      setLoading(false);
      checkStatus();
    }
  };

  const handleTogglePreference = async (key: keyof typeof preferences, val: boolean) => {
    const updated = { ...preferences, [key]: val };
    setPreferences(updated);
    try {
      await fetch("/api/push/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userContext.userId,
          preferences: updated,
        }),
      });
      toast.success("Notification preferences updated");
    } catch {
      toast.error("Failed to save preference");
    }
  };

  const handleSendTest = async () => {
    if (!isSubscribed) {
      toast.error("Please enable push notifications on this device first.");
      return;
    }

    setTesting(true);
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userContext.userId,
          payload: {
            type: "TEST",
            title: "KNUST Attendance Push Verified",
            body: "Real OS/browser push notifications are active and functioning correctly on this device!",
            url: "/student",
            icon: "/favicon.png",
            badge: "/favicon.png",
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.delivered > 0) {
        toast.success("Test notification dispatched! Check your device lockscreen / notifications banner.");
      } else {
        toast.warning(data.error || "Notification dispatched. Ensure browser allows background notifications.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to dispatch test notification");
    } finally {
      setTesting(false);
    }
  };

  // State Card: iOS Safari Home Screen requirement guidance
  if (status === "ios_pwa_required") {
    return (
      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="size-5 text-amber-600" />
            <CardTitle className="text-base text-amber-900 dark:text-amber-200">
              iPhone / iPad Push Notifications Setup
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-amber-800 dark:text-amber-300">
            Apple requires web apps to be installed to the Home Screen to receive push notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
          <ol className="list-decimal pl-4 space-y-1.5 font-medium">
            <li>In Safari, tap the <strong>Share</strong> button at the bottom of the screen.</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
            <li>Launch the new <strong>KNUST Attendance</strong> app icon from your Home Screen.</li>
            <li>Return to this page inside the installed app and tap <strong>Enable Notifications</strong>.</li>
          </ol>
          <div className="pt-2">
            <Badge variant="outline" className="text-amber-800 border-amber-300">
              iOS 16.4+ Web Push Standard
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  // State Card: Unsupported Browser
  if (status === "unsupported") {
    return (
      <Card className="border-slate-200 bg-slate-50 dark:bg-slate-900">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 text-slate-500" />
            <CardTitle className="text-base">Push Notifications Not Supported</CardTitle>
          </div>
          <CardDescription className="text-xs">
            This browser does not support the Web Push API. For the best experience, use modern Chrome, Edge, Firefox, or Safari on iOS 16.4+.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!showCard) {
    return null;
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${isSubscribed ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
              {isSubscribed ? <Bell className="size-5" /> : <BellOff className="size-5" />}
            </div>
            <div>
              <CardTitle className="text-base font-bold">Web Push Notifications</CardTitle>
              <CardDescription className="text-xs">
                Receive real-time alerts on your device lock-screen and notification center.
              </CardDescription>
            </div>
          </div>
          <div>
            {status === "denied" ? (
              <Badge variant="destructive" className="text-xs">
                Blocked in Browser
              </Badge>
            ) : isSubscribed ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-xs">
                <CheckCircle2 className="size-3 mr-1" /> Active on this Device
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Not Enabled
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Permission Action CTA */}
        <div className="p-4 rounded-xl border bg-muted/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              {isSubscribed ? "Device is registered for Push" : "Enable Push for this Device"}
            </p>
            <p className="text-xs text-muted-foreground">
              {status === "denied"
                ? "Notifications are currently blocked. Click the lock/info icon in your browser URL bar to allow notifications."
                : isSubscribed
                ? "You will receive attendance, announcements, and assignment alerts even when the app is closed."
                : "Grant notification permission so your browser can receive background academic alerts."}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isSubscribed ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendTest}
                  disabled={testing}
                  className="text-xs flex items-center gap-1.5"
                >
                  {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  Send Test Alert
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUnsubscribe}
                  disabled={loading}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Disable
                </Button>
              </>
            ) : (
              <Button
                onClick={handleSubscribe}
                disabled={loading || status === "denied"}
                size="sm"
                className="bg-[#00552b] hover:bg-[#00381c] text-white text-xs font-semibold shadow-xs cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Enabling...
                  </>
                ) : (
                  <>
                    <Bell className="size-3.5 mr-1.5" />
                    Enable Notifications
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Notification Category Preferences */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Settings2 className="size-3.5" />
            Alert Preferences
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">Attendance Sessions</span>
                <p className="text-xs text-muted-foreground">When attendance opens or closes</p>
              </div>
              <Switch
                checked={preferences.attendance}
                onCheckedChange={(v) => handleTogglePreference("attendance", v)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">Course Announcements</span>
                <p className="text-xs text-muted-foreground">Lecturer messages and updates</p>
              </div>
              <Switch
                checked={preferences.announcements}
                onCheckedChange={(v) => handleTogglePreference("announcements", v)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">New Assignments</span>
                <p className="text-xs text-muted-foreground">When coursework is posted</p>
              </div>
              <Switch
                checked={preferences.assignments}
                onCheckedChange={(v) => handleTogglePreference("assignments", v)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">Deadlines & Reminders</span>
                <p className="text-xs text-muted-foreground">Upcoming due dates and expirations</p>
              </div>
              <Switch
                checked={preferences.deadlines}
                onCheckedChange={(v) => handleTogglePreference("deadlines", v)}
              />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Notification History Feed                                          */}
        {/* ------------------------------------------------------------------ */}
        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Clock className="size-3.5 text-primary" />
                Notification History ({history.length})
              </div>
              {history.some((h) => !h.isRead) && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary font-semibold">
                  {history.filter((h) => !h.isRead).length} Unread
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {history.some((h) => !h.isRead) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllHistoryRead}
                  className="text-xs h-7 text-muted-foreground hover:text-foreground"
                >
                  Mark all as read
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={loadHistory}
                disabled={historyLoading}
                className="text-xs h-7 gap-1"
              >
                <RefreshCw className={`size-3 ${historyLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
            {[
              { id: "all", label: "All Alerts" },
              { id: "ANNOUNCEMENT", label: "Announcements" },
              { id: "ASSIGNMENT", label: "Assignments" },
              { id: "ATTENDANCE", label: "Attendance" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setHistoryFilter(f.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors shrink-0 ${
                  historyFilter === f.id
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* List of Notification History Records */}
          <div className="rounded-xl border divide-y overflow-hidden bg-background">
            {historyLoading && history.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                <Loader2 className="size-5 animate-spin mx-auto text-primary" />
                <p>Loading notification history...</p>
              </div>
            ) : history.filter((item) => (historyFilter === "all" ? true : item.type?.toUpperCase() === historyFilter.toUpperCase())).length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                <Inbox className="size-8 text-muted-foreground/40 mx-auto" />
                <p className="font-semibold text-foreground text-sm">No notification records yet</p>
                <p className="max-w-xs mx-auto text-muted-foreground">
                  When your course lecturers post announcements, assign coursework, or open attendance sessions, they will be logged here and sent directly to your phone.
                </p>
              </div>
            ) : (
              history
                .filter((item) => (historyFilter === "all" ? true : item.type?.toUpperCase() === historyFilter.toUpperCase()))
                .map((n) => {
                  const isAnnouncement = n.type?.toUpperCase() === "ANNOUNCEMENT";
                  const isAssignment = n.type?.toUpperCase() === "ASSIGNMENT";
                  const isAttendance = n.type?.toUpperCase() === "ATTENDANCE";

                  return (
                    <div
                      key={n.id}
                      className={`p-3.5 sm:p-4 flex items-start gap-3 transition-colors ${
                        !n.isRead ? "bg-primary/5 font-medium" : "hover:bg-muted/30"
                      }`}
                    >
                      <div
                        className={`size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isAnnouncement
                            ? "bg-blue-100 text-blue-700"
                            : isAssignment
                            ? "bg-amber-100 text-amber-700"
                            : isAttendance
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isAnnouncement ? (
                          <Megaphone className="size-4" />
                        ) : isAssignment ? (
                          <FileText className="size-4" />
                        ) : (
                          <Bell className="size-4" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground truncate">
                              {n.title}
                            </span>
                            {!n.isRead && (
                              <span className="size-2 rounded-full bg-primary shrink-0" />
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
                            <Clock className="size-3" />
                            {formatNotificationDate(n.createdAt)}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed break-words">
                          {n.body}
                        </p>

                        <div className="pt-1 flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 uppercase font-semibold">
                            {n.type || "UPDATE"}
                          </Badge>
                          {n.url && typeof n.url === "string" && n.url !== "#" && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!n.isRead) markSingleRead(n.id);
                                const safeUrl = String(n.url || "").trim();
                                if (!safeUrl) return;
                                if (safeUrl.startsWith("http://") || safeUrl.startsWith("https://")) {
                                  window.open(safeUrl, "_blank", "noopener,noreferrer");
                                } else {
                                  window.location.assign(safeUrl);
                                }
                              }}
                              className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-semibold cursor-pointer"
                            >
                              Open Update <ExternalLink className="size-3" />
                            </button>
                          )}
                          {!n.isRead && (
                            <button
                              type="button"
                              onClick={() => markSingleRead(n.id)}
                              className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              Mark as read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** In-App Notification Center Drawer / Dropdown */
export function InAppNotificationCenter({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/push/notifications?userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAllRead = async () => {
    try {
      await fetch("/api/push/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // Ignore
    }
  };

  const handleOpenAlert = async (item: any) => {
    setSelectedAlert(item);
    setOpen(false);
    if (!item.isRead) {
      try {
        await fetch("/api/push/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId: item.id, userId }),
        });
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
        );
      } catch {
        // Ignore
      }
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          setOpen(!open);
          if (!open) fetchNotifications();
        }}
        className="relative text-foreground hover:bg-muted cursor-pointer"
        title="Notifications"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex size-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full size-2.5 bg-emerald-600"></span>
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border bg-popover text-popover-foreground shadow-xl z-50 overflow-hidden">
          <div className="p-3.5 border-b flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-primary" />
              <span className="font-bold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-primary hover:underline font-medium cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y">
            {loading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                <Loader2 className="size-5 animate-spin mx-auto mb-2" />
                Loading alerts...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-1">
                <CheckCircle2 className="size-7 text-muted-foreground/50 mx-auto" />
                <p className="font-medium">All caught up!</p>
                <p>No new alerts at this time.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleOpenAlert(n)}
                  className={`w-full text-left p-3.5 flex items-start gap-3 hover:bg-muted/50 transition-colors block cursor-pointer ${
                    !n.isRead ? "bg-primary/5" : ""
                  }`}
                >
                  <div
                    className="mt-1 size-2 rounded-full shrink-0 bg-primary"
                    style={{ opacity: n.isRead ? 0 : 1 }}
                  />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-semibold leading-tight text-foreground truncate">
                        {n.title}
                      </p>
                      {n.type && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 uppercase shrink-0 font-medium">
                          {n.type}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug line-clamp-2 break-words">
                      {n.body}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-1">
                      <Clock className="size-3 shrink-0" />
                      <span>{formatNotificationDate(n.createdAt)}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Full Notification Detail Modal */}
      <Dialog
        open={Boolean(selectedAlert)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelectedAlert(null);
        }}
      >
        <DialogContent className="sm:max-w-md p-5 sm:p-6">
          <DialogHeader className="space-y-2 text-left pb-2 border-b">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs font-semibold uppercase bg-primary/10 text-primary">
                {selectedAlert?.type || "Notice"}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="size-3" />
                {formatNotificationDate(selectedAlert?.createdAt)}
              </span>
            </div>
            <DialogTitle className="text-base sm:text-lg font-bold text-foreground leading-snug">
              {selectedAlert?.title || "Notification"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {selectedAlert?.type ? `${selectedAlert.type} alert details` : "Notification details"}
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <div className="p-3.5 rounded-xl bg-muted/40 border text-xs sm:text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
              {selectedAlert?.body || "No details provided."}
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedAlert(null)}
              className="w-full sm:w-auto text-xs"
            >
              Close
            </Button>

            {selectedAlert?.url &&
              typeof selectedAlert.url === "string" &&
              selectedAlert.url !== "#" &&
              selectedAlert.url !== "/" && (
                <Button
                  size="sm"
                  onClick={() => {
                    const targetUrl = String(selectedAlert.url || "").trim();
                    setSelectedAlert(null);
                    if (!targetUrl) return;
                    if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
                      window.open(targetUrl, "_blank", "noopener,noreferrer");
                    } else {
                      window.location.assign(targetUrl);
                    }
                  }}
                  className="w-full sm:w-auto text-xs gap-1.5 font-semibold"
                >
                  <span>View Related Page</span>
                  <ExternalLink className="size-3.5" />
                </Button>
              )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Compact Student Portal Phone Push Notification Banner
 * Prominently prompts students to enable mobile push alerts for announcements & assignments.
 */
export function StudentPushBanner({
  userContext,
  onOpenNotificationsTab,
}: {
  userContext: PushUserContext;
  onOpenNotificationsTab?: () => void;
}) {
  const [status, setStatus] = useState<PushPermissionStatus>("prompt");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const s = getPushPermissionStatus();
    setStatus(s);
    if (s === "granted") {
      getExistingPushSubscription().then((sub) => {
        setIsSubscribed(Boolean(sub));
      });
    }
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    try {
      const res = await subscribeDeviceToPush(userContext);
      if (res.success) {
        setIsSubscribed(true);
        setStatus("granted");
        toast.success("Phone notifications activated! Test alert dispatched.");
        // Trigger a test alert to phone
        fetch("/api/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userContext.userId,
            payload: {
              type: "GENERAL",
              title: "🔔 Alerts Connected!",
              body: "You will now receive lecturer announcements and assignments on this phone.",
              url: "/student",
            },
          }),
        }).catch(() => {});
      } else if (res.status === "ios_pwa_required") {
        toast.info(
          "On iPhone/iPad, please tap Share (⎋) and select 'Add to Home Screen' to enable phone alerts.",
          { duration: 7000 },
        );
      } else {
        toast.error(res.message || "Failed to activate phone notifications");
      }
    } catch {
      toast.error("An error occurred while enabling notifications");
    } finally {
      setLoading(false);
    }
  };

  if (dismissed) return null;

  if (isSubscribed) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 px-3.5 py-2 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">
            Phone notifications are active — you will receive lecturer updates directly to this device.
          </span>
        </div>
        {onOpenNotificationsTab && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenNotificationsTab}
            className="text-[11px] h-6 px-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/40"
          >
            Preferences
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-primary/20 bg-linear-to-r from-primary/10 via-background to-primary/5 p-4 sm:p-5 shadow-xs transition-all">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-primary text-primary-foreground shrink-0 shadow-xs">
            <Bell className="size-5 animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                Get Lecturer Announcements & Assignments on your Phone
              </h3>
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0 font-semibold">
                Recommended
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              Turn on push notifications so your device receives class notices, coursework postings, and attendance session alerts in real-time, even when the app is closed.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 pt-1 sm:pt-0">
          <Button
            onClick={handleEnable}
            disabled={loading || status === "denied"}
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold w-full sm:w-auto h-9 gap-1.5 shadow-xs"
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Connecting Phone...
              </>
            ) : (
              <>
                <Smartphone className="size-3.5" />
                Turn On Phone Alerts
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="text-xs text-muted-foreground hover:text-foreground h-9 px-2.5"
          >
            Later
          </Button>
        </div>
      </div>
    </div>
  );
}
