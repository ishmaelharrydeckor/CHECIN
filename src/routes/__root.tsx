import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { registerPushServiceWorker } from "@/lib/push-client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A1612] text-white px-4 font-sans">
      <div className="max-w-md text-center">
        <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#C0FD9B]/10 text-[#C0FD9B] border border-[#C0FD9B]/30 mb-4">
          404 Not Found
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">Page not found</h1>
        <p className="mt-3 text-sm text-white/60">
          The page you're looking for doesn't exist or has been relocated.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#C0FD9B] text-[#122300] px-5 py-2.5 text-sm font-bold shadow-lg hover:opacity-90 active:scale-95 transition"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset?: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A1612] text-white px-4 font-sans">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-white/60">
          An unexpected error occurred while loading this page.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset?.();
            }}
            className="inline-flex items-center justify-center rounded-xl bg-[#C0FD9B] text-[#122300] px-5 py-2.5 text-sm font-bold shadow-lg hover:opacity-90 active:scale-95 transition"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition"
          >
            Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0A1612" },
      { title: "ChecIN — Unified Workforce Attendance Platform" },
      {
        name: "description",
        content:
          "Smart workforce attendance for modern companies. Dedicated entrance tablet with rotating dynamic QR codes, instant mobile camera scan, and automated timesheets.",
      },
      { property: "og:title", content: "ChecIN — Unified Workforce Attendance Platform" },
      {
        property: "og:description",
        content:
          "Smart workforce attendance for modern companies. Dedicated entrance tablet with rotating dynamic QR codes, instant mobile camera scan, and automated timesheets.",
      },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "ChecIN" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "ChecIN — Unified Workforce Attendance Platform" },
      {
        name: "twitter:description",
        content:
          "Smart workforce attendance for modern companies. Dedicated entrance tablet with rotating dynamic QR codes, instant mobile camera scan, and automated timesheets.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Inter:wght@300;400;500;600;700;800&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      // All icons are generated from favicon.svg (the ChecIN mark). The ?v= suffix forces browsers
      // to drop any previously cached icon; bump it whenever the artwork changes.
      { rel: "icon", href: "/favicon.svg?v=2", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon-32x32.png?v=2", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon-16x16.png?v=2", type: "image/png", sizes: "16x16" },
      { rel: "shortcut icon", href: "/favicon.ico?v=2" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=2" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Register PWA Web Push service worker in browser
    if (typeof window !== "undefined") {
      registerPushServiceWorker().catch(() => {});
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
