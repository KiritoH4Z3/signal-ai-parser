const isDev = process.env.NODE_ENV === "development";

// `unsafe-eval` is the dev overlay's requirement, not the app's — production
// never needs it, so it is gated rather than shipped. `unsafe-inline` stays:
// Next inlines its bootstrap script, and a nonce needs per-request rendering,
// which would cost the static prerender of `/` for no real gain here.
const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";

/** @type {import('next').NextConfig} */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value:
      `default-src 'self'; script-src ${scriptSrc}; connect-src 'self'; ` +
      "img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; " +
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
