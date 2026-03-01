import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roles = ["admin", "moderator", "member"] as const;
export const statuses = ["pending", "active", "suspended"] as const;

export default defineSchema({
  users: defineTable({
    workosUserId: v.string(),
    email: v.string(),
    username: v.string(),
    role: v.union(v.literal("admin"), v.literal("moderator"), v.literal("member")),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("suspended")),
    inviteId: v.optional(v.id("invites")),
    approvedAt: v.optional(v.number()),
    approvedBy: v.optional(v.id("users")),
    mentionEmails: v.boolean(),
    mentionPush: v.boolean(),
    lastSeenAt: v.number(),
  })
    .index("by_workos_user_id", ["workosUserId"])
    .index("by_email", ["email"])
    .index("by_username", ["username"])
    .index("by_status", ["status"]),

  invites: defineTable({
    token: v.string(),
    email: v.string(),
    invitedBy: v.id("users"),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    acceptedBy: v.optional(v.id("users")),
    boardId: v.optional(v.id("boards")),
  })
    .index("by_token", ["token"])
    .index("by_email", ["email"]),

  boards: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    isArchived: v.boolean(),
  })
    .index("by_slug", ["slug"])
    .index("by_created_at", ["createdAt"]),

  boardModerators: defineTable({
    boardId: v.id("boards"),
    userId: v.id("users"),
    addedBy: v.id("users"),
    addedAt: v.number(),
  })
    .index("by_board_user", ["boardId", "userId"])
    .index("by_user_board", ["userId", "boardId"]),

  posts: defineTable({
    boardId: v.id("boards"),
    authorId: v.id("users"),
    body: v.string(),
    bodyForSearch: v.string(),
    mentions: v.array(v.id("users")),
    attachmentKeys: v.array(v.string()),
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_board_created_at", ["boardId", "createdAt"])
    .index("by_author_created_at", ["authorId", "createdAt"])
    .searchIndex("search_body", {
      searchField: "bodyForSearch",
      filterFields: ["boardId"],
    }),

  files: defineTable({
    key: v.string(),
    boardId: v.id("boards"),
    uploadedBy: v.id("users"),
    postId: v.optional(v.id("posts")),
    uploadedAt: v.number(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  })
    .index("by_key", ["key"])
    .index("by_board_uploaded_at", ["boardId", "uploadedAt"]),
});
