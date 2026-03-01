import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { normalizeEmail, requireViewer, requireAdmin } from "./lib/auth";

export const createInvite = mutation({
  args: {
    email: v.string(),
    expiresInHours: v.optional(v.number()),
    boardId: v.optional(v.id("boards")),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    requireAdmin(viewer);

    const email = normalizeEmail(args.email);
    const token = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = Date.now() + (args.expiresInHours ?? 72) * 60 * 60 * 1000;

    const inviteId = await ctx.db.insert("invites", {
      token,
      email,
      invitedBy: viewer._id,
      boardId: args.boardId,
      expiresAt,
    });

    await ctx.runMutation(internal.notifications.sendInviteEmail, {
      email,
      token,
      inviterUsername: viewer.username,
    });

    return {
      inviteId,
      token,
      expiresAt,
    };
  },
});

export const validateInvite = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .unique();

    if (!invite) {
      return { valid: false as const, reason: "not_found" as const };
    }

    if (invite.usedAt) {
      return { valid: false as const, reason: "already_used" as const };
    }

    if (invite.expiresAt < Date.now()) {
      return { valid: false as const, reason: "expired" as const };
    }

    return {
      valid: true as const,
      email: invite.email,
      expiresAt: invite.expiresAt,
    };
  },
});
