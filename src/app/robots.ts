import type { MetadataRoute } from "next";

/** robots.txt is a crawling hint, NOT access control: private areas are protected by authentication in code. */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const production = process.env.APP_ENV === "production";
  return {
    rules: production ? [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/cart", "/checkout", "/track-order", "/api/", "/login", "/register", "/forgot-password", "/wishlist"] }] : [{ userAgent: "*", disallow: "/" }],
    sitemap: `${base}/sitemap.xml`,
  };
}
