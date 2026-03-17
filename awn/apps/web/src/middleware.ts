import { authkitMiddleware } from "@workos-inc/authkit-nextjs";
import { getWorkosRedirectUri } from "@/lib/workos";

export default authkitMiddleware({
  redirectUri: getWorkosRedirectUri(),
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/", "/sign-in", "/sign-up", "/auth/callback"],
  },
  signUpPaths: ["/sign-up"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
