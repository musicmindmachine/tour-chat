import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useAuthRequest } from "expo-auth-session";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

WebBrowser.maybeCompleteAuthSession();

const WORKOS_API_BASE = process.env.EXPO_PUBLIC_WORKOS_API_BASE_URL ?? "https://api.workos.com";
const WORKOS_CLIENT_ID = process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID;
const WORKOS_PROVIDER = process.env.EXPO_PUBLIC_WORKOS_PROVIDER ?? "authkit";
const WORKOS_SCREEN_HINT = process.env.EXPO_PUBLIC_WORKOS_SCREEN_HINT ?? "sign-in";
const WORKOS_REDIRECT_SCHEME = process.env.EXPO_PUBLIC_WORKOS_REDIRECT_SCHEME ?? "awn";

const TOKEN_STORE_KEY = "awn.workos.tokens.v1";

type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  organizationId?: string;
};

type TokenPayload = {
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
  organization_id?: string;
  organizationId?: string;
};

const discovery = {
  authorizationEndpoint: `${WORKOS_API_BASE}/user_management/authorize`,
  tokenEndpoint: `${WORKOS_API_BASE}/user_management/authenticate`,
};

function parseTokenPayload(payload: TokenPayload, fallbackRefreshToken?: string): StoredTokens {
  const accessToken = payload.access_token ?? payload.accessToken;
  const refreshToken = payload.refresh_token ?? payload.refreshToken ?? fallbackRefreshToken;

  if (!accessToken || !refreshToken) {
    throw new Error("WorkOS token response is missing access or refresh token.");
  }

  return {
    accessToken,
    refreshToken,
    organizationId: payload.organization_id ?? payload.organizationId,
  };
}

async function persistTokens(tokens: StoredTokens) {
  await SecureStore.setItemAsync(TOKEN_STORE_KEY, JSON.stringify(tokens));
}

async function loadPersistedTokens() {
  const raw = await SecureStore.getItemAsync(TOKEN_STORE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredTokens;
    if (!parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function clearPersistedTokens() {
  await SecureStore.deleteItemAsync(TOKEN_STORE_KEY);
}

export function useWorkOSMobileAuth() {
  const [tokens, setTokens] = useState<StoredTokens | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokensRef = useRef<StoredTokens | null>(null);

  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  const redirectUri = useMemo(
    () =>
      AuthSession.makeRedirectUri({
        scheme: WORKOS_REDIRECT_SCHEME,
        path: "auth/callback",
      }),
    [],
  );

  const authConfig = useMemo(
    () => ({
      clientId: WORKOS_CLIENT_ID ?? "missing-workos-client-id",
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      scopes: [],
      extraParams: {
        provider: WORKOS_PROVIDER,
        screen_hint: WORKOS_SCREEN_HINT,
      },
    }),
    [redirectUri],
  );

  const [request, response, promptAsync] = useAuthRequest(authConfig, discovery);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const stored = await loadPersistedTokens();
      if (!cancelled) {
        setTokens(stored);
        setIsHydrating(false);
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!response) {
      return;
    }

    const completeAuth = async () => {
      if (response.type === "error") {
        setError(response.error?.message ?? "Authentication failed.");
        return;
      }

      if (response.type !== "success") {
        return;
      }

      if (!WORKOS_CLIENT_ID) {
        setError("EXPO_PUBLIC_WORKOS_CLIENT_ID is required.");
        return;
      }

      const code = response.params.code;
      if (!code) {
        setError("Missing authorization code from WorkOS callback.");
        return;
      }

      if (!request?.codeVerifier) {
        setError("Missing PKCE code verifier.");
        return;
      }

      if (response.params.state && request.state && response.params.state !== request.state) {
        setError("State mismatch while completing authentication.");
        return;
      }

      setIsAuthenticating(true);
      setError(null);

      try {
        const tokenResponse = await AuthSession.exchangeCodeAsync(
          {
            clientId: WORKOS_CLIENT_ID,
            code,
            redirectUri,
            extraParams: {
              code_verifier: request.codeVerifier,
            },
          },
          discovery,
        );

        const nextTokens = parseTokenPayload(tokenResponse.rawResponse as TokenPayload);
        await persistTokens(nextTokens);
        setTokens(nextTokens);
      } catch (exchangeError) {
        const message =
          exchangeError instanceof Error ? exchangeError.message : "Failed to exchange code for access token.";
        setError(message);
      } finally {
        setIsAuthenticating(false);
      }
    };

    void completeAuth();
  }, [redirectUri, request, response]);

  const signIn = useCallback(async () => {
    if (!WORKOS_CLIENT_ID) {
      setError("EXPO_PUBLIC_WORKOS_CLIENT_ID is required.");
      return;
    }

    if (!request) {
      setError("Authentication request is still loading. Try again.");
      return;
    }

    await promptAsync();
  }, [promptAsync, request]);

  const signOut = useCallback(async () => {
    await clearPersistedTokens();
    setTokens(null);
    setError(null);
  }, []);

  const fetchAccessToken = useCallback(async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    if (!WORKOS_CLIENT_ID) {
      return null;
    }

    const current = tokensRef.current;
    if (!current) {
      return null;
    }

    if (!forceRefreshToken) {
      return current.accessToken;
    }

    try {
      const refreshed = await AuthSession.refreshAsync(
        {
          clientId: WORKOS_CLIENT_ID,
          refreshToken: current.refreshToken,
          extraParams: current.organizationId ? { organization_id: current.organizationId } : undefined,
        },
        discovery,
      );

      const nextTokens = parseTokenPayload(
        refreshed.rawResponse as TokenPayload,
        current.refreshToken,
      );

      await persistTokens(nextTokens);
      setTokens(nextTokens);
      return nextTokens.accessToken;
    } catch {
      await clearPersistedTokens();
      setTokens(null);
      return null;
    }
  }, []);

  return {
    isLoading: isHydrating || isAuthenticating,
    isAuthenticated: !!tokens,
    error,
    redirectUri,
    signIn,
    signOut,
    fetchAccessToken,
    clearError: () => setError(null),
  };
}
