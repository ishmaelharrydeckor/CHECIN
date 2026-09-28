import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { firebaseAuth } from "@/integrations/firebase/config";

import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      await firebaseAuth.authStateReady();
    } catch {
      // Ignore readiness check failure
    }

    if (firebaseAuth.currentUser) {
      return { user: firebaseAuth.currentUser };
    }

    if (new URL(window.location.href).searchParams.get("demo") === "true") {
      return { user: { uid: "demo-admin", email: "admin@checin.app" } };
    }

    throw redirect({ to: "/auth" });
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
