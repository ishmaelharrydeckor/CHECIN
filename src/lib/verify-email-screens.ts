/**
 * Wording and button rules for the email verification screens (task 1.4a).
 *
 * Pure functions with no Firebase or UI imports, so they can be unit tested.
 * The screens only display what they are given; sending the email and
 * finishing the sign-up are the integrator's routes (docs/EMAIL-VERIFICATION-DESIGN.md).
 */

/** Where a "send the email" action is. */
export type SendStatus = "idle" | "sending" | "sent" | "error";

/** States of the "Finishing setting up your organization" screen. */
export type FinishSetupState = "working" | "error" | "expired";

/** The design's resend limit: one email a minute. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** A whole number of seconds, never negative; anything that is not a number is 0. */
export function clampSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value);
}

export interface SendButtonState {
  label: string;
  disabled: boolean;
}

/**
 * The label and disabled state of a send or resend button.
 * Disabled while sending and while the cooldown is still running.
 */
export function sendButtonState(
  status: SendStatus,
  secondsLeft: number,
  idleLabel: string,
): SendButtonState {
  if (status === "sending") return { label: "Sending…", disabled: true };
  const left = clampSeconds(secondsLeft);
  if (left > 0) return { label: `Send again in ${left}s`, disabled: true };
  return { label: idleLabel, disabled: false };
}

/** The error sentence to show: the one passed in, or a plain default. */
export function sendErrorMessage(message?: string | null): string {
  const trimmed = typeof message === "string" ? message.trim() : "";
  return trimmed || "We couldn't send the email. Please try again in a minute.";
}
