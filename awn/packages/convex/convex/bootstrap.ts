import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { normalizeEmail } from "./lib/auth";
import { normalizeUsername } from "./lib/text";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

function requireBootstrapSecret(providedSecret: string) {
  const expectedSecret = process.env.BOOTSTRAP_SECRET;

  if (!expectedSecret) {
    throw new Error("BOOTSTRAP_SECRET is not configured in Convex deployment env.");
  }

  if (providedSecret !== expectedSecret) {
    throw new Error("Invalid bootstrap secret.");
  }
}

async function getUniqueUsername(ctx: any, candidate: string, fallbackEmail: string) {
  const base = normalizeUsername(candidate) || normalizeUsername(fallbackEmail.split("@")[0] ?? "admin");
  const prefix = base.slice(0, 24) || "admin";

  for (let i = 0; i < 100; i += 1) {
    const username = i === 0 ? prefix : `${prefix}${i}`.slice(0, 32);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q: any) => q.eq("username", username))
      .unique();

    if (!existing) {
      return username;
    }
  }

  return `${prefix}${crypto.randomUUID().slice(0, 6)}`.slice(0, 32);
}

async function getOrCreateAdminUser(ctx: any, args: {
  email?: string;
  workosUserId?: string;
  username?: string;
}) {
  const email = args.email ? normalizeEmail(args.email) : undefined;
  const now = Date.now();

  let user = null;

  if (args.workosUserId) {
    user = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q: any) => q.eq("workosUserId", args.workosUserId))
      .unique();
  }

  if (!user && email) {
    user = await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .unique();
  }

  if (user) {
    await ctx.db.patch(user._id, {
      role: "admin",
      status: "active",
      approvedAt: now,
      approvedBy: user._id,
      lastSeenAt: now,
    });
    return (await ctx.db.get(user._id)) ?? user;
  }

  if (!email || !args.workosUserId) {
    throw new Error(
      "User not found. Provide both email and workosUserId to create the first admin, or sign in once and retry.",
    );
  }

  const username = await getUniqueUsername(ctx, args.username ?? email.split("@")[0] ?? "admin", email);

  const userId = await ctx.db.insert("users", {
    workosUserId: args.workosUserId,
    email,
    username,
    role: "admin",
    status: "active",
    approvedAt: now,
    approvedBy: undefined,
    mentionEmails: true,
    mentionPush: true,
    lastSeenAt: now,
  });

  await ctx.db.patch(userId, { approvedBy: userId });
  return await ctx.db.get(userId);
}

async function ensureStarterBoard(ctx: any, adminId: any, boardName: string, boardDescription?: string) {
  const slug = slugify(boardName);
  const existing = await ctx.db
    .query("boards")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .unique();

  if (existing) {
    return { boardId: existing._id, created: false };
  }

  const boardId = await ctx.db.insert("boards", {
    slug,
    name: boardName,
    description: boardDescription,
    createdBy: adminId,
    createdAt: Date.now(),
    isArchived: false,
  });

  return { boardId, created: true };
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const [admins, users, boards] = await Promise.all([
      ctx.db
        .query("users")
        .filter((q: any) => q.eq(q.field("role"), "admin"))
        .collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("boards").collect(),
    ]);

    return {
      hasAdmin: admins.length > 0,
      adminCount: admins.length,
      userCount: users.length,
      boardCount: boards.length,
      needsBootstrap: admins.length === 0,
    };
  },
});

export const bootstrapAdmin = mutation({
  args: {
    bootstrapSecret: v.string(),
    email: v.optional(v.string()),
    workosUserId: v.optional(v.string()),
    username: v.optional(v.string()),
    starterBoardName: v.optional(v.string()),
    starterBoardDescription: v.optional(v.string()),
    inviteEmails: v.optional(v.array(v.string())),
    inviteExpiresInHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireBootstrapSecret(args.bootstrapSecret);

    const admin = await getOrCreateAdminUser(ctx, {
      email: args.email,
      workosUserId: args.workosUserId,
      username: args.username,
    });

    if (!admin) {
      throw new Error("Failed to initialize admin user.");
    }

    const boardName = args.starterBoardName?.trim() || "general";
    const starterBoard = await ensureStarterBoard(
      ctx,
      admin._id,
      boardName,
      args.starterBoardDescription,
    );

    const inviteEmails = Array.from(
      new Set((args.inviteEmails ?? []).map((email) => normalizeEmail(email)).filter(Boolean)),
    ).filter((email) => email !== admin.email);

    const createdInvites: Array<{ email: string; token: string; inviteId: string; expiresAt: number }> = [];

    for (const email of inviteEmails) {
      const existing = await ctx.db
        .query("invites")
        .withIndex("by_email", (q: any) => q.eq("email", email))
        .filter((q: any) =>
          q.and(
            q.eq(q.field("usedAt"), undefined),
            q.gt(q.field("expiresAt"), Date.now()),
          ),
        )
        .first();

      if (existing) {
        createdInvites.push({
          email,
          token: existing.token,
          inviteId: existing._id,
          expiresAt: existing.expiresAt,
        });
        continue;
      }

      const token = crypto.randomUUID().replace(/-/g, "");
      const expiresAt = Date.now() + (args.inviteExpiresInHours ?? 72) * 60 * 60 * 1000;
      const inviteId = await ctx.db.insert("invites", {
        token,
        email,
        invitedBy: admin._id,
        boardId: starterBoard.boardId,
        expiresAt,
      });

      await ctx.runMutation(internal.notifications.sendInviteEmail, {
        email,
        token,
        inviterUsername: admin.username,
      });

      createdInvites.push({
        email,
        token,
        inviteId,
        expiresAt,
      });
    }

    return {
      admin: {
        id: admin._id,
        email: admin.email,
        username: admin.username,
      },
      starterBoard,
      invites: createdInvites,
    };
  },
});
