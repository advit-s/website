import type { Metadata } from "next";
import { requireAdminPage } from "@/server/auth/session";
import { getPrivateSettings, getPublicSettingsFresh } from "@/server/repos/settings";
import { getListing } from "@/server/repos/catalog";
import { integrationStatus } from "@/server/services/integrations";
import { allUnresolved } from "@/config/legal";
import { SettingsForm } from "@/components/admin/settings-form";
import { CouponsManager, type CouponRow } from "@/components/admin/coupons-manager";
import { Card } from "@/components/admin/admin-shell";
import { PageHeader } from "@/components/admin/admin-shell";
import { C, col } from "@/server/repos/common";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  await requireAdminPage("/admin/settings");
  const [pub, priv, listing, doc, couponSnap, outbox] = await Promise.all([
    getPublicSettingsFresh(),
    getPrivateSettings(),
    getListing(),
    col(C.settings).doc("public").get(),
    col(C.coupons).orderBy("createdAt", "desc").limit(50).get(),
    col(C.outbox).orderBy("createdAt", "desc").limit(8).get(),
  ]);
  const coupons = couponSnap.docs.map((d) => ({ ...(d.data() as Omit<CouponRow, "code">), code: d.id }));
  const previews = outbox.docs.map((d) => d.data() as { kind: string; status: string; createdAt: string; preview: { subject: string; body: string } | null; simulated: boolean; to: { email?: string | null; admin?: boolean } });
  return (
    <>
      <PageHeader title="Settings" description="Store details, homepage content, delivery and COD rules, and launch readiness. Changes appear in the storefront within seconds." />
      <SettingsForm
        initialPublic={pub}
        initialPrivate={priv}
        updatedAt={(doc.data() as { updatedAt?: string } | undefined)?.updatedAt ?? null}
        products={listing.map((p) => ({ id: p.id, name: p.name }))}
        status={integrationStatus()}
        unresolved={allUnresolved(pub)}
      />
      <div className="mt-6 space-y-5">
        <CouponsManager coupons={coupons} />
        <Card title="Recent message previews">
          <p className="mb-3 text-sm text-ink-muted">No messaging provider is connected. In the local demo, messages are stored here as <strong>previews</strong> and are <strong>not sent</strong>; in a live build they are marked <strong>unavailable</strong> instead of being silently dropped. Choosing a provider is an owner decision (docs/OWNER_SETUP.md).</p>
          {previews.length === 0 ? <p className="text-sm text-ink-muted">No messages yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {previews.map((m, i) => (
                <li key={i} className="py-2">
                  <p className="font-medium">{m.preview?.subject ?? m.kind} <span className="text-xs font-normal text-ink-muted">({m.status === "previewed" ? "preview only - not sent" : m.status === "unavailable" ? "NOT SENT - no channel configured" : m.status === "delivered" ? "delivered" : m.status}{m.to.admin ? ", to staff" : ""})</span></p>
                  <p className="text-ink-muted">{m.preview?.body ?? "Waiting to be processed (run the outbox job)."}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
