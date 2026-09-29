import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { firebaseAuth } from "@/integrations/firebase/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Megaphone,
  Plus,
  Send,
  Loader2,
  Trash2,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/announcements")({
  head: () => ({
    meta: [
      { title: "Notices & Announcements — ChecIN" },
      {
        name: "description",
        content: "Broadcast company notices, holiday announcements, and team shift alerts.",
      },
    ],
  }),
  component: AnnouncementsPage,
});

interface Announcement {
  id: string;
  title: string;
  body: string;
  scope: string;
  author: string;
  authorUid?: string;
  createdAt: string;
  isImportant: boolean;
}

function AnnouncementsPage() {
  const { user, isOrgAdmin, isManager } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<"Organization-wide" | "Team">("Organization-wide");
  const [isImportant, setIsImportant] = useState(false);

  const canPost = isOrgAdmin || isManager;

  const fetchNotices = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const headers: Record<string, string> = {};
      const currentUser = firebaseAuth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      }

      const res = await fetch("/api/announcements/", { headers });
      const data = await res.json();
      if (res.ok && Array.isArray(data.announcements)) {
        setAnnouncements(data.announcements);
      } else {
        setAnnouncements([]);
      }
    } catch (err) {
      console.error("Failed to load announcements:", err);
      toast.error("Could not load notices.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, [user?.id]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("Please provide both a title and message content.");
      return;
    }

    setSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const currentUser = firebaseAuth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      }

      const res = await fetch("/api/announcements/", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          scope: isOrgAdmin ? scope : "Team",
          isImportant,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to publish notice");
      }

      if (data.announcement) {
        setAnnouncements([data.announcement, ...announcements]);
      }
      setTitle("");
      setBody("");
      setIsPosting(false);
      toast.success("Notice published successfully!");
    } catch (err: any) {
      console.error("Publish notice error:", err);
      toast.error(err?.message || "Failed to publish notice");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const headers: Record<string, string> = {};
      const currentUser = firebaseAuth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      }

      const res = await fetch(`/api/announcements/?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to remove notice");
      }

      setAnnouncements(announcements.filter((a) => a.id !== id));
      toast.success("Notice removed.");
    } catch (err: any) {
      toast.error(err?.message || "Could not delete notice");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">
            Notices &amp; Announcements
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Broadcast workforce notices, shift updates, and company holiday announcements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNotices(true)}
            disabled={refreshing || loading}
            className="border-slate-200 text-xs font-medium"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canPost && !isPosting && (
            <Button
              onClick={() => setIsPosting(true)}
              className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
            >
              <Plus className="size-4 mr-1.5" /> Post Announcement
            </Button>
          )}
        </div>
      </div>

      {/* Post Modal / Inline Form */}
      {isPosting && (
        <Card className="border-border/80 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Publish New Notice</CardTitle>
            <CardDescription className="text-xs">
              This message will be visible in the portal and sent via Web Push to relevant team members.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePost} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="notice-title" className="text-xs font-medium">
                  Title
                </Label>
                <Input
                  id="notice-title"
                  placeholder="e.g. Office Schedule Update or Maintenance Window"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10 text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notice-body" className="text-xs font-medium">
                  Message Content
                </Label>
                <Textarea
                  id="notice-body"
                  placeholder="Type your notice or instructions here..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  className="text-sm"
                  required
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-4">
                  {isOrgAdmin && (
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scope === "Organization-wide"}
                        onChange={(e) =>
                          setScope(e.target.checked ? "Organization-wide" : "Team")
                        }
                        className="rounded border-slate-300"
                      />
                      <span className="font-medium text-slate-800">Organization-wide broadcast</span>
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isImportant}
                      onChange={(e) => setIsImportant(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span className="font-medium text-amber-900">Mark as Priority Alert</span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPosting(false)}
                    disabled={submitting}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submitting}
                    className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Publishing...
                      </>
                    ) : (
                      <>
                        <Send className="size-3.5 mr-1.5" /> Publish Notice
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Announcements Feed */}
      <div className="space-y-4">
        {loading ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="size-5 animate-spin text-slate-500" />
              <span>Loading company notices...</span>
            </div>
          </Card>
        ) : announcements.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground text-sm">
            <Megaphone className="size-8 mx-auto mb-2 text-slate-400" />
            <div className="font-medium text-slate-700">No notices published yet</div>
            <p className="text-xs text-slate-500 mt-1">
              Company and team announcements will appear here when posted.
            </p>
          </Card>
        ) : (
          announcements.map((item) => (
            <Card
              key={item.id}
              className={`border-border/70 shadow-sm transition ${
                item.isImportant ? "border-l-4 border-l-amber-500 bg-amber-50/10" : ""
              }`}
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        className={`text-xs border-none font-medium ${
                          item.isImportant
                            ? "bg-amber-100 text-amber-900"
                            : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {item.scope}
                      </Badge>
                      {item.isImportant && (
                        <Badge className="bg-rose-100 text-rose-800 border-none font-medium text-xs">
                          Priority
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString()} at{" "}
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-[#0E2322]">{item.title}</h3>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                      {item.body}
                    </p>

                    <div className="text-xs text-muted-foreground pt-1 flex items-center gap-1.5">
                      <span className="font-medium text-slate-800">Posted by:</span> {item.author}
                    </div>
                  </div>

                  {canPost && (isOrgAdmin || item.authorUid === user?.id) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(item.id)}
                      className="text-muted-foreground hover:text-rose-600 h-8 w-8 p-0"
                      title="Delete notice"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
