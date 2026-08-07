/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable static generation for error pages
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
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

export default nextConfig;
