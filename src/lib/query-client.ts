import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute fresh cache for instant page loads
      gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
      refetchOnWindowFocus: false, // Avoid redundant background fetches
      refetchOnReconnect: true,
      retry: (failureCount, error: any) => {
        // If Firestore or network reports unavailable/offline, retry up to 3 times
        const code = error?.code || "";
        const msg = String(error?.message || "").toLowerCase();
        if (
          (code === "unavailable" || msg.includes("unavailable") || msg.includes("offline")) &&
          failureCount < 3
        ) {
          return true;
        }
        return failureCount < 1;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
    },
  },
});

export function clearUserAppCache() {
  try {
    queryClient.clear();
    // Also clear session-level storage if any
    sessionStorage.clear();
  } catch (err) {
    console.error("Failed to clear app cache:", err);
  }
}
