import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/**
 * https://nextjs.org/docs/app/api-reference/config/next-config-js
 */
const nextConfig: NextConfig = {
  // Docker standalone output
  ...(process.env.DOCKER_BUILD === 'true' && { output: 'standalone' }),

  /* config options here */
  devIndicators: false,

  // ESM-only packages that need transpiling for Next.js/webpack compatibility
  transpilePackages: ['react-markdown'],

  // https://nextjs.org/docs/architecture/nextjs-compiler#remove-console
  // Remove all console.* calls in production only
  compiler: {
    // removeConsole: process.env.NODE_ENV === 'production',
  },

  // Webpack configuration for Tldraw
  webpack: (config, { isServer }) => {
    // Resolve a package only if it exists to avoid dev server crash
    const safeResolve = (pkg: string) => {
      try {
        return require.resolve(pkg);
      } catch {
        return undefined;
      }
    };

    // Resolve tldraw libraries to avoid duplicate imports
    const tldrawAliases: Record<string, string> = {};
    const candidates = [
      '@tldraw/utils',
      '@tldraw/state',
      '@tldraw/state-react',
      '@tldraw/store',
      '@tldraw/validate',
      '@tldraw/tlschema',
      '@tldraw/editor',
      'tldraw',
    ];
    for (const pkg of candidates) {
      const resolved = safeResolve(pkg);
      if (resolved) {
        tldrawAliases[pkg] = resolved;
      }
    }

    config.resolve.alias = {
      ...config.resolve.alias,
      ...tldrawAliases,
    };

    // Fix hotkeys-js import issue - force ESM resolution
    if (!isServer) {
      config.resolve.alias['hotkeys-js'] = require.resolve('hotkeys-js');
    }

    return config;
  },

  images: {
    // https://vercel.com/docs/image-optimization/managing-image-optimization-costs#minimizing-image-optimization-costs
    // https://nextjs.org/docs/app/api-reference/components/image#unoptimized
    // vercel has limits on image optimization, 1000 images per month
    unoptimized: process.env.DISABLE_IMAGE_OPTIMIZATION === 'true',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'randomuser.me',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'ik.imagekit.io',
      },
      {
        protocol: 'https',
        hostname: 'html.tailus.io',
      },
      {
        protocol: 'https',
        hostname: 'static-main.aiyeshi.cn',
      },
      {
        protocol: 'https',
        hostname: 'outfittest.oss-cn-beijing.aliyuncs.com',
      },
      {
        protocol: 'http',
        hostname: 'dashscope-result-sh.oss-cn-shanghai.aliyuncs.com',
      },
    ],
  },
};

/**
 * You can specify the path to the request config file or use the default one (@/i18n/request.ts)
 *
 * https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing#next-config
 */
const withNextIntl = createNextIntlPlugin();

/**
 * https://fumadocs.dev/docs/ui/manual-installation
 * https://fumadocs.dev/docs/mdx/plugin
 */
const withMDX = createMDX();

export default withMDX(withNextIntl(nextConfig));
