const publicConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const serverConvexUrl = process.env.CONVEX_URL;

function warnOnMismatch() {
  if (publicConvexUrl && serverConvexUrl && publicConvexUrl !== serverConvexUrl) {
    console.warn(
      "CONVEX_URL and NEXT_PUBLIC_CONVEX_URL differ. The web app will use NEXT_PUBLIC_CONVEX_URL to avoid split deployments.",
    );
  }
}

export function getClientConvexUrl() {
  return publicConvexUrl;
}

export function getServerConvexUrl() {
  warnOnMismatch();
  return publicConvexUrl ?? serverConvexUrl;
}
