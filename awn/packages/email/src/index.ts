import { Resend } from "resend";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { InviteEmailTemplate } from "./templates/invite-email";
import { MentionEmailTemplate } from "./templates/mention-email";

export type InviteEmailInput = {
  inviteLink: string;
  inviterName: string;
  inviteeRole: "admin" | "moderator" | "member";
};

export type MentionEmailInput = {
  boardName: string;
  authorUsername: string;
  messageSnippet: string;
  threadUrl: string;
};

function renderEmailTemplate(element: ReturnType<typeof InviteEmailTemplate> | ReturnType<typeof MentionEmailTemplate>) {
  return `<!DOCTYPE html>${renderToStaticMarkup(element)}`;
}

export async function renderInviteEmail(input: InviteEmailInput) {
  const roleLabel =
    input.inviteeRole === "admin"
      ? " as an admin"
      : input.inviteeRole === "moderator"
        ? " as a moderator"
        : "";
  const subject = "You were invited to join Awn";
  const html = renderEmailTemplate(InviteEmailTemplate(input));
  const text = `You were invited to join Awn${roleLabel} by ${input.inviterName}. Accept: ${input.inviteLink}`;
  return { subject, html, text };
}

export async function renderMentionEmail(input: MentionEmailInput) {
  const subject = `${input.authorUsername} mentioned you in #${input.boardName}`;
  const html = renderEmailTemplate(MentionEmailTemplate(input));
  const text = `${input.authorUsername} mentioned you in #${input.boardName}: ${input.messageSnippet}\n\n${input.threadUrl}`;
  return { subject, html, text };
}

export function createResendClient(apiKey: string) {
  return new Resend(apiKey);
}

export async function sendEmailWithResend(args: {
  apiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}) {
  const client = createResendClient(args.apiKey);
  return client.emails.send({
    from: args.from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
}
