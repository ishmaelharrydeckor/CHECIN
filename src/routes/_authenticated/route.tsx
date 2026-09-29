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

    throw redirect({ to: "/auth" });
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
