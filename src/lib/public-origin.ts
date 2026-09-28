// Returns a URL origin that will be reachable from students' phones.
// The editor preview subdomain (id-preview--*.lovable.app) requires Lovable
// login, so QR codes pointing there send students to a login screen. When we
// detect the preview origin (or localhost/dev), fall back to the published
// domain instead so shared QR links open the public /check-in page.
export function getPublicOrigin(): string {
  if (typeof window === "undefined") {
    return process.env.APP_ORIGIN || process.env.VITE_APP_ORIGIN || "https://checin.app";
  }
  return window.location.origin;
}
