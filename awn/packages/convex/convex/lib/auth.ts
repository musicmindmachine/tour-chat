import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

type AuthIdentity = {
  subject?: string;
  tokenIdentifier?: string;
  email?: string;
} | null;

type CtxWithDbAndAuth = {
  db: {
    query: (table: string) => any;
    get: (id: string) => Promise<any>;
  };
  auth: {
    getUserIdentity: () => Promise<AuthIdentity>;
  };
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function assertValidUsername(username: string) {
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    throw new ConvexError(
      "Username must be 3-32 characters and contain only lowercase letters, numbers, and underscore.",
    );
  }
}

export function getWorkosUserId(identity: NonNullable<AuthIdentity>) {
  const id = identity.subject ?? identity.tokenIdentifier;
  if (!id) {
    throw new ConvexError("Auth token is missing a subject.");
  }
  return id;
}

export async function requireIdentity(ctx: CtxWithDbAndAuth) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Authentication required.");
  }
  return identity;
}

export async function findUserByWorkosId(ctx: CtxWithDbAndAuth, workosUserId: string) {
  return ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q: any) => q.eq("workosUserId", workosUserId))
    .unique() as Promise<Doc<"users"> | null>;
}

export async function isBoardModerator(
  ctx: CtxWithDbAndAuth,
  user: Doc<"users">,
  boardId: Id<"boards">,
) {
  if (user.role === "admin") {
    return true;
  }
  if (user.role !== "moderator") {
    return false;
  }

  const assignment = await ctx.db
    .query("boardModerators")
    .withIndex("by_board_user", (q: any) => q.eq("boardId", boardId).eq("userId", user._id))
    .unique();

  return !!assignment;
}

export async function requireViewer(ctx: CtxWithDbAndAuth) {
  const identity = await requireIdentity(ctx);
  const workosUserId = getWorkosUserId(identity);
  const user = await findUserByWorkosId(ctx, workosUserId);

  if (!user) {
    throw new ConvexError("User record not found. Call users.syncCurrentUser first.");
  }

  return user;
}

export async function requireActiveViewer(ctx: CtxWithDbAndAuth) {
  const user = await requireViewer(ctx);
  if (user.status === "suspended") {
    throw new ConvexError("Account is suspended.");
  }
  if (user.status !== "active") {
    throw new ConvexError("Account is pending approval.");
  }
  return user;
}

export function requireAdmin(user: Doc<"users">) {
  if (user.role !== "admin") {
    throw new ConvexError("Admin access required.");
  }
}

export async function assertBoardAccess(
  ctx: CtxWithDbAndAuth,
  user: Doc<"users">,
  boardId: Id<"boards">,
  mode: "read" | "moderate" = "read",
) {
  const board = (await ctx.db.get(boardId)) as Doc<"boards"> | null;
  if (!board || board.isArchived) {
    throw new ConvexError("Board not found.");
  }

  if (mode === "read") {
    return board;
  }

  const canModerate = await isBoardModerator(ctx, user, boardId);
  if (!canModerate) {
    throw new ConvexError("Moderator access required for this board.");
  }

  return board;
}
