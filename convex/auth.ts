import Resend from "@auth/core/providers/resend";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from:
        process.env.AUTH_RESEND_FROM ??
        "Drop Tuning Box <onboarding@resend.dev>",
    }),
  ],
});
