import { renderInviteEmail, renderMentionEmail } from "@awn/email";
import { PushNotifications } from "@convex-dev/expo-push-notifications";
import { Resend } from "@convex-dev/resend";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireActiveViewer } from "./lib/auth";

const emailFrom = process.env.EMAIL_FROM ?? "Awn <onboarding@resend.dev>";
const appBaseUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";

export const resendClient = new Resend(components.resend, {});
const pushNotifications = new PushNotifications<Id<"users">>(components.pushNotifications);

export const recordPushToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);
    await pushNotifications.recordToken(ctx, {
      userId: viewer._id,
      pushToken: args.token,
    });
    return { ok: true };
  },
});

export const setPushPaused = mutation({
  args: {
    paused: v.boolean(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireActiveViewer(ctx);

    if (args.paused) {
      await pushNotifications.pauseNotificationsForUser(ctx, { userId: viewer._id });
    } else {
      await pushNotifications.unpauseNotificationsForUser(ctx, { userId: viewer._id });
    }

    return { ok: true };
  },
});

export const getPushStatus = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireActiveViewer(ctx);
    return pushNotifications.getStatusForUser(ctx, { userId: viewer._id });
  },
});

export const sendInviteEmail = internalMutation({
  args: {
    email: v.string(),
    token: v.string(),
    inviterUsername: v.string(),
    inviteeRole: v.optional(v.union(v.literal("admin"), v.literal("moderator"), v.literal("member"))),
  },
  handler: async (ctx, args) => {
    const inviteLink = `${appBaseUrl}/?invite=${args.token}`;
    const rendered = await renderInviteEmail({
      inviteLink,
      inviterName: args.inviterUsername,
      inviteeRole: args.inviteeRole ?? "member",
    });

    await resendClient.sendEmail(ctx, {
      from: emailFrom,
      to: args.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    return { ok: true };
  },
});

export const notifyMentions = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.mentions.length === 0) {
      return { notified: 0 };
    }

    const [author, board] = await Promise.all([ctx.db.get(post.authorId), ctx.db.get(post.boardId)]);
    if (!author || !board) {
      return { notified: 0 };
    }

    let notified = 0;

    for (const mentionedUserId of post.mentions) {
      if (mentionedUserId === author._id) {
        continue;
      }

      const user = await ctx.db.get(mentionedUserId);
      if (!user || user.status !== "active") {
        continue;
      }

      const snippet = post.body.slice(0, 240);
      const threadUrl = `${appBaseUrl}/boards/${board._id}`;

      if (user.mentionEmails) {
        const rendered = await renderMentionEmail({
          boardName: board.name,
          authorUsername: author.username,
          messageSnippet: snippet,
          threadUrl,
        });

        await resendClient.sendEmail(ctx, {
          from: emailFrom,
          to: user.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
      }

      if (user.mentionPush) {
        await pushNotifications.sendPushNotification(ctx, {
          userId: user._id,
          allowUnregisteredTokens: true,
          notification: {
            title: `${author.username} mentioned you`,
            body: snippet,
            data: {
              boardId: String(board._id),
              postId: String(post._id),
            },
          },
        });
      }

      notified += 1;
    }

    return { notified };
  },
});
