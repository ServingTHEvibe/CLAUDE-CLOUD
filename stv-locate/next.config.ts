import type { NextConfig } from "next";

// The Vercel test copy has no Cloudflare bindings; point `cloudflare:workers` at an empty stub.
const vercel = process.env.STV_TARGET === "vercel";

const nextConfig: NextConfig = vercel
  ? {
      turbopack: { resolveAlias: { "cloudflare:workers": "./lib/vercel-cloudflare-stub.ts" } },
      webpack: (config) => {
        config.resolve.alias = {
          ...config.resolve.alias,
          "cloudflare:workers": new URL("./lib/vercel-cloudflare-stub.ts", import.meta.url).pathname,
        };
        return config;
      },
      typescript: { ignoreBuildErrors: false },
    }
  : {};

export default nextConfig;
