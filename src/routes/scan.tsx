import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { firebaseAuth, googleProvider } from "@/integrations/firebase/config";
import { signInWithPopup } from "firebase/auth";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { getDeviceId } from "@/lib/device-manager";

export const Route = createFileRoute("/scan")({
  ssr: false,
  head: () => ({ meta: [{ title: "Employee Check-In Scanner — ChecIN" }] }),
  component: ScanPage,
});

function ScanPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"in" | "out">("out");
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processingScan, setProcessingScan] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cooldownRef = useRef(false);

  const activeUser = user;

  const employeeName = activeUser?.user_metadata?.full_name || activeUser?.displayName || activeUser?.email?.split("@")[0] || "Employee";
  const employeeEmail = activeUser?.email || "employee@company.com";
  const employeeInitials =
    employeeName
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "EM";

  // Google sign in helper if unauthenticated
  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
      toast.success("Signed in successfully!");
    } catch (err: any) {
      console.error("Sign-in error:", err);
      toast.error(err.message || "Failed to sign in");
    }
  };

  // Start Camera QR Scanner
  const startCamera = async () => {
    try {
      setCameraError(null);
      const html5QrCode = new Html5Qrcode("qr-reader");
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
        },
        async (decodedText) => {
          if (cooldownRef.current || processingScan) return;
          await handleScanDecoded(decodedText);
        },
        () => {
          // ignore scan frame errors
        },
      );
      setCameraActive(true);
    } catch (err: any) {
      console.warn("Camera start failed:", err);
      setCameraActive(false);
      setCameraError(
        "Camera stream not available. Ensure HTTPS is active and camera permissions are granted.",
      );
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current && cameraActive) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      setCameraActive(false);
    }
  };

  useEffect(() => {
    if (activeUser) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeUser]);

  // Process a scanned QR payload
  const handleScanDecoded = async (rawPayload: string) => {
    if (!user) {
      toast.error("Please sign in before scanning");
      return;
    }

    setProcessingScan(true);
    cooldownRef.current = true;

    try {
      let locationId = "";
      let token = "";

      try {
        const parsed = JSON.parse(rawPayload);
        locationId = parsed.locationId;
        token = parsed.token;
      } catch {
        // Plain string fallback format "token:locationId"
        const parts = rawPayload.split("::");
        if (parts.length === 2) {
          locationId = parts[0];
          token = parts[1];
        }
      }

      if (!token || !locationId) {
        setScanMessage({ text: "Invalid ChecIN QR code format", isError: true });
        setProcessingScan(false);
        setTimeout(() => {
          cooldownRef.current = false;
        }, 3000);
        return;
      }

      // Get fresh Firebase ID token
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      if (!idToken) {
        setScanMessage({ text: "Authentication session expired. Please re-login.", isError: true });
        setProcessingScan(false);
        return;
      }

      const res = await fetch("/api/check-in/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          token,
          locationId,
          deviceFingerprint: getDeviceId(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setScanMessage({ text: data.error || "Check-in failed", isError: true });
        toast.error(data.error || "Check-in failed");
        navigator.vibrate?.([200, 100, 200]);
        setProcessingScan(false);
        setTimeout(() => {
          cooldownRef.current = false;
        }, 3000);
        return;
      }

      // SUCCESS!
      const isCheckIn = data.type === "in";
      setStatus(isCheckIn ? "in" : "out");
      setLastScanTime(data.timeDisplay || new Date().toLocaleTimeString());

      const successText = isCheckIn
        ? `Successfully Clocked IN at ${data.timeDisplay || "Now"} • ${data.locationName}`
        : `Successfully Clocked OUT at ${data.timeDisplay || "Now"} • ${data.locationName}`;

      setScanMessage({ text: successText, isError: false });
      toast.success(successText);

      // Tactile haptic confirmation
      navigator.vibrate?.([80, 50, 80]);

      setTimeout(() => {
        setScanMessage(null);
      }, 5000);
    } catch (err: any) {
      console.error("Scan error:", err);
      setScanMessage({ text: "Connection error verifying scan", isError: true });
    } finally {
      setProcessingScan(false);
      setTimeout(() => {
        cooldownRef.current = false;
      }, 3000);
    }
  };

  // -------------------------------------------------------------
  // VIEW A: SIGN IN PROMPT (When employee is not logged in)
  // -------------------------------------------------------------
  if (!activeUser && !loading) {
    return (
      <main className="min-h-screen bg-slate-900 sm:bg-slate-100 p-4 flex flex-col justify-center items-center font-sans">
        <div className="w-full max-w-[390px] bg-black text-white rounded-[40px] p-6 border-[8px] border-slate-800 shadow-2xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#C0FD9B] text-[#122300] flex items-center justify-center text-3xl font-extrabold mx-auto mb-4 shadow-lg shadow-[#C0FD9B]/20">
            C
          </div>

          <h1 className="text-xl font-bold text-white mb-1">ChecIN Mobile Scanner</h1>
          <p className="text-xs text-white/60 mb-6">
            Sign in with your corporate account to verify your attendance.
          </p>

          <div className="space-y-3">
            <button
              onClick={handleGoogleSignIn}
              className="w-full py-3.5 px-4 rounded-xl bg-white text-slate-900 font-bold text-sm hover:bg-slate-100 transition shadow flex items-center justify-center space-x-2"
            >
              <span>Continue with Google</span>
            </button>

            <button
              onClick={() => navigate({ to: "/auth" })}
              className="w-full py-3 px-4 rounded-xl bg-white/10 text-white font-medium text-xs hover:bg-white/20 transition"
            >
              Sign In with Corporate Email
            </button>
          </div>

          <div className="mt-8 text-[11px] text-white/40 border-t border-white/10 pt-4">
            Physical Entrance Verification • Zero GPS Tracking
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // VIEW B: ACTIVE SCANNER VIEW (Authenticated Employee)
  // -------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-900 sm:bg-slate-100 p-2 sm:p-4 flex flex-col justify-center items-center font-sans">
      <div className="w-full max-w-[390px] bg-black text-white rounded-[40px] p-4 border-[8px] border-slate-800 shadow-2xl overflow-hidden relative">
        {/* Dynamic Island / Notch */}
        <div className="w-32 h-4 bg-slate-900 rounded-full mx-auto mb-3 flex items-center justify-center">
          <div className="w-10 h-1 bg-slate-700 rounded-full"></div>
        </div>

        {/* Top PWA Status Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 px-2">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-md bg-[#C0FD9B] text-[#122300] flex items-center justify-center text-xs font-extrabold">
              C
            </div>
            <span className="text-sm font-bold text-white tracking-tight">
              ChecIN PWA
            </span>
          </div>
          <div className="text-[11px] text-[#C0FD9B] bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C0FD9B] animate-pulse" />
            Verified Session
          </div>
        </div>

        {/* Employee Profile Card */}
        <div className="bg-white/5 rounded-2xl p-3.5 mb-3 border border-white/10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-[#C0FD9B] text-[#122300] flex items-center justify-center font-extrabold text-sm shadow-sm">
              {employeeInitials}
            </div>
            <div className="truncate flex-1">
              <div className="font-bold text-sm text-white truncate">{employeeName}</div>
              <div className="text-[11px] text-white/60 truncate">{employeeEmail}</div>
            </div>
          </div>
          <div className="text-xs pt-2 border-t border-white/10 flex justify-between items-center">
            <span className="text-white/60">Status today:</span>
            <span
              className={`font-semibold px-2.5 py-0.5 rounded-full text-[11px] ${
                status === "in"
                  ? "bg-[#CBEED3] text-[#0E2322]"
                  : "bg-rose-500/20 text-rose-300"
              }`}
            >
              {status === "in" ? "Clocked IN" : "Not Clocked In"}
            </span>
          </div>
        </div>

        {/* Camera Viewfinder / HTML5 QR Scanner */}
        <div className="bg-slate-950 rounded-2xl h-64 border-2 border-dashed border-[#C0FD9B]/50 relative flex flex-col items-center justify-center p-2 text-center overflow-hidden">
          {/* HTML5 QR Code Mount Element */}
          <div id="qr-reader" className="w-full h-full object-cover"></div>

          {/* Fallback Viewfinder Overlay if camera is loading or permission pending */}
          {!cameraActive && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4">
              <div className="w-10 h-10 border-2 border-[#C0FD9B] border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-xs text-white/80 font-medium mb-1">
                {cameraError ? "Camera Guard Active" : "Initializing Camera Scanner..."}
              </p>
              {cameraError && (
                <p className="text-[10px] text-amber-300/80 max-w-xs">
                  {cameraError}
                </p>
              )}
            </div>
          )}

          {/* In-Viewfinder Status Banner */}
          {scanMessage && (
            <div
              className={`absolute top-3 left-3 right-3 text-[11px] font-bold py-2.5 px-3 rounded-xl shadow-xl z-20 animate-in fade-in slide-in-from-top-2 duration-200 ${
                scanMessage.isError
                  ? "bg-rose-500 text-white border border-rose-400"
                  : "bg-[#C0FD9B] text-[#122300] border border-emerald-400"
              }`}
            >
              {scanMessage.isError ? "⚠️ " : "✓ "} {scanMessage.text}
            </div>
          )}

          {/* Processing Spinner Overlay */}
          {processingScan && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center z-30">
              <div className="w-8 h-8 border-2 border-[#C0FD9B] border-t-transparent rounded-full animate-spin mb-2"></div>
              <span className="text-xs text-[#C0FD9B] font-semibold">
                Verifying Cryptographic Scan...
              </span>
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (cameraActive) stopCamera();
                else startCamera();
              }}
              className="flex-1 py-2 px-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[11px] transition text-center"
            >
              {cameraActive ? "Pause Camera" : "Restart Camera"}
            </button>
            <button
              onClick={() => navigate({ to: "/history" })}
              className="flex-1 py-2 px-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[11px] transition text-center"
            >
              View Timesheet
            </button>
          </div>

          <p className="text-[10px] text-center text-white/50 pt-1">
            HMAC verified against entrance kiosk secret • 60s cooldown protected
          </p>
        </div>
      </div>
    </main>
  );
}
