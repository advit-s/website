import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { C, col, decodeCursor, encodeCursor } from "../repos/common";
import type { LogMessage } from "./assistant-common";

export interface ConversationRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  simulated: boolean;
  escalated: boolean;
  signedIn: boolean;
  messageCount: number;
  preview: string;
  messages: LogMessage[];
}

/**
 * Customer assistant conversations for staff review (newest first, cursor-paginated). Transcripts were redacted at write time;
 * they are redacted AGAIN and truncated here, and the visitor identity is reduced to "signed in or not". Admin-assistant sessions
 * (kind=admin) are private to each admin and are never listed here.
 */
export async function listCustomerConversations(cursor: string | null, limit = 15): Promise<{ rows: ConversationRow[]; nextCursor: string | null }> {
  let q: FirebaseFirestore.Query = col(C.assistantLogs).where("kind", "==", "customer").orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  const c = decodeCursor(cursor);
  if (c) q = q.startAfter(c.value, c.id);
  const snap = await q.limit(limit + 1).get();
  const docs = snap.docs.slice(0, limit);
  const rows = docs.map((d) => {
    const x = d.data() as { createdAt: string; updatedAt: string; simulated?: boolean; escalated?: boolean; userId: string | null; messages: LogMessage[] };
    const messages = (x.messages ?? []).filter((m) => m.role !== "tool").slice(-20).map((m) => ({ ...m, text: m.text.slice(0, 600) }));
    return { id: d.id, createdAt: x.createdAt, updatedAt: x.updatedAt, simulated: Boolean(x.simulated), escalated: Boolean(x.escalated), signedIn: Boolean(x.userId), messageCount: x.messages?.length ?? 0, preview: (messages.find((m) => m.role === "user")?.text ?? "").slice(0, 100), messages };
  });
  return { rows, nextCursor: snap.docs.length > limit && docs.length ? encodeCursor((docs.at(-1)!.data() as { createdAt: string }).createdAt, docs.at(-1)!.id) : null };
}

/** Retention: delete assistant conversations older than the configured number of days (bounded per run; run on a schedule). */
export async function purgeOldAssistantLogs(limit = 200): Promise<{ deleted: number }> {
  const { getPrivateSettings } = await import("../repos/settings");
  const days = (await getPrivateSettings()).assistant.retentionDays;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const snap = await col(C.assistantLogs).where("createdAt", "<", cutoff).orderBy("createdAt").limit(limit).get();
  const b = col(C.assistantLogs).firestore.batch();
  snap.docs.forEach((d) => b.delete(d.ref));
  await b.commit();
  return { deleted: snap.size };
}
