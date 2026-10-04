import { requireAdminPage } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Authoritative check on every admin render (the proxy is only an early redirect, never the only gate).
  await requireAdminPage("/admin");
  return <div className="admin-shell min-h-dvh">{children}</div>;
}
