import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { getSession } from "@/server/auth/session";
import { safeNext } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Create your account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const rawNext = typeof sp.next === "string" ? sp.next : null;
  const session = await getSession();
  if (session) redirect(safeNext(rawNext, session.isAdmin ? "/admin" : "/account"));
  return (
    <AuthShell eyebrow="Join our royal family" title="Create your account" subtitle="Save addresses, track orders and check out faster." panelLines={["A new chapter of", "timeless elegance", "begins here."]}>
      <RegisterForm next={safeNext(rawNext, "") || null} />
    </AuthShell>
  );
}
