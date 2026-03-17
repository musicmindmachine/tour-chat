import { handleAuth } from "@workos-inc/authkit-nextjs";
import { api } from "@awn/convex/convex/api";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";
import { NextResponse } from "next/server";
import { getWorkosBaseUrl } from "@/lib/workos";

function getConvexUrl() {
  return process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
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
  baseURL: getWorkosBaseUrl(),
  returnPathname: "/",
  onSuccess: async ({ accessToken, state, user }) => {
    const convexUrl = getConvexUrl();

    if (!convexUrl) {
      console.error("Skipping Convex user sync because NEXT_PUBLIC_CONVEX_URL is not set.");
      return;
    }

    const client = new ConvexHttpClient(convexUrl);
    client.setAuth(accessToken);

    try {
      await client.mutation(convexApi.users.syncCurrentUser, {
        inviteToken: getInviteToken(state),
        email: user.email,
        workosUserId: user.id,
      });
    } catch (error) {
      console.error("Convex post-login sync failed.", {
        error: error instanceof Error ? error.message : String(error),
        email: user.email,
      });
    }
  },
  onError: async ({ error, request }) => {
    const description = error instanceof Error ? error.message : "Couldn't sign in.";

    console.error("WorkOS callback failed.", {
      error: description,
      url: request.url,
    });

    return NextResponse.json(
      {
        error: {
          message: "Something went wrong",
          description,
        },
      },
      { status: 500 },
    );
  },
});
