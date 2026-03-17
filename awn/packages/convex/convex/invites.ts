import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { normalizeEmail, requireActiveViewer, requireAdmin } from "./lib/auth";

const inviteRoleValidator = v.union(v.literal("admin"), v.literal("moderator"), v.literal("member"));

function assertCanInviteRole(viewer: { role: string }, role: "admin" | "moderator" | "member") {
  if (role !== "member") {
    requireAdmin(viewer as never);
  }
}

export const createInvite = mutation({
  args: {
    email: v.string(),
    role: v.optional(inviteRoleValidator),
    expiresInHours: v.optional(v.number()),
    boardId: v.optional(v.id("boards")),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    const role = args.role ?? "member";

    const email = normalizeEmail(args.email);
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .unique();

    if (existingUser?.status === "active") {
      throw new Error("That email already belongs to an active member.");
    }

    const token = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = Date.now() + (args.expiresInHours ?? 72) * 60 * 60 * 1000;
    const existingInvite = await ctx.db
      .query("invites")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .filter((q: any) =>
        q.and(
          q.eq(q.field("usedAt"), undefined),
          q.gt(q.field("expiresAt"), Date.now()),
        ),
      )
      .first();
    const effectiveRole = existingInvite?.role ?? role;

    assertCanInviteRole(viewer, effectiveRole);
    assertCanInviteRole(viewer, role);

    let inviteId = existingInvite?._id;

    if (existingInvite) {
      await ctx.db.patch(existingInvite._id, {
        token,
        invitedBy: viewer._id,
        role,
        boardId: args.boardId,
        expiresAt,
      });
    } else {
      inviteId = await ctx.db.insert("invites", {
        token,
        email,
        invitedBy: viewer._id,
        role,
        boardId: args.boardId,
        expiresAt,
      });
    }

    await ctx.runMutation(internal.notifications.sendInviteEmail, {
      email,
      token,
      inviterUsername: viewer.username,
      inviteeRole: role,
    });

    return {
      inviteId,
      token,
      expiresAt,
      role,
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
      role: invite.role ?? "member",
    };
  },
});

export const listOpenInvites = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireActiveViewer(ctx);
    const now = Date.now();
    const source =
      viewer.role === "admin"
        ? await ctx.db.query("invites").collect()
        : await ctx.db
            .query("invites")
            .withIndex("by_invited_by", (q: any) => q.eq("invitedBy", viewer._id))
            .collect();

    const inviterIds = Array.from(new Set(source.map((invite) => invite.invitedBy)));
    const inviters = new Map(
      (
        await Promise.all(
          inviterIds.map(async (userId) => {
            const user = await ctx.db.get(userId);
            return user ? [userId, user.username] : null;
          }),
        )
      ).filter(Boolean) as Array<[typeof viewer._id, string]>,
    );

    return source
      .filter((invite) => !invite.usedAt && invite.expiresAt > now)
      .sort((left, right) => right.expiresAt - left.expiresAt || left.email.localeCompare(right.email))
      .map((invite) => ({
        _id: invite._id,
        email: invite.email,
        role: invite.role ?? "member",
        expiresAt: invite.expiresAt,
        invitedBy: invite.invitedBy,
        inviterUsername: inviters.get(invite.invitedBy) ?? "unknown",
      }));
  },
});
