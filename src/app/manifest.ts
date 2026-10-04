import type { MetadataRoute } from "next";

/**
 * Web app manifest (name, colours, start URL). This does NOT make the site an offline-capable PWA: there is no service worker,
 * so nothing works offline. Add-to-home-screen metadata only.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Raj Raani Collections",
    short_name: "Raj Raani",
    description: "Indian lehengas and occasionwear",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f3",
    theme_color: "#4a1020",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
