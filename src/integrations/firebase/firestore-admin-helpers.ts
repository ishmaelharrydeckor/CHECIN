import { firestoreAdmin } from "./admin.server";

/**
 * Firestore caps `in` / `array-contains-any` filters at 30 values per query.
 * These helpers split a larger id list into compliant chunks, run the chunks
 * in parallel, and merge the results — so callers can pass an arbitrary
 * number of ids without ever falling back to "fetch the whole collection and
 * filter in JS", which degrades portal performance at scale.
 */
const IN_CHUNK_SIZE = 30;

function chunk<T>(items: T[], size = IN_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function docToObject(doc: FirebaseFirestore.QueryDocumentSnapshot): any {
  return { id: doc.id, ...doc.data() };
}

/** Dedupe by document id, preserving first occurrence. */
function dedupeById(rows: any[]): any[] {
  const seen = new Map<string, any>();
  for (const row of rows) {
    if (row?.id && !seen.has(row.id)) seen.set(row.id, row);
  }
  return Array.from(seen.values());
}

/**
 * Query a collection where `field` matches any of `values`, chunked to
 * respect Firestore's 30-value `in` limit. Returns [] for an empty list
 * rather than issuing a query that would match everything.
 */
export async function queryWhereIn(
  collection: string,
  field: string,
  values: (string | number)[],
  opts?: { limit?: number },
): Promise<any[]> {
  const clean = Array.from(new Set(values.filter((v) => v !== null && v !== undefined && v !== "")));
  if (clean.length === 0) return [];

  const snapshots = await Promise.all(
    chunk(clean).map((group) => {
      let q: FirebaseFirestore.Query = firestoreAdmin
        .collection(collection)
        .where(field, "in", group);
      if (opts?.limit) q = q.limit(opts.limit);
      return q.get();
    }),
  );

  return dedupeById(snapshots.flatMap((snap) => snap.docs.map(docToObject)));
}

/**
 * Fetch specific documents by id using a single batched getAll, rather than
 * one round trip per id.
 */
export async function getDocsByIds(collection: string, ids: string[]): Promise<any[]> {
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (clean.length === 0) return [];

  const refs = clean.map((id) => firestoreAdmin.collection(collection).doc(id));
  const snaps = await firestoreAdmin.getAll(...refs);
  return snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() }));
}

/** Simple equality query, scoped — never an unfiltered collection read. */
export async function queryWhereEquals(
  collection: string,
  field: string,
  value: any,
  opts?: { limit?: number },
): Promise<any[]> {
  let q: FirebaseFirestore.Query = firestoreAdmin.collection(collection).where(field, "==", value);
  if (opts?.limit) q = q.limit(opts.limit);
  const snap = await q.get();
  return snap.docs.map(docToObject);
}

export async function getDocById(collection: string, id: string): Promise<any | null> {
  if (!id) return null;
  const snap = await firestoreAdmin.collection(collection).doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

export async function setDocAdmin(
  collection: string,
  id: string,
  data: Record<string, any>,
  merge = true,
): Promise<void> {
  await firestoreAdmin.collection(collection).doc(id).set(data, { merge });
}

/** Build a Map keyed by document id for O(1) lookups during enrichment. */
export function toMapById<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}
