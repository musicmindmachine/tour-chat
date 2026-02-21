import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not signed in");
    }
    const user = await ctx.db.get(userId);
    if (user === null) {
      throw new Error("User was deleted");
    }
    return user;
  },
});

export const updateName = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not signed in");
    }

    const trimmed = args.name.trim();
    await ctx.db.patch(userId, {
      name: trimmed.length > 0 ? trimmed : undefined,
    });

    return { ok: true };
  },
});
