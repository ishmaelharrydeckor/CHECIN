import { useEffect, useState } from "react";
import { firebaseAuth } from "@/integrations/firebase/config";

/**
 * Is the signed-in person the platform owner? Only used to decide whether to SHOW the
 * "Reports inbox" link. The real check happens on the server for every request, so a wrong
 * answer here can only show or hide a link, never grant access.
 */
let cache: { uid: string; answer: Promise<boolean> } | null = null;

export function checkPlatformOwner(uid: string): Promise<boolean> {
  if (cache && cache.uid === uid) return cache.answer;
  const answer = (async () => {
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      if (!token) return false;
      const res = await fetch("/api/reports?whoami=1", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => null);
      return res.ok && data?.owner === true;
    } catch {
      cache = null; // a network problem is not an answer; ask again next time
      return false;
    }
  })();
  cache = { uid, answer };
  return answer;
}

export function useIsPlatformOwner(uid: string | null | undefined): boolean {
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    let live = true;
    if (!uid) {
      setOwner(false);
      return;
    }
    checkPlatformOwner(uid).then((v) => {
      if (live) setOwner(v);
    });
    return () => {
      live = false;
    };
  }, [uid]);
  return owner;
}
