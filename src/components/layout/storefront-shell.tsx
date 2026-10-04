import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { AssistantWidget } from "@/components/storefront/assistant-widget";
import { getPrivateSettings } from "@/server/repos/settings";

export async function StorefrontShell({ children }: { children: React.ReactNode }) {
  const priv = await getPrivateSettings().catch(() => null);
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SiteFooter />
      {priv?.assistant.customerEnabled !== false && <AssistantWidget />}
    </>
  );
}
