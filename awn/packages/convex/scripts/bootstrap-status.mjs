#!/usr/bin/env node

import { ConvexHttpClient } from "convex/browser";

const deploymentUrl =
  process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL;

if (!deploymentUrl) {
  console.error("Missing deployment URL. Set CONVEX_URL.");
  process.exit(1);
}

const client = new ConvexHttpClient(deploymentUrl);

try {
  const status = await client.query("bootstrap:status", {});
  console.log(JSON.stringify(status, null, 2));
} catch (error) {
  console.error("Status check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
