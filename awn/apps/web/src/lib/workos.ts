export function getWorkosRedirectUri() {
  return process.env.WORKOS_REDIRECT_URI ?? process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
}

export function getWorkosBaseUrl() {
  const redirectUri = getWorkosRedirectUri();

  if (!redirectUri) {
    return undefined;
  }

  try {
    return new URL(redirectUri).origin;
  } catch {
    return undefined;
  }
}
