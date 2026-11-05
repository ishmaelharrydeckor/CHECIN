import { firebaseAuth } from "@/integrations/firebase/config";

/**
 * GET helper for the existing server routes. Identity comes from the signed-in
 * user's verified ID token (Authorization header); nothing identity-related is
 * ever put in the URL or body. The server routes do their own scoping.
 */
export async function authedGet<T>(path: string): Promise<T> {
  const token = await firebaseAuth.currentUser?.getIdToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}