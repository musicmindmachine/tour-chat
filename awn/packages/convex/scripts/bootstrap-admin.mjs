#!/usr/bin/env node

import { ConvexHttpClient } from "convex/browser";

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith("--")) {
      continue;
    }

    const key = raw.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }

  return args;
}

function toArray(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

const args = parseArgs(process.argv.slice(2));

const deploymentUrl =
  args.url ?? process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL;
const bootstrapSecret = args.secret ?? process.env.BOOTSTRAP_SECRET;

if (!deploymentUrl) {
  console.error("Missing deployment URL. Pass --url or set CONVEX_URL.");
  process.exit(1);
}

if (!bootstrapSecret) {
  console.error("Missing bootstrap secret. Pass --secret or set BOOTSTRAP_SECRET.");
  process.exit(1);
}

if (!args.email && !args.workosUserId) {
  console.error("Provide at least --email or --workosUserId.");
  process.exit(1);
}

const client = new ConvexHttpClient(deploymentUrl);

const payload = {
  bootstrapSecret,
  email: args.email,
  workosUserId: args.workosUserId,
  username: args.username,
  starterBoardName: args.starterBoardName ?? "general",
  starterBoardDescription: args.starterBoardDescription,
  inviteEmails: toArray(args.invites),
  inviteExpiresInHours: args.inviteExpiresInHours ? Number(args.inviteExpiresInHours) : undefined,
};

try {
  const result = await client.mutation("bootstrap:bootstrapAdmin", payload, { skipQueue: true });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Bootstrap failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
