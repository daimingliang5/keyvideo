import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverComponentsExternalPackages: ['supabase'],
  },
  serverRuntimeConfig: {
    maxRequestBodySize: '50mb',
  },
};

export default nextConfig;
