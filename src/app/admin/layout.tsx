import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminPage } from "@/server/auth/session";
import { isSimulated } from "@/server/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Authoritative check on every admin render: verified, non-revoked session cookie AND admin custom claim.
  // The middleware redirect is only an early convenience.
  const user = await requireAdminPage("/admin");
  return (
    <AdminShell user={user.email ?? user.phone ?? "Administrator"} simulated={isSimulated()}>
      {children}
    </AdminShell>
  );
}
