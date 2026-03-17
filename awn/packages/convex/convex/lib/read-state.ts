import type { Doc, Id } from "../_generated/dataModel";

type ReadStateCtx = {
  db: {
    insert: (table: string, value: any) => Promise<any>;
    patch: (id: string, value: any) => Promise<void>;
    query: (table: string) => any;
  };
};

export async function getBoardReadState(
  ctx: Pick<ReadStateCtx, "db">,
  userId: Id<"users">,
  boardId: Id<"boards">,
) {
  return ctx.db
    .query("boardReads")
    .withIndex("by_board_user", (q: any) => q.eq("boardId", boardId).eq("userId", userId))
    .unique() as Promise<Doc<"boardReads"> | null>;
}

export async function recordBoardReadHead(
  ctx: ReadStateCtx,
  args: {
    boardId: Id<"boards">;
    userId: Id<"users">;
    lastReadPostId: Id<"posts">;
    lastReadAt: number;
  },
) {
  const existing = await getBoardReadState(ctx, args.userId, args.boardId);
  const updatedAt = Date.now();

  if (existing) {
    if (args.lastReadAt < existing.lastReadAt) {
      return;
    }

    if (args.lastReadAt === existing.lastReadAt && existing.lastReadPostId === args.lastReadPostId) {
      return;
    }

    await ctx.db.patch(existing._id, {
      lastReadPostId: args.lastReadPostId,
      lastReadAt: args.lastReadAt,
      updatedAt,
    });
    return;
  }

  await ctx.db.insert("boardReads", {
    boardId: args.boardId,
    userId: args.userId,
    lastReadPostId: args.lastReadPostId,
    lastReadAt: args.lastReadAt,
    updatedAt,
  });
}
