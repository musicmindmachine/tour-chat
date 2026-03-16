import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel packages this app from the Git repo root, not the nested `awn/`
  // workspace root, so traces need to be rooted one level higher.
  outputFileTracingRoot: fileURLToPath(new URL("../../../", import.meta.url)),
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ["@awn/email", "@awn/convex"],
};

export default nextConfig;
