import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['p5',
  '@duckdb/node-api',
  '@duckdb/node-bindings',
  'remark',
  'rehype',
  'unified'],
  output: 'standalone',
  async headers() {
    return [
      // 1. Global Baseline (Applies COOP to everything)
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      // 2. Target your specific page (Combines BOTH for DuckDB)
      {
        source: '/omenland',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      // 3. Just in case you have sub-pages under omenland later (e.g., /omenland/settings)
      {
        source: '/omenland/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      // 4. Checkout Exemption (Explicitly force COEP off for Stripe/Payments)
      {
        source: '/api/checkout/:path*',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
        ],
      },
    ];
  },
};

export default nextConfig;
import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
