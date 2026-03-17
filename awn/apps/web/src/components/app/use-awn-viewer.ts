"use client";

import type { FunctionReference } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@awn/convex/convex/api";

type ConvexApi = {
  users: {
    current: FunctionReference<"query">;
    syncCurrentUser: FunctionReference<"mutation">;
  };
};

const convexApi = api as ConvexApi;

export function useAwnViewer(initialInviteToken?: string) {
  const { loading, user } = useAuth();
  const searchParams = useSearchParams();
  const viewer = useQuery(convexApi.users.current);
  const syncCurrentUser = useMutation(convexApi.users.syncCurrentUser);
  const [syncingUser, setSyncingUser] = useState(false);

  const inviteToken = searchParams.get("invite") ?? initialInviteToken;

  useEffect(() => {
    let cancelled = false;

    if (loading || !user || viewer !== null || syncingUser) {
      return () => {
        cancelled = true;
      };
    }

    setSyncingUser(true);

    void syncCurrentUser({
      inviteToken: inviteToken ?? undefined,
      email: user.email,
      workosUserId: user.id,
    })
      .catch((error) => {
        console.error("Failed to sync current user with Convex.", error);
      })
      .finally(() => {
        if (!cancelled) {
          setSyncingUser(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inviteToken, loading, syncCurrentUser, syncingUser, user, viewer]);

  return {
    authLoading: loading,
    syncingUser,
    user,
    viewer,
  };
}
