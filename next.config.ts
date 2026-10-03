import type { NextConfig } from 'next';
import { MAX_MEDIA_REQUEST_BYTES } from './src/shared/mediaLimits.ts';

const nextConfig: NextConfig = {
  experimental: { proxyClientMaxBodySize: MAX_MEDIA_REQUEST_BYTES },
};

export default nextConfig;
