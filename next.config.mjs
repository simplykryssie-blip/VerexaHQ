import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable static generation for error pages
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
  webpack: (config) => {
    // pdfjs-dist's build has a conditional require("canvas") for Node-side
    // rendering that's never actually reached in the browser (we only ever
    // load it client-side, for the Document template's click-to-place PDF
    // field tool) -- webpack still tries to resolve it statically and fails
    // since "canvas" is a native module we don't install. Aliasing it away
    // is the standard fix for pdfjs-dist under webpack.
    config.resolve.alias.canvas = false;
    return config;
  },
  experimental: {
    // Every list page in this app is force-dynamic because it reads
    // live workspace data, but Next's client-side Router Cache still
    // holds a dynamic route's RSC payload for 30s by default -- so
    // creating a record elsewhere and navigating back to its list
    // within that window can show a stale snapshot from before the
    // record existed. Set to 0 so dynamic routes always refetch.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default withSentryConfig(nextConfig, {
  // Source map upload only runs when SENTRY_AUTH_TOKEN/org/project are set
  // (see .env.local.example) -- without them this step silently no-ops
  // rather than failing the build, so Sentry stays fully optional.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
