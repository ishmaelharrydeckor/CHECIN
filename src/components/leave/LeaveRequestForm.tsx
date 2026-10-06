import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  NOTE_MAX_LENGTH,
  todayISO,
  validateLeaveInput,
  type LeaveFormErrors,
  type LeaveFormInput,
} from "@/lib/leave";

interface Props {
  onSubmit: (input: LeaveFormInput) => Promise<void>;
}

const EMPTY: LeaveFormInput = { type: "annual", startDate: "", endDate: "", note: "" };

export function LeaveRequestForm({ onSubmit }: Props) {
  const [values, setValues] = useState<LeaveFormInput>(EMPTY);
  const [errors, setErrors] = useState<LeaveFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const today = todayISO();

  function setField(field: keyof LeaveFormInput, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const found = validateLeaveInput(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(values);
      setValues(EMPTY);
      toast.success("Leave request sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send your request. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Request leave</CardTitle>
        <CardDescription className="text-xs">
          Your manager will review it. Start dates can&apos;t be in the past.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="leave-type" className="text-xs font-medium text-[#0E2322]">
              Type
            </Label>
            <Select value={values.type} onValueChange={(v) => setField("type", v)}>
              <SelectTrigger id="leave-type" className="h-10 text-sm">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LEAVE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && (
              <p role="alert" className="text-xs text-destructive">
                {errors.type}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="leave-start" className="text-xs font-medium text-[#0E2322]">
                Start date
              </Label>
              <Input
                id="leave-start"
                type="date"
                min={today}
                value={values.startDate}
                onChange={(e) => setField("startDate", e.target.value)}
                className="h-10 text-sm"
              />
              {errors.startDate && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.startDate}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-end" className="text-xs font-medium text-[#0E2322]">
                End date
              </Label>
              <Input
                id="leave-end"
                type="date"
                min={values.startDate || today}
                value={values.endDate}
                onChange={(e) => setField("endDate", e.target.value)}
                className="h-10 text-sm"
              />
              {errors.endDate && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.endDate}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leave-note" className="text-xs font-medium text-[#0E2322]">
              Note (optional)
            </Label>
            <Textarea
              id="leave-note"
              rows={3}
              maxLength={NOTE_MAX_LENGTH}
              value={values.note}
              onChange={(e) => setField("note", e.target.value)}
              className="text-sm"
            />
            <div className="flex items-start justify-between gap-2">
              {errors.note ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.note}
                </p>
              ) : (
                <span />
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {values.note.length}/{NOTE_MAX_LENGTH}
              </span>
            </div>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="h-10 w-full bg-[#0E2322] text-xs font-medium text-white hover:bg-[#163331] sm:w-auto"
          >
            {submitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {submitting ? "Sending…" : "Send request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}