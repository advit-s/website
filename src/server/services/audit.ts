import "server-only";
import { C, col, newId, nowIso } from "../repos/common";

/** Append-only audit trail of privileged actions. Never contains secrets or full personal data. */
export async function audit(actor: string, action: string, target: string, details: Record<string, unknown> = {}): Promise<void> {
  await col(C.auditLogs).doc(newId("aud_")).set({ actor, action, target, details: JSON.parse(JSON.stringify(details)), at: nowIso() });
}

export function auditInTx(tx: FirebaseFirestore.Transaction, actor: string, action: string, target: string, details: Record<string, unknown> = {}): void {
  tx.set(col(C.auditLogs).doc(newId("aud_")), { actor, action, target, details: JSON.parse(JSON.stringify(details)), at: nowIso() });
}
