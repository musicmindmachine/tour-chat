import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Convex Auth requires auth-related indexes, so we define a schema explicitly.
export default defineSchema({
  ...authTables,
  files: defineTable({
    key: v.string(),
    path: v.string(),
    name: v.string(),
    directory: v.string(),
    uploaderId: v.id("users"),
    uploaderName: v.optional(v.string()),
    uploaderEmail: v.optional(v.string()),
    size: v.optional(v.number()),
    contentType: v.optional(v.string()),
    uploadedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_path", ["path"])
    .index("by_directory", ["directory"])
    .index("by_uploader", ["uploaderId"]),
});
