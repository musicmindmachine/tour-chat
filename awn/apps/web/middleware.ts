import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/", "/sign-in", "/sign-up", "/auth/callback"],
  },
  signUpPaths: ["/sign-up"],
});

export const config = {
  matcher: ["/", "/boards/:path*", "/sign-in", "/sign-up", "/auth/callback"],
};
