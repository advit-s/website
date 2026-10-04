import type { Metadata } from "next";
import { requireAdminPage } from "@/server/auth/session";
import { getPrivateSettings, getPublicSettingsFresh } from "@/server/repos/settings";
import { getListing } from "@/server/repos/catalog";
import { integrationStatus } from "@/server/services/integrations";
import { allUnresolved } from "@/config/legal";
import { SettingsForm } from "@/components/admin/settings-form";
import { PageHeader } from "@/components/admin/admin-shell";
import { C, col } from "@/server/repos/common";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  await requireAdminPage("/admin/settings");
  const [pub, priv, listing, doc] = await Promise.all([getPublicSettingsFresh(), getPrivateSettings(), getListing(), col(C.settings).doc("public").get()]);
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
    </>
  );
}
