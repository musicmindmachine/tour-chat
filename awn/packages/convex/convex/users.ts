import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertValidUsername,
  findUserByWorkosId,
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

    const workosUserId = identity.subject ?? identity.tokenIdentifier;
    if (!workosUserId) {
      return null;
    }

    return findUserByWorkosId(ctx, workosUserId);
  },
});

export const syncCurrentUser = mutation({
  args: {
    inviteToken: v.optional(v.string()),
    requestedUsername: v.optional(v.string()),
    email: v.optional(v.string()),
    workosUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const identityWorkosUserId = identity.subject ?? identity.tokenIdentifier;
    const workosUserId = identityWorkosUserId ?? args.workosUserId;

    if (!workosUserId) {
      throw new Error("WorkOS token is missing a user identifier.");
    }

    if (identityWorkosUserId && args.workosUserId && args.workosUserId !== identityWorkosUserId) {
      throw new Error("Provided WorkOS user ID does not match the authenticated identity.");
    }

    const identityEmail = identity.email ? normalizeEmail(identity.email) : "";
    const providedEmail = args.email ? normalizeEmail(args.email) : "";

    if (identityEmail && providedEmail && identityEmail !== providedEmail) {
      throw new Error("Provided email does not match the authenticated identity.");
    }

    const email = identityEmail || providedEmail;

    if (!email) {
      throw new Error("WorkOS user email is required to create an account.");
    }

    const now = Date.now();
    const existing = await findUserByWorkosId(ctx, workosUserId);

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
    const validInvite = inviteIsValid ? invite : null;

    if (existing) {
      if (validInvite && existing.status !== "active") {
        await ctx.db.patch(existing._id, {
          role: validInvite.role ?? existing.role,
          status: "active",
          inviteId: validInvite._id,
          approvedAt: now,
          approvedBy: validInvite.invitedBy,
          lastSeenAt: now,
        });

        await ctx.db.patch(validInvite._id, {
          usedAt: now,
          acceptedBy: existing._id,
        });
      } else {
        await ctx.db.patch(existing._id, {
          lastSeenAt: now,
        });
      }

      return (await ctx.db.get(existing._id)) ?? existing;
    }

    const username = await getUniqueUsername(
      ctx,
      args.requestedUsername ?? email.split("@")[0] ?? "member",
      email,
    );

    const userId = await ctx.db.insert("users", {
      workosUserId,
      email,
      username,
      role: validInvite ? (validInvite.role ?? DEFAULT_ROLE) : DEFAULT_ROLE,
      status: validInvite ? "active" : "pending",
      inviteId: validInvite?._id,
      approvedAt: validInvite ? now : undefined,
      approvedBy: validInvite?.invitedBy,
      mentionEmails: true,
      mentionPush: true,
      lastSeenAt: now,
    });

    if (validInvite) {
      await ctx.db.patch(validInvite._id, {
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

const roleOrder = {
  admin: 0,
  moderator: 1,
  member: 2,
} as const;

const statusOrder = {
  active: 0,
  pending: 1,
  suspended: 2,
} as const;

export const listDirectory = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireActiveViewer(ctx);
    const users = await ctx.db.query("users").collect();

    return users
      .filter((user) => viewer.role === "admin" || user.status === "active")
      .sort((left, right) => {
        const statusDelta = statusOrder[left.status] - statusOrder[right.status];
        if (statusDelta !== 0) {
          return statusDelta;
        }

        const roleDelta = roleOrder[left.role] - roleOrder[right.role];
        if (roleDelta !== 0) {
          return roleDelta;
        }

        return left.username.localeCompare(right.username);
      })
      .map((user) => ({
        _id: user._id,
        email: viewer.role === "admin" || user._id === viewer._id ? user.email : undefined,
        username: user.username,
        role: user.role,
        status: user.status,
        approvedAt: user.approvedAt,
        lastSeenAt: user.lastSeenAt,
        isSelf: user._id === viewer._id,
      }));
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
