import { useRef, useState } from "react";
import { Flag, ImagePlus, Loader2, X } from "lucide-react";
import { firebaseAuth } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  MAX_IMAGE_BYTES,
  MESSAGE_MAX,
  MESSAGE_MIN,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  base64ByteLength,
  type ReportCategory,
} from "@/lib/problem-report";

/**
 * "Report a problem". Opens a small form, sends it to /api/reports with the person's login.
 * Who is reporting is decided by the server from the login, never by this form.
 */

/** Shrinks any picture to a small JPEG (plain base64, no data-URL prefix). */
async function shrinkToJpegBase64(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a picture.");
  if (file.size > 25 * 1024 * 1024) throw new Error("That picture is too large to use.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    throw new Error("We could not read that picture.");
  }

  let longest = 1280;
  for (let attempt = 0; attempt < 3; attempt++) {
    const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("We could not prepare that picture.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.7, 0.6, 0.5, 0.4]) {
      const b64 = canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
      if (b64 && base64ByteLength(b64) <= MAX_IMAGE_BYTES) {
        bitmap.close?.();
        return b64;
      }
    }
    longest = Math.round(longest * 0.7);
  }
  bitmap.close?.();
  throw new Error("We could not make that picture small enough.");
}

export function ReportProblemButton({ variant = "icon" }: { variant?: "icon" | "button" }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [message, setMessage] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageLabel, setImageLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setCategory(null);
    setMessage("");
    setImage(null);
    setImageLabel("");
    setError(null);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setImage(await shrinkToJpegBase64(file));
      setImageLabel(file.name);
    } catch (e) {
      setImage(null);
      setImageLabel("");
      setError(e instanceof Error ? e.message : "We could not use that picture.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!category) return setError("Please choose what kind of problem this is.");
    if (message.trim().length < MESSAGE_MIN) return setError("Please tell us a little more about what happened.");

    setSending(true);
    setError(null);
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      if (!token) throw new Error("Please sign in again and try once more.");
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category,
          message,
          page: window.location.pathname,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          ...(image ? { imageBase64: image } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Could not send your report. Please try again.");
      toast.success("Thank you. We've got your report.");
      setOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
          title="Report a problem"
          aria-label="Report a problem"
        >
          <Flag className="w-4 h-4" />
        </button>
      ) : (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium"
        >
          <Flag className="size-4 mr-1.5" /> Report a problem
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => !sending && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSend} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Report a problem</DialogTitle>
              <DialogDescription>
                Tell us what went wrong, or what confused you. Please don&apos;t type passwords.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#0E2322]">What kind of problem?</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Kind of problem">
                {REPORT_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className={`h-10 rounded-xl border px-3 text-left text-sm transition ${
                      category === c
                        ? "border-[#0E2322] bg-[#CBEED3] font-semibold text-[#0E2322]"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {REPORT_CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="report-message" className="text-xs font-medium text-[#0E2322]">
                What happened?
              </Label>
              <Textarea
                id="report-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MESSAGE_MAX}
                rows={5}
                className="text-sm"
                placeholder="For example: I scanned the code and it said it had expired."
              />
              <p className="text-xs text-muted-foreground">
                We also send the page you are on and your device type, so you don&apos;t have to describe them.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#0E2322]">Screenshot (optional)</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              {image ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="truncate text-slate-700">{imageLabel || "Picture attached"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setImage(null);
                      setImageLabel("");
                    }}
                    aria-label="Remove the picture"
                    className="shrink-0 text-slate-500 hover:text-slate-900"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  className="border-slate-200 text-xs"
                >
                  <ImagePlus className="size-4 mr-1.5" /> Add a screenshot
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Only the ChecIN team can see it. Please make sure it doesn&apos;t show passwords or private details.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={sending} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={sending} className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs">
                {sending && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Send report
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The "Need help?" card shown on the Account page. */
export function ReportProblemCard() {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Flag className="size-4 text-[#0E2322]" /> Need help?
        </CardTitle>
        <CardDescription className="text-xs">
          Something wrong, or confusing? Tell us and we will look into it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ReportProblemButton variant="button" />
      </CardContent>
    </Card>
  );
}
