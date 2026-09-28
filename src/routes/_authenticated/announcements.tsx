import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
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
  Calendar,
  Building2,
  Users,
  Clock,
  Trash2,
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
  scope: "Organization-wide" | "Engineering" | "Operations";
  author: string;
  createdAt: string;
  isImportant: boolean;
}

const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  {
    id: "ann-1",
    title: "Upcoming Public Holiday & Shift Schedule",
    body: "Please note that the main office entrance kiosk will operate on weekend holiday hours this coming Friday. Scans will be logged under holiday differential.",
    scope: "Organization-wide",
    author: "Kwame Mensah (Org Admin)",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    isImportant: true,
  },
  {
    id: "ann-2",
    title: "New Entrance Tablet Installed at South Gate",
    body: "Tablet #02 is now live at the south pedestrian entrance. You can scan at either door to register your arrival and departure.",
    scope: "Organization-wide",
    author: "Kwame Mensah (Org Admin)",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    isImportant: false,
  },
  {
    id: "ann-3",
    title: "Sprint Review Timesheet Submission Deadline",
    body: "Managers, please review and approve all pending overtime logs and leave requests before 5:00 PM tomorrow.",
    scope: "Engineering",
    author: "Abena Poku (Manager)",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    isImportant: false,
  },
];

function AnnouncementsPage() {
  const { user, isOrgAdmin, isManager } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>(INITIAL_ANNOUNCEMENTS);
  const [isPosting, setIsPosting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<"Organization-wide" | "Engineering" | "Operations">("Organization-wide");
  const [isImportant, setIsImportant] = useState(false);

  const canPost = isOrgAdmin || isManager;

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("Please provide both a title and message content.");
      return;
    }

    const newNotice: Announcement = {
      id: `ann-${Date.now()}`,
      title: title.trim(),
      body: body.trim(),
      scope,
      author: user?.displayName || user?.email?.split("@")[0] || "Staff",
      createdAt: new Date().toISOString(),
      isImportant,
    };

    setAnnouncements([newNotice, ...announcements]);
    setTitle("");
    setBody("");
    setIsPosting(false);
    toast.success("Notice published to team!");
  };

  const handleDelete = (id: string) => {
    setAnnouncements(announcements.filter((a) => a.id !== id));
    toast.success("Notice removed.");
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
        {canPost && !isPosting && (
          <Button
            onClick={() => setIsPosting(true)}
            className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
          >
            <Plus className="size-4 mr-1.5" /> Post Announcement
          </Button>
        )}
      </div>

      {/* Post Modal / Inline Form */}
      {isPosting && (
        <Card className="border-border/80 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Publish New Notice</CardTitle>
            <CardDescription className="text-xs">
              This message will be visible to all members within the selected scope.
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
                  placeholder="e.g. Schedule Update or Office Maintenance"
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
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
                  >
                    <Send className="size-3.5 mr-1.5" /> Publish Notice
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Announcements Feed */}
      <div className="space-y-4">
        {announcements.map((item) => (
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

                {canPost && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(item.id)}
                    className="text-muted-foreground hover:text-rose-600 h-8 w-8 p-0"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
