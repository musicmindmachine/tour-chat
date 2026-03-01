import { R2 } from "@convex-dev/r2";
import { v } from "convex/values";
import type { DataModel } from "./_generated/dataModel";
import { components, internal } from "./_generated/api";
import { action, internalQuery, mutation } from "./_generated/server";
import { assertBoardAccess, isBoardModerator, requireActiveViewer } from "./lib/auth";

const r2 = new R2(components.r2);

const fileClientApi = r2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    await requireActiveViewer(ctx as any);
  },
  checkReadKey: async (ctx, _bucket, key) => {
    const viewer = await requireActiveViewer(ctx as any);
    const file = await (ctx as any).db
      .query("files")
      .withIndex("by_key", (q: any) => q.eq("key", key))
      .unique();

    if (!file) {
      throw new Error("File not found.");
    }

    await assertBoardAccess(ctx as any, viewer, file.boardId, "read");
  },
  checkDelete: async (ctx, _bucket, key) => {
    const viewer = await requireActiveViewer(ctx as any);
    const file = await (ctx as any).db
      .query("files")
      .withIndex("by_key", (q: any) => q.eq("key", key))
      .unique();

    if (!file) {
      throw new Error("File not found.");
    }

    const canModerate = await isBoardModerator(ctx as any, viewer, file.boardId);
    const isOwner = file.uploadedBy === viewer._id;
    if (!canModerate && !isOwner) {
      throw new Error("Insufficient permission to delete file.");
    }
  },
});

export const {
  generateUploadUrl,
  syncMetadata,
  getMetadata,
  listMetadata,
  deleteObject,
} = fileClientApi;

export const attachFileToBoard = mutation({
  args: {
    key: v.string(),
    boardId: v.id("boards"),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    await assertBoardAccess(ctx, viewer, args.boardId, "read");

    const existing = await ctx.db
      .query("files")
      .withIndex("by_key", (q: any) => q.eq("key", args.key))
      .unique();

    if (!existing) {
      await ctx.db.insert("files", {
        key: args.key,
        boardId: args.boardId,
        uploadedBy: viewer._id,
        uploadedAt: Date.now(),
        contentType: args.contentType,
        size: args.size,
      });
      return { ok: true };
    }

    if (existing.boardId !== args.boardId) {
      throw new Error("File is already attached to a different board.");
    }

    await ctx.db.patch(existing._id, {
      contentType: args.contentType ?? existing.contentType,
      size: args.size ?? existing.size,
    });

    return { ok: true };
  },
});

export const canReadFile = internalQuery({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    const file = await ctx.db
      .query("files")
      .withIndex("by_key", (q: any) => q.eq("key", args.key))
      .unique();

    if (!file) {
      return false;
    }

    await assertBoardAccess(ctx, viewer, file.boardId, "read");
    return true;
  },
});

export const getPresignedFileUrl = action({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const canRead = await ctx.runQuery(internal.files.canReadFile, { key: args.key });
    if (!canRead) {
      throw new Error("Unauthorized");
    }

    return r2.getUrl(args.key, { expiresIn: 60 * 15 });
  },
});
