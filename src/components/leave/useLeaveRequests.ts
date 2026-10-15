import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { firebaseAuth, firestoreDb } from "@/integrations/firebase/config";
import {
  isLeaveType,
  NAME_MAX_LENGTH,
  type LeaveFormInput,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
} from "@/lib/leave";
import type { LeaveIdentity } from "./useLeaveIdentity";

type ReadyIdentity = Extract<LeaveIdentity, { status: "ready" }>;

const COLLECTION = "leave_requests";

function toDate(value: unknown): Date | null {
  return value && typeof (value as { toDate?: unknown }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : null;
}

export function fromSnapshot(snap: QueryDocumentSnapshot<DocumentData>): LeaveRequest | null {
  const d = snap.data();
  if (!isLeaveType(d.type)) return null;
  return {
    id: snap.id,
    orgId: d.orgId,
    managerId: d.managerId,
    employeeId: d.employeeId,
    employeeName: typeof d.employeeName === "string" && d.employeeName ? d.employeeName : undefined,
    type: d.type as LeaveType,
    startDate: d.startDate,
    endDate: d.endDate,
    note: d.note || undefined,
    status: d.status as LeaveStatus,
    reviewedBy: d.reviewedBy,
    reviewedAt: toDate(d.reviewedAt),
    createdAt: toDate(d.createdAt),
  };
}

/**
 * Query constraints always include orgId (and managerId / employeeId where
 * relevant) so they line up with the Firestore rules.
 * No orderBy: sorting happens client-side, so no composite index is needed.
 */
function constraintsFor(identity: ReadyIdentity): QueryConstraint[] | null {
  switch (identity.role) {
    case "employee":
      return [
        where("orgId", "==", identity.orgId),
        where("employeeId", "==", identity.uid),
      ];
    case "manager":
      return [
        where("orgId", "==", identity.orgId),
        where("managerId", "==", identity.uid),
        where("status", "==", "pending"),
      ];
    case "org_admin":
      return [where("orgId", "==", identity.orgId)];
    default:
      return null;
  }
}

function friendlyError(err: unknown, fallback: string): string {
  const code = (err as { code?: string })?.code;
  if (code === "permission-denied") return "You don't have permission to do that.";
  if (code === "unavailable") return "No connection. Check your internet and try again.";
  return fallback;
}

export function sortRequests(list: LeaveRequest[]): LeaveRequest[] {
  const rank = (s: LeaveStatus) => (s === "pending" ? 0 : 1);
  return [...list].sort((a, b) => {
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    // createdAt is null briefly for a just-created doc (server timestamp pending): treat as newest.
    const at = a.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bt = b.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return bt - at;
  });
}

export function useLeaveRequests(identity: ReadyIdentity) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { uid, role, orgId, managerId } = identity;

  useEffect(() => {
    const constraints = constraintsFor({ status: "ready", uid, role, orgId, managerId });
    if (!constraints) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    return onSnapshot(
      query(collection(firestoreDb, COLLECTION), ...constraints),
      (snap) => {
        const rows = snap.docs
          .map(fromSnapshot)
          .filter((r): r is LeaveRequest => r !== null);
        setRequests(sortRequests(rows));
        setLoading(false);
      },
      (err) => {
        setError(friendlyError(err, "Couldn't load leave requests."));
        setLoading(false);
      },
    );
  }, [uid, role, orgId, managerId]);

  /** Employee creates their own request. Identity fields come from token claims. */
  const submit = useCallback(
    async (input: LeaveFormInput) => {
      if (role !== "employee" || !managerId) {
        throw new Error("Only employees assigned to a manager can request leave.");
      }
      const note = input.note.trim();
      // A label for the manager's list only. It is typed by the employee's own account, so it is
      // never used to decide anything.
      const me = firebaseAuth.currentUser;
      const employeeName = (me?.displayName || me?.email || "").trim().slice(0, NAME_MAX_LENGTH);
      try {
        await addDoc(collection(firestoreDb, COLLECTION), {
          orgId,
          managerId,
          employeeId: uid,
          ...(employeeName ? { employeeName } : {}),
          type: input.type,
          startDate: input.startDate,
          endDate: input.endDate,
          ...(note ? { note } : {}),
          status: "pending",
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        throw new Error(friendlyError(err, "Couldn't submit your request. Try again."));
      }
    },
    [uid, role, orgId, managerId],
  );

  /** Manager/admin changes ONLY status, reviewedBy, reviewedAt. */
  const review = useCallback(
    async (id: string, decision: Exclude<LeaveStatus, "pending">) => {
      if (role !== "manager" && role !== "org_admin") {
        throw new Error("You can't review requests.");
      }
      try {
        await updateDoc(doc(firestoreDb, COLLECTION, id), {
          status: decision,
          reviewedBy: uid,
          reviewedAt: serverTimestamp(),
        });
      } catch (err) {
        throw new Error(friendlyError(err, "Couldn't update the request. Try again."));
      }
    },
    [uid, role],
  );

  return { requests, loading, error, submit, review };
}