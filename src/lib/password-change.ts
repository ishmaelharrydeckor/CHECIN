/**
 * Rules and messages for the "Change password" card (task 1.3).
 *
 * Pure functions with no Firebase or UI imports, so they can be unit tested.
 * Nothing here ever logs, stores, or sends a password anywhere.
 */

/** Matches the sign-up rule in src/routes/auth.tsx (and Firebase's own minimum). */
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;

export interface PasswordChangeInput {
  current: string;
  next: string;
  confirm: string;
}

/** Returns a plain-language problem, or null when the input is acceptable. */
export function validatePasswordChange(input: PasswordChangeInput): string | null {
  const { current, next, confirm } = input;
  if (!current) return "Enter your current password.";
  if (!next) return "Enter a new password.";
  if (next.length < MIN_PASSWORD_LENGTH) {
    return `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (next.length > MAX_PASSWORD_LENGTH) {
    return `Your new password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (next === current) return "Your new password must be different from your current one.";
  if (!confirm) return "Re-enter your new password to confirm it.";
  if (next !== confirm) return "The new passwords don't match.";
  return null;
}

/** True when the account has an email/password sign-in (as opposed to Google only). */
export function hasPasswordSignIn(providerIds: readonly string[] | undefined | null): boolean {
  return Array.isArray(providerIds) && providerIds.includes("password");
}

/**
 * Turns a Firebase Auth failure into a short message a person can act on.
 * Takes the error's `code` only, so nothing sensitive can end up in the text.
 */
export function describePasswordChangeError(code: string | undefined | null): string {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Your current password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/weak-password":
      return "That new password is too weak. Choose a longer or less common one.";
    case "auth/requires-recent-login":
      return "For your security, please sign out, sign back in, and try again.";
    case "auth/network-request-failed":
      return "Can't reach the server. Check your connection and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact your administrator.";
    default:
      return "Couldn't change your password. Please try again.";
  }
}
