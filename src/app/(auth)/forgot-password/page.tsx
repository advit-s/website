import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPassword } from "@/components/auth/forgot-password";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const oobCode = typeof sp.oobCode === "string" ? sp.oobCode : null;
  const mode = typeof sp.mode === "string" ? sp.mode : null;
  return (
    <AuthShell eyebrow="Reset your password" title="Reset your password" panelLines={["Timeless traditions", "for your next", "chapter."]}>
      <ForgotPassword oobCode={oobCode} mode={mode} />
    </AuthShell>
  );
}
