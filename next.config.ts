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

  // Keep retired API-key installers and marketplace artifacts out of the
  // public onboarding path. Existing bookmarks land on the single OAuth page
  // instead of silently installing an incompatible legacy Skill.
  async redirects() {
    return [
      {
        source: '/downloads/one-worker-os-install.mjs',
        destination: '/onework',
        permanent: true,
      },
      {
        source: '/downloads/one-worker-os-workbuddy-skill-latest.zip',
        destination: '/onework',
        permanent: true,
      },
      {
        source: '/downloads/one-worker-os-workbuddy-skill-release.json',
        destination: '/onework',
        permanent: true,
      },
      {
        source: '/downloads/oneworkos-workbuddy-skill-latest.zip',
        destination: '/onework',
        permanent: true,
      },
      {
        source: '/downloads/oneworkos-workbuddy-skill-release.json',
        destination: '/onework',
        permanent: true,
      },
      ...[
        '/downloads/one-worker-os-workbuddy-skill-1.0.0.zip',
        '/downloads/one-worker-os-workbuddy-skill-1.0.0.zip.sha256',
        '/downloads/one-worker-os-workbuddy-skill-1.0.3.zip',
        '/downloads/one-worker-os-workbuddy-skill-1.0.3.zip.sha256',
        '/downloads/oneworkos-workbuddy-skill-0.2.0.zip',
        '/downloads/oneworkos-workbuddy-skill-0.2.0.zip.sha256',
        '/downloads/oneworkos-workbuddy-skill-0.2.1.zip',
        '/downloads/oneworkos-workbuddy-skill-0.2.1.zip.sha256',
        '/downloads/oneworkos-workbuddy-skill-0.2.2.zip',
        '/downloads/oneworkos-workbuddy-skill-0.2.2.zip.sha256',
        '/onework-marketplace/one-work-os-plugin-0.1.0.zip',
        '/onework-marketplace/one-work-os-plugin-0.1.0.zip.sha256',
        '/onework-marketplace/one-work-os-plugin-0.1.1.zip',
        '/onework-marketplace/one-work-os-plugin-0.1.1.zip.sha256',
        '/onework-marketplace/one-work-os-plugin-0.1.2.zip',
        '/onework-marketplace/one-work-os-plugin-0.1.2.zip.sha256',
        '/onework-marketplace/one-work-os-plugin-0.1.3.zip',
        '/onework-marketplace/one-work-os-plugin-0.1.3.zip.sha256',
        '/onework-marketplace/onework-os-marketplace-0.1.0.zip',
        '/onework-marketplace/onework-os-marketplace-0.1.0.zip.sha256',
        '/onework-marketplace/onework-os-marketplace-0.1.1.zip',
        '/onework-marketplace/onework-os-marketplace-0.1.1.zip.sha256',
        '/onework-marketplace/onework-os-marketplace-0.1.2.zip',
        '/onework-marketplace/onework-os-marketplace-0.1.2.zip.sha256',
        '/onework-marketplace/onework-os-marketplace-0.1.3.zip',
        '/onework-marketplace/onework-os-marketplace-0.1.3.zip.sha256',
      ].map((source) => ({
        source,
        destination: '/onework',
        permanent: true,
      })),
      ...[
        ...['1.0.0', '1.0.1', '1.0.3', '1.0.4', '1.0.5'].flatMap((version) => [
          `/one-worker-os-marketplace/one-worker-os-plugin-${version}.zip`,
          `/one-worker-os-marketplace/one-worker-os-plugin-${version}.zip.sha256`,
          `/one-worker-os-marketplace/one-worker-os-marketplace-${version}.zip`,
          `/one-worker-os-marketplace/one-worker-os-marketplace-${version}.zip.sha256`,
        ]),
        '/one-worker-os-universal/one-worker-os-universal-1.0.0.zip',
        '/one-worker-os-universal/one-worker-os-universal-1.0.0.zip.sha256',
        '/one-worker-os-universal/one-worker-os-universal-1.0.1.zip',
        '/one-worker-os-universal/one-worker-os-universal-1.0.1.zip.sha256',
      ].map((source) => ({
        source,
        destination: '/onework',
        permanent: true,
      })),
      {
        source: '/onework-marketplace/release.json',
        destination: '/onework',
        permanent: true,
      },
    ];
  },

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
        hostname: 'xiaohongshu-1251991248.cos.ap-chengdu.myqcloud.com',
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
