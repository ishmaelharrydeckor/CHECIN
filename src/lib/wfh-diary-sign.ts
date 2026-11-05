/**
 * Signs one diary interval in the browser with the session key, exactly as the server checks it
 * (`signingPayload` in wfh-diary.ts, HMAC-SHA256, hex). Uses the Web Crypto API, which browsers and
 * Node both provide.
 */
import { signingPayload, type IntervalReport } from "./wfh-diary.ts";

export async function signReport(key: string, sessionId: string, report: Omit<IntervalReport, "signature">): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await globalThis.crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await globalThis.crypto.subtle.sign("HMAC", cryptoKey, enc.encode(signingPayload(sessionId, report)));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
