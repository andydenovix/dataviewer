import type { NextConfig } from 'next';

const firebasePackages = [
  'firebase',
  '@firebase/app',
  '@firebase/auth',
  '@firebase/firestore',
  '@firebase/storage',
  '@firebase/analytics',
  '@firebase/app-check',
  '@firebase/component',
  '@firebase/installations',
  '@firebase/logger',
  '@firebase/util',
];

const nextConfig: NextConfig = {
  serverExternalPackages: firebasePackages,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      buffer: false,
    };
    return config;
  },
};

export default nextConfig;