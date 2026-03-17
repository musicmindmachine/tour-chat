"use client";

import { ConvexProviderWithAuthKit } from "@convex-dev/workos";
import type { NoUserInfo, UserInfo } from "@workos-inc/authkit-nextjs";
import { AuthKitProvider, useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import { ConvexReactClient } from "convex/react";
import { useCallback } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

function useConvexAuthFromWorkOS() {
  const { user, loading } = useAuth();
  const { getAccessToken } = useAccessToken();

  const getToken = useCallback(async () => {
    const token = await getAccessToken();
    return token ?? null;
  }, [getAccessToken]);

  return {
    user,
    isLoading: loading,
    getAccessToken: getToken,
  };
}

type ProvidersProps = {
  children: React.ReactNode;
  initialAuth?: Omit<UserInfo | NoUserInfo, "accessToken">;
};

export function Providers({ children, initialAuth }: ProvidersProps) {
  return (
    <AuthKitProvider initialAuth={initialAuth}>
      {convex ? (
        <ConvexProviderWithAuthKit client={convex} useAuth={useConvexAuthFromWorkOS}>
          {children}
        </ConvexProviderWithAuthKit>
      ) : (
        children
      )}
    </AuthKitProvider>
  );
}
