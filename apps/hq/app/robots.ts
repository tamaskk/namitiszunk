import type { MetadataRoute } from "next";

// HQ is for the platform team only (T-066): no crawler gets anything.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
