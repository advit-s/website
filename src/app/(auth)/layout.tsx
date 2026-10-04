import { StorefrontShell } from "@/components/layout/storefront-shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <StorefrontShell>{children}</StorefrontShell>;
}
