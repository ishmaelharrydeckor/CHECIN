/** What the diary route sends back to the work-session page (GET /api/wfh-diary and its POST replies). */

export interface DiaryCheck {
  index: number;
  dueAtMs: number;
  code: string;
}

export interface DiarySessionView {
  sessionId: string;
  dayKey: string;
  status: "active" | "paused" | "ended";
  startedAtMs: number;
  endedAtMs: number | null;
  pauses: { fromMs: number; toMs: number | null }[];
  nextIndex: number;
  serverNowMs: number;
}

export interface DiarySummaryView {
  verifiedMinutes: number;
  unverifiedMinutes: number;
  pausedMinutes: number;
  pendingMinutes: number;
  intervalCount: number;
  flags: string[];
  reviewFlags: number;
  status: "pending" | "approved" | "flagged";
}

export interface DiaryMe {
  serverNowMs: number;
  enabled: boolean;
  today: string;
  wfhToday: boolean;
  consent: { agreed: boolean; version: string; text: string };
  session: DiarySessionView | null;
  summary: DiarySummaryView | null;
  checks: DiaryCheck[];
}

/** The reply to start, interval, answer, pause, resume and stop. */
export interface DiaryChangeReply {
  key?: string;
  session: DiarySessionView;
  summary?: DiarySummaryView;
  checks: DiaryCheck[];
  signatureOk?: boolean;
}

/** The session key lives in this tab only: a reload keeps it, another device or tab never has it. */
export function storedKey(sessionId: string): string | null {
  try {
    return window.sessionStorage.getItem(`wfhDiaryKey:${sessionId}`);
  } catch {
    return null;
  }
}

export function storeKey(sessionId: string, key: string): void {
  try {
    window.sessionStorage.setItem(`wfhDiaryKey:${sessionId}`, key);
  } catch {
    // Private mode without storage: the key stays in memory for this page only.
  }
}
