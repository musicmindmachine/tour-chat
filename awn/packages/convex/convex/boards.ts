import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActiveViewer, requireAdmin, assertBoardAccess } from "./lib/auth";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireActiveViewer(ctx);

    return ctx.db
      .query("boards")
      .withIndex("by_created_at")
      .filter((q: any) => q.eq(q.field("isArchived"), false))
      .collect();
  },
});

export const getById = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    return assertBoardAccess(ctx, viewer, args.boardId, "read");
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    requireAdmin(viewer);

    const slug = slugify(args.name);
    const existing = await ctx.db
      .query("boards")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .unique();

    if (existing) {
      throw new Error("Board slug already exists.");
    }

    const boardId = await ctx.db.insert("boards", {
      slug,
      name: args.name,
      description: args.description,
      createdBy: viewer._id,
      createdAt: Date.now(),
      isArchived: false,
    });

    return await ctx.db.get(boardId);
  },
});

export const setArchived = mutation({
  args: {
    boardId: v.id("boards"),
    isArchived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    requireAdmin(viewer);

    await ctx.db.patch(args.boardId, { isArchived: args.isArchived });
    return await ctx.db.get(args.boardId);
  },
});

export const assignModerator = mutation({
  args: {
    boardId: v.id("boards"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    requireAdmin(viewer);

    const board = await ctx.db.get(args.boardId);
    if (!board || board.isArchived) {
      throw new Error("Board not found.");
    }

    const user = await ctx.db.get(args.userId);
    if (!user || user.status !== "active") {
      throw new Error("User must be active to be a moderator.");
    }

    const existing = await ctx.db
      .query("boardModerators")
      .withIndex("by_board_user", (q: any) => q.eq("boardId", args.boardId).eq("userId", args.userId))
      .unique();

    if (!existing) {
      await ctx.db.insert("boardModerators", {
        boardId: args.boardId,
        userId: args.userId,
        addedBy: viewer._id,
        addedAt: Date.now(),
      });
    }

    if (user.role === "member") {
      await ctx.db.patch(user._id, { role: "moderator" });
    }

    return { ok: true };
  },
});

export const removeModerator = mutation({
  args: {
    boardId: v.id("boards"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    requireAdmin(viewer);

    const existing = await ctx.db
      .query("boardModerators")
      .withIndex("by_board_user", (q: any) => q.eq("boardId", args.boardId).eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return { ok: true };
  },
});
