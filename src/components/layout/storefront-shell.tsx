import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

export function StorefrontShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
