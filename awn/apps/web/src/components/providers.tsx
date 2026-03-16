"use client";

import { ConvexProviderWithAuthKit } from "@convex-dev/workos";
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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthKitProvider>
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
