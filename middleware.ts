import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/signin"]);
const isPublicRoute = createRouteMatcher(["/signin", "/api/auth(.*)"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isAuthenticated = await convexAuth.isAuthenticated();

  if (isSignInPage(request) && isAuthenticated) {
    return nextjsMiddlewareRedirect(request, "/");
  }

  if (!isPublicRoute(request) && !isAuthenticated) {
    return nextjsMiddlewareRedirect(request, "/signin");
  }
}, {
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
