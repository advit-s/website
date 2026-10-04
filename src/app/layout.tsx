import type { Metadata, Viewport } from "next";
import { Inter, Montserrat, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/providers/toast";
import { CartProvider } from "@/components/providers/cart";
import { getSession } from "@/server/auth/session";

const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap", weight: ["400", "500", "600"] });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap", weight: ["400", "500", "600"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Raj Raani Collections - Indian lehengas & occasionwear", template: "%s | Raj Raani Collections" },
  description: "Bridal, wedding, festive and party-wear lehengas with made-to-measure options. Delivering across India.",
  applicationName: "Raj Raani Collections",
  openGraph: { type: "website", siteName: "Raj Raani Collections", locale: "en_IN" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#4a1020", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en-IN" className={`${playfair.variable} ${montserrat.variable} ${inter.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <ToastProvider>
          <CartProvider isAuthed={Boolean(session)}>{children}</CartProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
