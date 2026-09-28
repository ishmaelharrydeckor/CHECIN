import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";

export const Route = createFileRoute("/kiosk")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrance Terminal Kiosk — ChecIN" }] }),
  component: KioskPage,
});

function KioskPage() {
  // Device pairing state
  const [deviceSecret, setDeviceSecret] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string>("Main Entrance Terminal");
  const [pairingCodeInput, setPairingCodeInput] = useState("");
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);

  // Kiosk display state
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const [countdown, setCountdown] = useState(15);
  const [tokenHash, setTokenHash] = useState("Loading...");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [lastSeenScanTimestamp, setLastSeenScanTimestamp] = useState<number>(() => Date.now());

  const [toastData, setToastData] = useState<{
    show: boolean;
    name: string;
    status: string;
    time: string;
  }>({
    show: false,
    name: "",
    status: "",
    time: "",
  });

  // Check localStorage on mount
  useEffect(() => {
    const savedSecret = localStorage.getItem("checin_kiosk_secret");
    const savedLocId = localStorage.getItem("checin_kiosk_location_id");
    const savedLocName = localStorage.getItem("checin_kiosk_location_name");

    if (savedSecret && savedLocId) {
      setDeviceSecret(savedSecret);
      setLocationId(savedLocId);
      if (savedLocName) setLocationName(savedLocName);
    }
  }, []);

  // Real-time digital clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
      setDate(
        now.toLocaleDateString([], {
          weekday: "long",
          month: "long",
          day: "numeric",
        }),
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Countdown timer decrement
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 15 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll /api/kiosk/token when paired
  const fetchTokenRef = useRef<() => void>(() => {});
  fetchTokenRef.current = async () => {
    if (!deviceSecret || !locationId) return;

    try {
      const res = await fetch("/api/kiosk/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-kiosk-secret": deviceSecret,
        },
        body: JSON.stringify({ locationId }),
      });

      if (res.status === 401) {
        // Device revoked by admin
        handleUnpair();
        return;
      }

      if (!res.ok) return;

      const data = await res.json();
      if (data.ok && data.token) {
        setTokenHash(data.token.slice(0, 8) + "..." + data.token.slice(-6));
        if (data.secondsRemaining) {
          setCountdown(data.secondsRemaining);
        }
        if (data.locationName) {
          setLocationName(data.locationName);
        }

        // Generate real QR code image
        const qrPayload = JSON.stringify({
          locationId,
          token: data.token,
          timeBucket: data.timeBucket,
        });

        const url = await QRCode.toDataURL(qrPayload, {
          width: 340,
          margin: 1,
          color: {
            dark: "#0E2322",
            light: "#FFFFFF",
          },
        });
        setQrDataUrl(url);

        // Check for recent scan confirmation
        if (data.recentScan) {
          const scanTs = Number(data.recentScan.timestamp) || Date.now();
          if (scanTs > lastSeenScanTimestamp) {
            setLastSeenScanTimestamp(scanTs);
            triggerToast(
              data.recentScan.employeeName,
              data.recentScan.type === "in" ? "Clocked IN" : "Clocked OUT",
              data.recentScan.time,
            );
          }
        }
      }
    } catch (err) {
      console.error("Error fetching kiosk token:", err);
    }
  };

  useEffect(() => {
    if (!deviceSecret || !locationId) return;

    // Initial fetch
    fetchTokenRef.current();

    // Poll every 2.5 seconds for instant toast response
    const interval = setInterval(() => {
      fetchTokenRef.current();
    }, 2500);

    return () => clearInterval(interval);
  }, [deviceSecret, locationId]);

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    setPairingError(null);
    setPairingLoading(true);

    try {
      const res = await fetch("/api/kiosk/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pairingCodeInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPairingError(data.error || "Failed to pair terminal");
        setPairingLoading(false);
        return;
      }

      // Store in localStorage
      localStorage.setItem("checin_kiosk_secret", data.deviceSecret);
      localStorage.setItem("checin_kiosk_location_id", data.locationId);
      localStorage.setItem("checin_kiosk_location_name", data.locationName || "Main Entrance");

      setDeviceSecret(data.deviceSecret);
      setLocationId(data.locationId);
      setLocationName(data.locationName || "Main Entrance");
      setPairingCodeInput("");
    } catch (err) {
      setPairingError("Network error. Please check connection.");
    } finally {
      setPairingLoading(false);
    }
  };

  const handleUnpair = () => {
    localStorage.removeItem("checin_kiosk_secret");
    localStorage.removeItem("checin_kiosk_location_id");
    localStorage.removeItem("checin_kiosk_location_name");
    setDeviceSecret(null);
    setLocationId(null);
  };

  const triggerToast = (name: string, status: string, customTime?: string) => {
    const timeStr =
      customTime ||
      new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    setToastData({ show: true, name, status, time: timeStr });
    setTimeout(() => {
      setToastData((prev) => ({ ...prev, show: false }));
    }, 4500);
  };

  // -------------------------------------------------------------
  // VIEW A: PAIRING SETUP SCREEN (When terminal is not yet paired)
  // -------------------------------------------------------------
  if (!deviceSecret || !locationId) {
    return (
      <main className="min-h-screen bg-[#0E2322] text-white p-6 flex flex-col justify-center items-center font-sans">
        <div className="w-full max-w-md bg-[#122220] border-2 border-white/10 rounded-3xl p-8 shadow-2xl text-center relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-[#C0FD9B] text-[#122300] flex items-center justify-center text-3xl font-extrabold mx-auto mb-5 shadow-lg shadow-[#C0FD9B]/20">
            C
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
            Entrance Terminal Setup
          </h1>
          <p className="text-xs text-white/70 mb-6 leading-relaxed">
            Pair this physical screen to an entrance location. Generate a 10-minute pairing code in your <strong>Manager Settings &gt; Entrance Tablet Kiosks</strong>.
          </p>

          <form onSubmit={handlePair} className="space-y-4 text-left">
            <div>
              <label htmlFor="code" className="block text-xs font-semibold uppercase tracking-wider text-[#C0FD9B] mb-1.5">
                Hardware Pairing Code
              </label>
              <input
                id="code"
                type="text"
                placeholder="CHK-849201"
                value={pairingCodeInput}
                onChange={(e) => setPairingCodeInput(e.target.value)}
                className="w-full uppercase font-mono tracking-widest text-center text-lg bg-black/40 border border-white/20 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-[#C0FD9B] focus:ring-1 focus:ring-[#C0FD9B] placeholder-white/30"
              />
            </div>

            {pairingError && (
              <div className="bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs py-2 px-3 rounded-lg text-center">
                {pairingError}
              </div>
            )}

            <button
              type="submit"
              disabled={pairingLoading || !pairingCodeInput.trim()}
              className="w-full py-3.5 rounded-xl bg-[#C0FD9B] text-[#122300] font-bold text-sm hover:opacity-90 active:scale-95 transition shadow-lg shadow-[#C0FD9B]/10 disabled:opacity-50"
            >
              {pairingLoading ? "Authenticating Terminal..." : "Pair Terminal Screen"}
            </button>

            <button
              type="button"
              onClick={async () => {
                setPairingLoading(true);
                setPairingError(null);
                try {
                  const res = await fetch("/api/kiosk/pair", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: "CHK-DEMO" }),
                  });
                  const data = await res.json();
                  if (data.ok) {
                    localStorage.setItem("checin_kiosk_secret", data.deviceSecret);
                    localStorage.setItem("checin_kiosk_location_id", data.locationId);
                    localStorage.setItem("checin_kiosk_location_name", data.locationName || "Main Entrance Lobby");
                    setDeviceSecret(data.deviceSecret);
                    setLocationId(data.locationId);
                    setLocationName(data.locationName || "Main Entrance Lobby");
                  } else {
                    setPairingError(data.error || "Demo pairing failed");
                  }
                } catch {
                  setPairingError("Network error");
                } finally {
                  setPairingLoading(false);
                }
              }}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#C0FD9B] font-semibold text-xs transition border border-[#C0FD9B]/30 flex items-center justify-center space-x-1"
            >
              <span>⚡ One-Click Quick Pair (Demo Mode)</span>
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-white/10 text-center text-xs text-white/50">
            ChecIN Hardware Security Protocol • Zero-GPS Presence Verification
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // VIEW B: ACTIVE KIOSK DISPLAY (Paired & Rotating Live Tokens)
  // -------------------------------------------------------------
  return (
    <main className="min-h-screen bg-[#0E2322] text-white p-4 sm:p-8 flex flex-col justify-between items-center relative overflow-hidden font-sans select-none">
      {/* Top Header Bar */}
      <div className="w-full max-w-4xl flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center space-x-3">
          <div className="relative flex items-center justify-center">
            <span className="w-3.5 h-3.5 rounded-full bg-[#C0FD9B] animate-ping absolute"></span>
            <span className="w-3 h-3 rounded-full bg-[#C0FD9B]"></span>
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              {locationName}
            </h2>
            <p className="text-xs text-white/60">
              Device Secret Authenticated • Hardware Guarded Entrance
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-mono font-bold text-[#C0FD9B] tracking-wider">
            {time || "08:00:00 AM"}
          </div>
          <div className="text-[11px] text-white/50">{date || "Today"}</div>
        </div>
      </div>

      {/* Center Dynamic QR Container */}
      <div className="my-8 text-center max-w-md w-full bg-[#122220] border-2 border-white/10 rounded-3xl p-8 shadow-2xl relative">
        {/* 4.5-Second Welcome / Departure Toast Overlay */}
        {toastData.show && (
          <div className="absolute inset-0 bg-[#0E2322]/98 backdrop-blur-md rounded-3xl z-20 flex flex-col items-center justify-center p-6 text-center border-2 border-[#C0FD9B] animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-[#C0FD9B] text-[#122300] flex items-center justify-center text-3xl font-extrabold mb-4 shadow-lg shadow-[#C0FD9B]/20">
              ✓
            </div>
            <h3 className="text-2xl font-bold text-white mb-1">
              Welcome, {toastData.name}
            </h3>
            <p className="text-sm text-[#C0FD9B] font-semibold">
              {toastData.status} • {toastData.time}
            </p>
            <p className="text-xs text-white/60 mt-3">
              {toastData.status.includes("IN")
                ? "Have a safe and productive day at the office!"
                : "Thank you for your hard work. Have a great evening!"}
            </p>
          </div>
        )}

        {/* Scan Instruction Pill */}
        <div className="inline-block bg-[#C0FD9B]/10 border border-[#C0FD9B]/30 px-3.5 py-1 rounded-full text-xs font-medium text-[#C0FD9B] mb-4">
          Scan with Phone Camera to Check In / Out
        </div>

        {/* Real Dynamic QR Code SVG / Canvas */}
        <div className="w-72 h-72 mx-auto bg-white rounded-2xl p-4 shadow-inner flex items-center justify-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="ChecIN Rotating Hardware Token QR"
              className="w-full h-full object-contain rounded-lg"
            />
          ) : (
            <div className="text-black/60 text-xs flex flex-col items-center justify-center animate-pulse">
              <span className="text-2xl mb-1">⏳</span>
              <span>Minting Live Token...</span>
            </div>
          )}
        </div>

        {/* 15-Second Rotating Countdown Progress */}
        <div className="mt-6 flex items-center justify-between text-xs text-white/70">
          <span>
            Rotating HMAC Token:{" "}
            <strong className="font-mono text-[#C0FD9B]">{tokenHash}</strong>
          </span>
          <span className="font-bold text-[#FFD153]">
            Refreshes in {countdown}s
          </span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-1.5 mt-2 overflow-hidden">
          <div
            className="bg-[#C0FD9B] h-1.5 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${(countdown / 15) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Terminal Footer & Controls */}
      <div className="w-full max-w-md bg-black/30 border border-white/10 rounded-2xl p-3 flex items-center justify-between text-xs text-white/60">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Active Terminal ID: {locationId.slice(0, 8)}</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => triggerToast("Kofi Manu", "Clocked IN")}
            className="text-[11px] px-2 py-1 bg-white/10 hover:bg-white/20 rounded-md text-white/80 transition"
            title="Simulate a test scan reaction"
          >
            Test Toast
          </button>
          <button
            onClick={handleUnpair}
            className="text-[11px] px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-md transition"
          >
            Unpair
          </button>
        </div>
      </div>
    </main>
  );
}
