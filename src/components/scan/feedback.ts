/**
 * Haptic and audible feedback for a scan result. Both are best effort: some
 * phones have no vibration motor, and browsers often refuse to start audio
 * outside a tap, so failure here is silent and never affects the scan.
 */
export function scanFeedback(ok: boolean): void {
  try {
    navigator.vibrate?.(ok ? [80, 50, 80] : [200, 100, 200]);
  } catch {
    // ignore
  }
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
    osc.onended = () => void ctx.close();
  } catch {
    // ignore
  }
}
