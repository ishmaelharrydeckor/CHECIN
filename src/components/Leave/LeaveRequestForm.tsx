import { useState, type ChangeEvent, type FormEvent } from "react";
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

const fieldClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500";
const errorClass = "mt-1 text-sm text-red-600";

export function LeaveRequestForm({ onSubmit }: Props) {
  const [values, setValues] = useState<LeaveFormInput>(EMPTY);
  const [errors, setErrors] = useState<LeaveFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const today = todayISO();

  const handleChange =
    (field: keyof LeaveFormInput) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setValues((v) => ({ ...v, [field]: e.target.value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
      setSuccess(false);
    };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSuccess(false);

    const found = validateLeaveInput(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(values);
      setValues(EMPTY);
      setSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Request leave</h2>

      <div>
        <label htmlFor="leave-type" className="mb-1 block text-sm font-medium">
          Type
        </label>
        <select
          id="leave-type"
          value={values.type}
          onChange={handleChange("type")}
          className={fieldClass}
        >
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {LEAVE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {errors.type && <p className={errorClass}>{errors.type}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="leave-start" className="mb-1 block text-sm font-medium">
            Start date
          </label>
          <input
            id="leave-start"
            type="date"
            min={today}
            value={values.startDate}
            onChange={handleChange("startDate")}
            className={fieldClass}
          />
          {errors.startDate && <p className={errorClass}>{errors.startDate}</p>}
        </div>
        <div>
          <label htmlFor="leave-end" className="mb-1 block text-sm font-medium">
            End date
          </label>
          <input
            id="leave-end"
            type="date"
            min={values.startDate || today}
            value={values.endDate}
            onChange={handleChange("endDate")}
            className={fieldClass}
          />
          {errors.endDate && <p className={errorClass}>{errors.endDate}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="leave-note" className="mb-1 block text-sm font-medium">
          Note <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <textarea
          id="leave-note"
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          value={values.note}
          onChange={handleChange("note")}
          className={fieldClass}
        />
        {errors.note && <p className={errorClass}>{errors.note}</p>}
      </div>

      {submitError && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {submitError}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          Request submitted. Your manager will review it.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}