import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { assertBoardAccess, isBoardModerator, requireActiveViewer } from "./lib/auth";
import { extractMentionUsernames, normalizeForSearch } from "./lib/text";

export const listByBoard = query({
  args: {
    boardId: v.id("boards"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    await assertBoardAccess(ctx, viewer, args.boardId, "read");

    return ctx.db
      .query("posts")
      .withIndex("by_board_created_at", (q: any) => q.eq("boardId", args.boardId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const searchByBoard = query({
  args: {
    boardId: v.id("boards"),
    searchTerm: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    await assertBoardAccess(ctx, viewer, args.boardId, "read");

    return ctx.db
      .query("posts")
      .withSearchIndex("search_body", (q: any) =>
        q.search("bodyForSearch", normalizeForSearch(args.searchTerm)).eq("boardId", args.boardId),
      )
      .paginate(args.paginationOpts);
  },
});

export const create = mutation({
  args: {
    boardId: v.id("boards"),
    body: v.string(),
    attachmentKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    await assertBoardAccess(ctx, viewer, args.boardId, "read");

    if (!args.body.trim()) {
      throw new Error("Message body cannot be empty.");
    }

    const mentions = extractMentionUsernames(args.body);
    const mentionedIds = new Set<string>();

    for (const username of mentions) {
      const mentioned = await ctx.db
        .query("users")
        .withIndex("by_username", (q: any) => q.eq("username", username))
        .unique();

      if (mentioned?.status === "active") {
        mentionedIds.add(mentioned._id);
      }
    }

    const attachmentKeys = args.attachmentKeys ?? [];

    for (const key of attachmentKeys) {
      const existingFile = await ctx.db
        .query("files")
        .withIndex("by_key", (q: any) => q.eq("key", key))
        .unique();

      if (existingFile && existingFile.boardId !== args.boardId) {
        throw new Error("Attachment key belongs to another board.");
      }

      if (!existingFile) {
        await ctx.db.insert("files", {
          key,
          boardId: args.boardId,
          uploadedBy: viewer._id,
          uploadedAt: Date.now(),
        });
      }
    }

    const postId = await ctx.db.insert("posts", {
      boardId: args.boardId,
      authorId: viewer._id,
      body: args.body,
      bodyForSearch: normalizeForSearch(args.body),
      mentions: Array.from(mentionedIds) as any,
      attachmentKeys,
      createdAt: Date.now(),
    });

    for (const key of attachmentKeys) {
      const row = await ctx.db
        .query("files")
        .withIndex("by_key", (q: any) => q.eq("key", key))
        .unique();
      if (row) {
        await ctx.db.patch(row._id, { postId });
      }
    }

    await ctx.runMutation(internal.notifications.notifyMentions, { postId });

    return await ctx.db.get(postId);
  },
});

export const remove = mutation({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    const post = await ctx.db.get(args.postId);

    if (!post) {
      throw new Error("Post not found.");
    }

    const canModerate = await isBoardModerator(ctx, viewer, post.boardId);
    const isAuthor = post.authorId === viewer._id;

    if (!canModerate && !isAuthor) {
      throw new Error("Insufficient permissions to delete this post.");
    }

    await ctx.db.patch(post._id, {
      deletedAt: Date.now(),
      body: "[deleted]",
      bodyForSearch: "",
    });

    return { ok: true };
  },
});
