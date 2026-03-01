import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertValidUsername,
  findUserByWorkosId,
  getWorkosUserId,
  normalizeEmail,
  requireActiveViewer,
  requireAdmin,
  requireIdentity,
  requireViewer,
} from "./lib/auth";
import { normalizeUsername } from "./lib/text";

const DEFAULT_ROLE = "member" as const;

async function getUniqueUsername(ctx: any, rawUsername: string, fallbackEmail: string) {
  const base = normalizeUsername(rawUsername) || normalizeUsername(fallbackEmail.split("@")[0] ?? "member");
  const prefix = base.slice(0, 24) || "member";

  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? prefix : `${prefix}${i}`.slice(0, 32);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q: any) => q.eq("username", candidate))
      .unique();

    if (!existing) {
      return candidate;
    }
  }

  return `${prefix}${crypto.randomUUID().slice(0, 6)}`.slice(0, 32);
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const workosUserId = getWorkosUserId(identity);
    return findUserByWorkosId(ctx, workosUserId);
  },
});

export const syncCurrentUser = mutation({
  args: {
    inviteToken: v.optional(v.string()),
    requestedUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const workosUserId = getWorkosUserId(identity);
    const email = normalizeEmail(identity.email ?? "");

    if (!email) {
      throw new Error("WorkOS token must include email.");
    }

    const now = Date.now();
    const existing = await findUserByWorkosId(ctx, workosUserId);

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSeenAt: now,
      });
      return (await ctx.db.get(existing._id)) ?? existing;
    }

    let invite = null;
    if (args.inviteToken) {
      invite = await ctx.db
        .query("invites")
        .withIndex("by_token", (q: any) => q.eq("token", args.inviteToken))
        .unique();
    }

    if (!invite) {
      invite = await ctx.db
        .query("invites")
        .withIndex("by_email", (q: any) => q.eq("email", email))
        .filter((q: any) => q.eq(q.field("usedAt"), undefined))
        .first();
    }

    const inviteIsValid =
      !!invite &&
      !invite.usedAt &&
      invite.expiresAt > now &&
      normalizeEmail(invite.email) === email;

    const username = await getUniqueUsername(
      ctx,
      args.requestedUsername ?? email.split("@")[0] ?? "member",
      email,
    );

    const userId = await ctx.db.insert("users", {
      workosUserId,
      email,
      username,
      role: DEFAULT_ROLE,
      status: inviteIsValid ? "active" : "pending",
      inviteId: inviteIsValid ? invite._id : undefined,
      approvedAt: inviteIsValid ? now : undefined,
      approvedBy: inviteIsValid ? invite.invitedBy : undefined,
      mentionEmails: true,
      mentionPush: true,
      lastSeenAt: now,
    });

    if (inviteIsValid) {
      await ctx.db.patch(invite._id, {
        usedAt: now,
        acceptedBy: userId,
      });
    }

    return await ctx.db.get(userId);
  },
});

export const updateUsername = mutation({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    const username = normalizeUsername(args.username);
    assertValidUsername(username);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q: any) => q.eq("username", username))
      .unique();

    if (existing && existing._id !== viewer._id) {
      throw new Error("Username already taken.");
    }

    await ctx.db.patch(viewer._id, { username });
    return await ctx.db.get(viewer._id);
  },
});

export const updateMentionPreferences = mutation({
  args: {
    mentionEmails: v.boolean(),
    mentionPush: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    await ctx.db.patch(viewer._id, args);
    return await ctx.db.get(viewer._id);
  },
});

export const listPendingUsers = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    requireAdmin(viewer);

    return ctx.db
      .query("users")
      .withIndex("by_status", (q: any) => q.eq("status", "pending"))
      .collect();
  },
});

export const approveUser = mutation({
  args: {
    userId: v.id("users"),
    role: v.optional(v.union(v.literal("admin"), v.literal("moderator"), v.literal("member"))),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireAdmin(viewer);

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found.");
    }

    await ctx.db.patch(user._id, {
      status: "active",
      approvedAt: Date.now(),
      approvedBy: viewer._id,
      role: args.role ?? user.role,
    });

    return await ctx.db.get(user._id);
  },
});

export const setUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("moderator"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireAdmin(viewer);

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found.");
    }

    await ctx.db.patch(user._id, {
      role: args.role,
    });

    return await ctx.db.get(user._id);
  },
});
