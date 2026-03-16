import { handleAuth } from "@workos-inc/authkit-nextjs";
import { api } from "@awn/convex/convex/api";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";

function getConvexUrl() {
  return process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
}

function getInviteToken(state?: string) {
  if (!state) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(state);
    return typeof parsed?.inviteToken === "string" ? parsed.inviteToken : undefined;
  } catch {
    return undefined;
  }
}

const convexApi = api as {
  users: {
    syncCurrentUser: FunctionReference<"mutation">;
  };
};

export const GET = handleAuth({
  returnPathname: "/",
  onSuccess: async ({ accessToken, state }) => {
    const convexUrl = getConvexUrl();

    if (!convexUrl) {
      console.error("Skipping Convex user sync because NEXT_PUBLIC_CONVEX_URL is not set.");
      return;
    }

    const client = new ConvexHttpClient(convexUrl);
    client.setAuth(accessToken);

    await client.mutation(convexApi.users.syncCurrentUser, {
      inviteToken: getInviteToken(state),
    });
  },
});
