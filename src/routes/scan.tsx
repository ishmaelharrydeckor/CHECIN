import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { firebaseAuth, googleProvider } from "@/integrations/firebase/config";
import { signInWithPopup } from "firebase/auth";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { toast } from "sonner";
import { getDeviceId } from "@/lib/device-manager";

export const Route = createFileRoute("/scan")({
  ssr: false,
  head: () => ({ meta: [{ title: "Employee Check-In Scanner — ChecIN" }] }),
  component: ScanPage,
});

// A ChecIN code is JSON `{ token, locationId }` or the plain "locationId::token" form.
// Anything else (a menu QR, a website link) is not ours and is ignored quietly.
function parseChecinPayload(raw: string): { token: string; locationId: string } | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token === "string" && typeof parsed?.locationId === "string") {
      return { token: parsed.token, locationId: parsed.locationId };
    }
    return null;
  } catch {
    const parts = raw.split("::");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { locationId: parts[0], token: parts[1] };
    }
    return null;
  }
}

function describeCameraError(err: any): string {
  switch (err?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera access is blocked. Allow the camera for this site in your browser settings, then tap Restart Camera.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is in use by another app. Close it, then tap Restart Camera.";
    default:
      return typeof err === "string" && /permission/i.test(err)
        ? "Camera access is blocked. Allow the camera for this site in your browser settings, then tap Restart Camera."
        : "Camera not available. Make sure the page is on HTTPS and camera permission is granted.";
  }
}

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

  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offline, setOffline] = useState(false);
  const [justScanned, setJustScanned] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cooldownRef = useRef(false);
  const processingRef = useRef(false);
  const startingRef = useRef(false);
  const userPausedRef = useRef(false);
  const lastScanSucceededRef = useRef(false);
  const lastPayloadRef = useRef<{ raw: string; at: number } | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const showHint = (text: string) => {
    setHint(text);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHint(null), 2500);
  };

  const startCamera = async () => {
    if (startingRef.current || scannerRef.current) return;
    startingRef.current = true;
    try {
      setCameraError(null);
      setJustScanned(false);
      // Use the phone's built-in QR detector when it has one; the library decoder is the fallback.
      const html5QrCode = new Html5Qrcode("qr-reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          // No qrbox: decode the entire camera frame, not a small centre square.
          fps: 20,
        },
        (decodedText) => {
          void onDecoded(decodedText);
        },
        () => {
          // ignore scan frame errors
        },
      );
      setCameraActive(true);

      // Torch and zoom only exist on some phones; offer them only where the camera reports them.
      try {
        const caps = html5QrCode.getRunningTrackCameraCapabilities();
        setTorchSupported(caps.torchFeature().isSupported());
        const z = caps.zoomFeature();
        if (z.isSupported() && z.max() > z.min()) {
          setZoomRange({ min: z.min(), max: z.max(), step: z.step() || 0.1 });
          setZoom(z.value() ?? z.min());
        } else {
          setZoomRange(null);
        }
      } catch {
        setTorchSupported(false);
        setZoomRange(null);
      }
    } catch (err: any) {
      console.warn("Camera start failed:", err);
      scannerRef.current = null;
      setCameraActive(false);
      setCameraError(describeCameraError(err));
    } finally {
      startingRef.current = false;
    }
  };

  const stopCamera = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    scannerRef.current = null;
    try {
      await scanner.stop();
      scanner.clear();
    } catch (err) {
      console.error("Error stopping scanner:", err);
    }
    setCameraActive(false);
    setTorchOn(false);
    setTorchSupported(false);
    setZoomRange(null);
  };

  const toggleTorch = async () => {
    try {
      const next = !torchOn;
      await scannerRef.current?.getRunningTrackCameraCapabilities().torchFeature().apply(next);
      setTorchOn(next);
    } catch {
      showHint("Flash isn't available on this camera");
    }
  };

  const changeZoom = async (value: number) => {
    setZoom(value);
    try {
      await scannerRef.current?.getRunningTrackCameraCapabilities().zoomFeature().apply(value);
    } catch {
      // zoom is a convenience; ignore failures
    }
  };

  useEffect(() => {
    if (activeUser) {
      userPausedRef.current = false;
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeUser]);

  // Run the camera only while the app is on screen: stop it in the background, restart on return
  // (unless the employee paused it, or a scan just finished and they haven't asked for another).
  useEffect(() => {
    if (!activeUser) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopCamera();
      } else if (!userPausedRef.current && !lastScanSucceededRef.current) {
        startCamera();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [activeUser]);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // Load the real status from the server on open, and again whenever the app
  // returns to the foreground (another phone or the kiosk may have changed it).
  useEffect(() => {
    if (!activeUser) return;
    let cancelled = false;

    const syncStatus = async () => {
      try {
        const idToken = await firebaseAuth.currentUser?.getIdToken();
        if (!idToken) return;
        const res = await fetch("/api/check-in/status", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && (data.status === "in" || data.status === "out")) {
          setStatus(data.status);
        }
      } catch {
        // Leave the current tag; a failed read must not change what is shown.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") syncStatus();
    };

    syncStatus();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeUser]);

  // Gate every camera hit: ignore non-ChecIN codes, repeats of the same frame, and anything
  // while a scan is in flight or cooling down.
  const onDecoded = async (raw: string) => {
    if (cooldownRef.current || processingRef.current) return;

    const payload = parseChecinPayload(raw);
    if (!payload) {
      const last = lastPayloadRef.current;
      if (!last || last.raw !== raw || Date.now() - last.at > 4000) {
        showHint("That's not a ChecIN code. Point at the entrance screen.");
      }
      lastPayloadRef.current = { raw, at: Date.now() };
      return;
    }

    if (!navigator.onLine) {
      showHint("You're offline. Check-in needs a connection.");
      return;
    }

    await handleScanDecoded(payload);
  };

  // Process a scanned ChecIN payload
  const handleScanDecoded = async ({ token, locationId }: { token: string; locationId: string }) => {
    if (!user) {
      toast.error("Please sign in before scanning");
      return;
    }

    setProcessingScan(true);
    processingRef.current = true;
    cooldownRef.current = true;

    try {
      // Get fresh Firebase ID token
      const idToken = await firebaseAuth.currentUser?.getIdToken();
      if (!idToken) {
        setScanMessage({ text: "Authentication session expired. Please re-login.", isError: true });
        setProcessingScan(false);
        processingRef.current = false;
        cooldownRef.current = false;
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
          // Lets the server recognise a retry of this same scan and record it once.
          scanId: crypto.randomUUID(),
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

      // One scan is the whole job: release the camera until they ask for another.
      lastScanSucceededRef.current = true;
      setJustScanned(true);
      stopCamera();

      setTimeout(() => {
        setScanMessage(null);
      }, 5000);
    } catch (err: any) {
      console.error("Scan error:", err);
      setScanMessage({
        text: navigator.onLine
          ? "Couldn't reach the server. Try again in a moment."
          : "You're offline. Check-in needs a connection.",
        isError: true,
      });
    } finally {
      processingRef.current = false;
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
    <main className="h-[100dvh] bg-black sm:bg-slate-100 sm:p-4 flex flex-col justify-center items-center font-sans">
      <style>{`
        #qr-reader { border: none !important; }
        #qr-reader video { width: 100% !important; height: 100% !important; object-fit: cover; }
      `}</style>
      <div className="w-full h-full sm:h-auto sm:max-w-[390px] flex flex-col bg-black text-white sm:rounded-[40px] p-3 sm:p-4 sm:border-[8px] sm:border-slate-800 sm:shadow-2xl overflow-hidden relative">
        {/* Dynamic Island / Notch (desktop preview only) */}
        <div className="hidden sm:flex w-32 h-4 bg-slate-900 rounded-full mx-auto mb-3 items-center justify-center">
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
        <div className="bg-slate-950 rounded-2xl flex-1 min-h-0 sm:flex-none sm:h-[28rem] border-2 border-dashed border-[#C0FD9B]/50 relative overflow-hidden">
          {/* HTML5 QR Code Mount Element — fills the whole viewfinder */}
          <div id="qr-reader" className="absolute inset-0"></div>

          {/* Corner guides (visual only; the whole frame is scanned) */}
          {cameraActive && (
            <div className="pointer-events-none absolute inset-6 z-10 border-2 border-white/30 rounded-xl" />
          )}

          {/* Fallback Viewfinder Overlay if camera is loading or permission pending */}
          {!cameraActive && !justScanned && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4">
              {!cameraError && (
                <div className="w-10 h-10 border-2 border-[#C0FD9B] border-t-transparent rounded-full animate-spin mb-3"></div>
              )}
              <p className="text-xs text-white/80 font-medium mb-1">
                {cameraError ? "Camera unavailable" : userPausedRef.current ? "Camera paused" : "Initializing Camera Scanner..."}
              </p>
              {cameraError && (
                <p className="text-[10px] text-amber-300/80 max-w-xs">
                  {cameraError}
                </p>
              )}
            </div>
          )}

          {/* Smart prompt: tells the employee what the next scan will do */}
          {cameraActive && !scanMessage && !processingScan && (
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 flex flex-col items-center gap-2">
              {hint && (
                <div className="text-[11px] font-medium bg-amber-400 text-black px-3 py-1.5 rounded-full">
                  {hint}
                </div>
              )}
              <div className="text-xs font-bold bg-black/70 backdrop-blur-sm text-white px-3.5 py-1.5 rounded-full border border-white/20">
                {status === "in" ? "Scan to clock OUT" : "Scan to clock IN"}
              </div>
            </div>
          )}

          {offline && (
            <div className="absolute top-3 left-3 right-3 z-20 text-[11px] font-bold py-2 px-3 rounded-xl bg-amber-400 text-black text-center">
              You're offline. Check-in needs a connection.
            </div>
          )}

          {/* Torch and zoom, only where the camera supports them */}
          {cameraActive && (torchSupported || zoomRange) && (
            <div className="absolute right-3 top-14 z-20 flex flex-col items-center gap-2">
              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  aria-label={torchOn ? "Turn flash off" : "Turn flash on"}
                  className={`w-9 h-9 rounded-full text-sm border ${
                    torchOn ? "bg-[#C0FD9B] text-[#122300] border-[#C0FD9B]" : "bg-black/60 text-white border-white/30"
                  }`}
                >
                  ⚡
                </button>
              )}
              {zoomRange && (
                <input
                  type="range"
                  aria-label="Zoom"
                  min={zoomRange.min}
                  max={zoomRange.max}
                  step={zoomRange.step}
                  value={zoom}
                  onChange={(e) => changeZoom(Number(e.target.value))}
                  className="w-24 accent-[#C0FD9B]"
                />
              )}
            </div>
          )}

          {/* Scan finished: camera is off until they ask again */}
          {justScanned && !cameraActive && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 z-10">
              <p className="text-sm font-semibold text-white mb-3">
                {status === "in" ? "You're clocked IN" : "You're clocked OUT"}
              </p>
              <button
                onClick={() => {
                  lastScanSucceededRef.current = false;
                  userPausedRef.current = false;
                  startCamera();
                }}
                className="py-2 px-4 rounded-xl bg-[#C0FD9B] text-[#122300] text-xs font-bold"
              >
                Scan again
              </button>
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
                if (cameraActive) {
                  userPausedRef.current = true;
                  stopCamera();
                } else {
                  userPausedRef.current = false;
                  lastScanSucceededRef.current = false;
                  startCamera();
                }
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
