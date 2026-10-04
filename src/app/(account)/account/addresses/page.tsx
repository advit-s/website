import type { Metadata } from "next";
import { requireUserPage } from "@/server/auth/session";
import { listAddresses } from "@/server/repos/addresses";
import { AddressesManager } from "@/components/account/addresses-manager";

export const metadata: Metadata = { title: "Saved addresses", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const user = await requireUserPage("/account/addresses");
  return <AddressesManager initial={await listAddresses(user.uid)} />;
}
