import type { Metadata } from "next";
import { LegalPage } from "@/components/storefront/legal-page";
import { shippingDoc } from "@/config/legal";
import { getPublicSettings } from "@/server/repos/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const doc = shippingDoc(await getPublicSettings());
  return { title: doc.title, description: doc.intro.slice(0, 155), alternates: { canonical: "/shipping-policy" } };
}

export default async function Page() {
  const s = await getPublicSettings();
  const doc = shippingDoc(s);
  const updated = new Date(s.policy.lastUpdated + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return <LegalPage doc={doc} updated={updated} />;
}
