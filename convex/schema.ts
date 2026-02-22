import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Convex Auth requires auth-related indexes, so we define a schema explicitly.
const userRole = v.union(v.literal("admin"), v.literal("user"));

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(userRole),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_role", ["role"]),
  emailAllowlist: defineTable({
    email: v.string(),
    addedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_added_by", ["addedBy"]),
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
