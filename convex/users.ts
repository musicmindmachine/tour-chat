import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    return await requireAuthenticatedUser(ctx);
  },
});

export const updateName = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireAuthenticatedUser(ctx);

    const trimmed = args.name.trim();
    await ctx.db.patch(viewer._id, {
      name: trimmed.length > 0 ? trimmed : undefined,
    });

    return { ok: true };
  },
});

export const listEmailAllowlist = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const entries = await ctx.db.query("emailAllowlist").collect();
    return entries.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const addEmailToAllowlist = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const email = requireValidEmail(args.email);

    const existing = await ctx.db
      .query("emailAllowlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing !== null) {
      return existing;
    }

    const entryId = await ctx.db.insert("emailAllowlist", {
      email,
      addedBy: admin._id,
      createdAt: Date.now(),
    });
    return await ctx.db.get(entryId);
  },
});

export const removeEmailFromAllowlist = mutation({
  args: {
    entryId: v.id("emailAllowlist"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.entryId);
    return { ok: true };
  },
});

async function requireAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError("Not signed in.");
  }

  const user = await ctx.db.get(userId);
  if (user === null) {
    throw new ConvexError("Your user account no longer exists.");
  }
  return user;
}

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuthenticatedUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError("Admin access required.");
  }
  return user;
}

function requireValidEmail(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new ConvexError("Enter a valid email address.");
  }
  return email;
}
