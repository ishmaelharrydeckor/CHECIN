import { useEffect, useRef } from "react";
import { DIARY_INTERVAL_MS } from "@/lib/wfh-diary";
import { addEvent, blocksToSend, finishBlock, newBlock, setVisible, type BlockState, type InputKind } from "@/lib/wfh-diary-recorder";
import { signReport } from "@/lib/wfh-diary-sign";
import type { DiarySessionView } from "./diaryApi";

/** How often the page checks whether a block has just finished. Writes happen only once per block. */
const TICK_MS = 15_000;

type Figures = ReturnType<typeof finishBlock>;

/**
 * Counts real input inside this page while the session runs and reports each 10-minute block when it
 * ends, signed with the session key. Counts only: which key or what was typed is never read. Times
 * follow the server's clock (`offsetMs` = server time minus this device's time).
 */
export function useDiaryRecorder(input: {
  session: DiarySessionView | null;
  sessionKey: string | null;
  offsetMs: number;
  send: (report: Record<string, unknown>) => Promise<boolean>;
}) {
  const { session, sessionKey, offsetMs, send } = input;
  const block = useRef<{ index: number; state: BlockState } | null>(null);
  const finished = useRef(new Map<number, Figures>());
  const done = useRef(new Set<number>());
  const sending = useRef(false);
  const sendRef = useRef(send);
  sendRef.current = send;
  // The clock difference changes by a few milliseconds with every reply; reading it from a ref means that
  // does not tear down and rebuild the listeners and the timer each time.
  const offsetRef = useRef(offsetMs);
  offsetRef.current = offsetMs;
  const tickRef = useRef<(() => Promise<void>) | null>(null);

  const running = session !== null && session.status !== "ended" && sessionKey !== null;
  const startedAtMs = session?.startedAtMs ?? 0;
  const sessionId = session?.sessionId ?? "";

  useEffect(() => {
    if (!running) return;
    const now = () => Date.now() + offsetRef.current;
    const indexAt = (t: number) => Math.floor((t - startedAtMs) / DIARY_INTERVAL_MS);
    const visible = () => document.visibilityState === "visible";

    // Moves the counting on to the block `t` falls in, keeping the figures of the one that ended.
    const roll = (t: number) => {
      const i = indexAt(t);
      const cur = block.current;
      if (cur && cur.index === i) return;
      if (cur) finished.current.set(cur.index, finishBlock(cur.state, startedAtMs + (cur.index + 1) * DIARY_INTERVAL_MS));
      block.current = { index: i, state: newBlock(Math.max(startedAtMs + i * DIARY_INTERVAL_MS, t), visible()) };
    };

    const record = (type: InputKind) => (e: Event) => {
      const t = now();
      roll(t);
      if (block.current) block.current.state = addEvent(block.current.state, { type, atMs: t, trusted: e.isTrusted });
    };
    const onKey = record("key");
    const onClick = record("click");
    const onScroll = record("scroll");
    const onMove = record("move");
    const onVisibility = () => {
      const t = now();
      roll(t);
      if (block.current) block.current.state = setVisible(block.current.state, visible(), t);
    };

    const tick = async () => {
      const t = now();
      roll(t);
      if (sending.current) return;
      sending.current = true;
      try {
        const sendable = blocksToSend({ startedAtMs, nowMs: t, endMs: null, done: done.current });
        // A block that is no longer reportable (the page was asleep) is dropped, not kept in memory.
        for (const index of [...finished.current.keys()]) if (!sendable.includes(index)) finished.current.delete(index);
        for (const index of sendable) {
          const figures = finished.current.get(index);
          // A block this page was not open for has no figures, so it is not reported.
          if (!figures || !sessionKey) continue;
          const report = { index, ...figures };
          const signature = await signReport(sessionKey, sessionId, report);
          if (await sendRef.current({ ...report, signature })) {
            done.current.add(index);
            finished.current.delete(index);
          }
        }
      } finally {
        sending.current = false;
      }
    };

    tickRef.current = tick;
    roll(now());
    window.addEventListener("keydown", onKey, { passive: true });
    window.addEventListener("pointerdown", onClick, { passive: true });
    window.addEventListener("wheel", onScroll, { passive: true });
    window.addEventListener("touchmove", onScroll, { passive: true }); // scrolling by finger on a phone or tablet
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => void tick(), TICK_MS);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClick);
      window.removeEventListener("wheel", onScroll);
      window.removeEventListener("touchmove", onScroll);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
      tickRef.current = null;
    };
  }, [running, startedAtMs, sessionId, sessionKey]);

  /**
   * Reports a block that has only just finished, without waiting for the next tick. The page calls this
   * just before it stops the session, so the last full block is not lost.
   */
  return {
    flush: async () => {
      for (let waited = 0; sending.current && waited < 3000; waited += 100) await new Promise((r) => setTimeout(r, 100));
      await tickRef.current?.();
    },
  };
}
