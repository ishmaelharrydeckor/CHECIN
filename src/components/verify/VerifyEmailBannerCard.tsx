import { useEffect, useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/config";
import { VerifyEmailBanner } from "./VerifyEmailBanner";
import { verifySendErrorMessage, type SendStatus } from "@/lib/verify-email-screens";

/**
 * The Account page banner, connected to Firebase's own verification email (design 1.4, V2).
 * It never blocks anything. It shows only while the signed-in email is not verified, and says
 * so from the sign-in itself (never from a field the browser could edit on the server).
 * Firebase limits how often it will send; its "too many requests" answer is shown as a plain wait.
 */
export function VerifyEmailBannerCard() {
  const [verified, setVerified] = useState(() => firebaseAuth.currentUser?.emailVerified !== false);
  const [status, setStatus] = useState<SendStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // After clicking the emailed link (maybe on another device), coming back to this tab re-checks once.
  useEffect(() => {
    const recheck = async () => {
      const current = firebaseAuth.currentUser;
      if (!current || current.emailVerified) return;
      try {
        await current.reload();
        setVerified(firebaseAuth.currentUser?.emailVerified !== false);
      } catch {
        // Offline or signed out: keep showing what we had.
      }
    };
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, []);

  const send = async () => {
    const current = firebaseAuth.currentUser;
    if (!current) return;
    setStatus("sending");
    setErrorMessage(null);
    try {
      await sendEmailVerification(current);
      setStatus("sent");
    } catch (err) {
      setErrorMessage(verifySendErrorMessage((err as { code?: string })?.code));
      setStatus("error");
    }
  };

  return (
    <VerifyEmailBanner
      verified={verified}
      email={firebaseAuth.currentUser?.email}
      status={status}
      onSend={send}
      errorMessage={errorMessage}
    />
  );
}
