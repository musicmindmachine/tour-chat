import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_LENGTH = 8;
const OTP_MAX_AGE_SECONDS = 60 * 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UserRole = "admin" | "user";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  session: {
    totalDurationMs: THIRTY_DAYS_MS,
    inactiveDurationMs: THIRTY_DAYS_MS,
  },
  providers: [
    Email({
      id: "resend",
      name: "Resend",
      apiKey: process.env.AUTH_RESEND_KEY,
      from:
        process.env.AUTH_RESEND_FROM ??
        "Drop Tuning Box <onboarding@resend.dev>",
      maxAge: OTP_MAX_AGE_SECONDS,
      generateVerificationToken: async () => generateOtpCode(),
      authorize: async (params, account) => {
        if (typeof params.email !== "string") {
          throw new Error("Email is required to verify a sign-in code.");
        }
        if (typeof account.providerAccountId !== "string") {
          throw new Error("Invalid account email for verification.");
        }
        const normalizedEmail = normalizeEmail(params.email);
        if (
          normalizeEmail(account.providerAccountId) !== normalizedEmail
        ) {
          throw new Error("Invalid sign-in code for this email.");
        }
      },
      sendVerificationRequest: async ({ identifier, token, expires, provider }) => {
        if (!provider.apiKey) {
          throw new Error("Missing AUTH_RESEND_KEY for OTP email delivery.");
        }
        const minutesRemaining = Math.max(
          1,
          Math.ceil((expires.getTime() - Date.now()) / (60 * 1000)),
        );

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: "Your Drop Tuning Box sign-in code",
            html: buildOtpEmailHtml(token, minutesRemaining),
            text: buildOtpEmailText(token, minutesRemaining),
          }),
        });

        if (!response.ok) {
          throw new Error(`Resend error: ${JSON.stringify(await response.json())}`);
        }
      },
    }),
  ],
  callbacks: {
    createOrUpdateUser: async (ctx, args) => {
      return await createOrUpdateUserWithAllowlist(ctx as MutationCtx, {
        existingUserId: args.existingUserId as Id<"users"> | null,
        profile: args.profile,
      });
    },
  },
});

async function createOrUpdateUserWithAllowlist(
  ctx: MutationCtx,
  args: {
    existingUserId: Id<"users"> | null;
    profile: Record<string, unknown> & {
      email?: string;
      emailVerified?: boolean;
      name?: string;
      image?: string;
    };
  },
) {
  const email = requireEmail(args.profile.email);
  const now = Date.now();
  const hasAdmin = await hasAnyAdmin(ctx);

  if (args.existingUserId !== null) {
    const existingUser = await ctx.db.get(args.existingUserId);
    if (existingUser === null) {
      throw new Error("The user linked to this account no longer exists.");
    }
    await ctx.db.patch(existingUser._id, {
      email,
      ...optionalProfileFields(args.profile),
      ...(args.profile.emailVerified ? { emailVerificationTime: now } : {}),
      ...(!hasAdmin && existingUser.role !== "admin" ? { role: "admin" } : {}),
    });
    return existingUser._id;
  }

  const allowlistEntry = await ctx.db
    .query("emailAllowlist")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

  if (allowlistEntry === null) {
    throw new Error(
      "This email is not on the allowlist yet. Ask an admin to whitelist it first.",
    );
  }

  const role: UserRole = hasAdmin ? "user" : "admin";
  return await ctx.db.insert("users", {
    email,
    ...optionalProfileFields(args.profile),
    role,
    ...(args.profile.emailVerified ? { emailVerificationTime: now } : {}),
  });
}

function requireEmail(email: unknown) {
  if (typeof email !== "string") {
    throw new Error("Email is required.");
  }
  const normalized = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new Error("Enter a valid email address.");
  }
  return normalized;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function optionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalProfileFields(profile: {
  name?: string;
  image?: string;
}) {
  const name = optionalString(profile.name);
  const image = optionalString(profile.image);
  return {
    ...(name !== undefined ? { name } : {}),
    ...(image !== undefined ? { image } : {}),
  };
}

function generateOtpCode() {
  const random = crypto.getRandomValues(new Uint8Array(OTP_LENGTH));
  return Array.from(random, (value) => (value % 10).toString()).join("");
}

async function hasAnyAdmin(ctx: MutationCtx) {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .take(1);
  return admins.length > 0;
}

function buildOtpEmailText(code: string, expiresInMinutes: number) {
  return [
    "Use this one-time code to sign in to Drop Tuning Box:",
    "",
    code,
    "",
    `This code expires in ${expiresInMinutes} minute${expiresInMinutes === 1 ? "" : "s"}.`,
    "If you did not request this, you can ignore this email.",
  ].join("\n");
}

function buildOtpEmailHtml(code: string, expiresInMinutes: number) {
  return `
<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
  <p>Use this one-time code to sign in to Drop Tuning Box:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:0.25rem;margin:16px 0;">${code}</p>
  <p>This code expires in ${expiresInMinutes} minute${expiresInMinutes === 1 ? "" : "s"}.</p>
  <p style="color:#6b7280;">If you did not request this, you can ignore this email.</p>
</div>
  `.trim();
}
