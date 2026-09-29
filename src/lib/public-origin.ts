// Returns a URL origin that will be reachable from employees' phones.
// Ensures QR codes and invitations resolve to the valid domain.
export function getPublicOrigin(): string {
  if (typeof window === "undefined") {
    return process.env.APP_ORIGIN || process.env.VITE_APP_ORIGIN || "https://checin.app";
  }
  return window.location.origin;
}
