import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@surewina/ui', '@surewina/api-client', '@surewina/types', '@surewina/utils'],
};

export default nextConfig;
