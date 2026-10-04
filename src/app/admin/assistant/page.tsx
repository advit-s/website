import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { requireAdminPage } from "@/server/auth/session";
import { aiMode } from "@/server/providers/ai";
import { getPrivateSettings } from "@/server/repos/settings";
import { listCustomerConversations } from "@/server/services/assistant-review";
import { AdminChat, AssistantSettings } from "@/components/admin/assistant-panels";
import { Card, PageHeader } from "@/components/admin/admin-shell";
import { Badge } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Assistant" };
export const dynamic = "force-dynamic";

const TABS = [
  { id: "conversation", label: "Conversation" },
  { id: "activity", label: "Customer activity" },
  { id: "settings", label: "Settings" },
] as const;

export default async function AdminAssistant({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("/admin/assistant");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "conversation";
  const mode = aiMode();
  const dt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  return (
    <>
      <PageHeader title="Assistant" description="Ask questions about your store, review what the customer assistant has been telling people, and control its limits." />
      <nav aria-label="Assistant sections" className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <Link key={t.id} href={`/admin/assistant${t.id === "conversation" ? "" : `?tab=${t.id}`}`} aria-current={t.id === tab ? "page" : undefined} className={clsx("inline-flex min-h-9 items-center rounded-sm border px-3 text-sm", t.id === tab ? "border-maroon bg-maroon text-white" : "border-line bg-white hover:bg-beige/60")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "conversation" && <AdminChat mode={mode} />}

      {tab === "activity" && (
        <ActivityTab cursor={sp.cursor ?? null} fmt={(s) => dt.format(new Date(s))} />
      )}

      {tab === "settings" && (
        <Card title="Customer assistant settings">
          <AssistantSettings initial={(await getPrivateSettings()).assistant} mode={mode} />
        </Card>
      )}
    </>
  );
}

async function ActivityTab({ cursor, fmt }: { cursor: string | null; fmt: (s: string) => string }) {
  const { rows, nextCursor } = await listCustomerConversations(cursor);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">Personal identifiers (emails, phone numbers, long numbers) are masked before storage. Where the assistant could not help it offers WhatsApp; those conversations are flagged so you can follow up there.</p>
      {rows.length === 0 && <p className="rounded-md border border-line bg-white p-4 text-sm">No customer conversations yet.</p>}
      {rows.map((r) => (
        <details key={r.id} className="rounded-md border border-line bg-white">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm">
            <span className="font-medium">{fmt(r.createdAt)}</span>
            <span className="text-ink-muted">{r.messageCount} messages</span>
            <span className="min-w-0 flex-1 truncate text-ink-muted">&ldquo;{r.preview}&rdquo;</span>
            {r.escalated && <Badge tone="warning">Handed to WhatsApp</Badge>}
            {r.simulated && <Badge tone="neutral">Simulated</Badge>}
            {r.signedIn && <Badge tone="info">Signed in</Badge>}
          </summary>
          <ol className="space-y-2 border-t border-line px-4 py-3 text-sm">
            {r.messages.map((m, i) => (
              <li key={i}>
                <span className="font-semibold">{m.role === "user" ? "Customer" : "Assistant"}:</span> {m.text}
              </li>
            ))}
          </ol>
        </details>
      ))}
      <nav aria-label="Pagination" className="flex justify-between text-sm text-ink-muted">
        <span>{rows.length} shown</span>
        {nextCursor ? <Link href={`/admin/assistant?tab=activity&cursor=${encodeURIComponent(nextCursor)}`} className="text-maroon underline underline-offset-4">Older conversations</Link> : <span>End of list</span>}
      </nav>
    </div>
  );
}
