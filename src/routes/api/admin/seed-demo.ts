import { createFileRoute } from "@tanstack/react-router";
import { firestoreAdmin, verifyCallerToken } from "@/integrations/firebase/admin.server";

export const Route = createFileRoute("/api/admin/seed-demo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const caller = await verifyCallerToken(request.headers.get("authorization"));
          if (!caller || !caller.uid || !caller.orgId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          if (caller.role !== "org_admin") {
            return Response.json({ error: "Forbidden: Only organization admins can seed sample data" }, { status: 403 });
          }

          const orgId = caller.orgId;
          const callerUid = caller.uid;

          const today = new Date();
          const todayDateStr = today.toISOString().split("T")[0];

          // Sample departments / staff
          const demoStaff = [
            { id: "demo-staff-1", name: "Ama Mensah", email: "ama.mensah@company.com", dept: "Engineering", status: "in", time: "08:14 AM" },
            { id: "demo-staff-2", name: "Kofi Manu", email: "kofi.manu@company.com", dept: "Product Design", status: "in", time: "08:29 AM" },
            { id: "demo-staff-3", name: "Kwesi Appiah", email: "kwesi.appiah@company.com", dept: "Operations", status: "in", time: "08:42 AM" },
            { id: "demo-staff-4", name: "Sarah Jenkins", email: "sarah.j@company.com", dept: "Finance", status: "in", time: "08:51 AM" },
            { id: "demo-staff-5", name: "David Osei", email: "david.o@company.com", dept: "Sales", status: "out", time: "05:12 PM" },
          ];

          // Seed demo clock events
          for (const staff of demoStaff) {
            const eventRef = firestoreAdmin.collection("clock_events").doc();
            await eventRef.set({
              eventId: eventRef.id,
              orgId,
              managerId: callerUid,
              employeeId: staff.id,
              employeeName: staff.name,
              employeeEmail: staff.email,
              department: staff.dept,
              type: staff.status,
              timestamp: `${todayDateStr}T${staff.time.includes("PM") ? "17:12:00" : "08:" + staff.time.slice(3, 5) + ":00"}.000Z`,
              locationId: "loc-main-lobby",
              locationName: "Main Entrance Lobby",
              verifiedBy: "kiosk_hmac_sha256",
            });
          }

          return Response.json({
            ok: true,
            message: "Successfully seeded 5 demo workforce members and clock events for today!",
          });
        } catch (err: any) {
          console.error("POST /api/admin/seed-demo error:", err);
          return Response.json({ error: "Failed to seed demo data" }, { status: 500 });
        }
      },
    },
  },
});
