import "server-only";
import { C, col, nowIso } from "../repos/common";
import { db } from "../firebase/admin";

export interface LogMessage {
  role: "user" | "assistant" | "tool";
  text: string;
  at: string;
}

const MAX_MESSAGES = 40;
const MAX_TEXT = 1500;

/** Mask personal identifiers before text is stored or sent to the model: emails, phone numbers, long digit runs (cards, Aadhaar). */
export function redact(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email removed]")
    .replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, "[phone removed]")
    .replace(/\b(?:\d[ -]?){12,19}\b/g, "[number removed]");
}

/** Strip control characters and cap the length of anything a user typed. */
export function cleanInput(s: string, max = 500): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function appendLog(p: { kind: "customer" | "admin"; sessionId: string; userId: string | null; entries: { role: LogMessage["role"]; text: string }[]; simulated: boolean; escalated?: boolean; tools?: string[] }): Promise<void> {
  const ref = col(C.assistantLogs).doc(p.sessionId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? (snap.data() as { messages: LogMessage[]; createdAt: string; escalated?: boolean; tools?: string[] }) : null;
    const now = nowIso();
    const messages = [...(cur?.messages ?? []), ...p.entries.map((e) => ({ role: e.role, text: redact(e.text).slice(0, MAX_TEXT), at: now }))].slice(-MAX_MESSAGES);
    tx.set(ref, {
      kind: p.kind,
      sessionId: p.sessionId,
      userId: p.userId,
      messages,
      simulated: p.simulated,
      escalated: Boolean(cur?.escalated || p.escalated),
      tools: Array.from(new Set([...(cur?.tools ?? []), ...(p.tools ?? [])])).slice(0, 20),
      createdAt: cur?.createdAt ?? now,
      updatedAt: now,
    });
  });
}

export async function recentHistory(sessionId: string, limit = 6): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const snap = await col(C.assistantLogs).doc(sessionId).get();
  if (!snap.exists) return [];
  const msgs = (snap.data() as { messages: LogMessage[] }).messages.filter((m) => m.role === "user" || m.role === "assistant");
  return msgs.slice(-limit).map((m) => ({ role: m.role as "user" | "assistant", content: m.text.slice(0, 500) }));
}
