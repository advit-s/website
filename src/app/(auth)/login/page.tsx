import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/server/auth/session";
import { safeNext } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const rawNext = typeof sp.next === "string" ? sp.next : null;
  const session = await getSession();
  // One shared login: the admin custom claim decides the landing page; ?next= is sanitised against open redirects.
  if (session && sp.reauth !== "1") redirect(safeNext(rawNext, session.isAdmin ? "/admin" : "/account"));
  const notice = sp.reauth === "1" ? "For your security, please sign in again to continue." : null;
  return (
    <AuthShell eyebrow="Welcome back" title="Sign in" subtitle="Sign in to your account" panelLines={["Elegance lives", "within you."]}>
      <LoginForm next={safeNext(rawNext, "") || null} notice={notice} />
    </AuthShell>
  );
}
