import { render } from "@react-email/render";
import { Resend } from "resend";
import { InviteEmailTemplate } from "./templates/invite-email";
import { MentionEmailTemplate } from "./templates/mention-email";

export type InviteEmailInput = {
  inviteLink: string;
  inviterName: string;
};

export type MentionEmailInput = {
  boardName: string;
  authorUsername: string;
  messageSnippet: string;
  threadUrl: string;
};

export async function renderInviteEmail(input: InviteEmailInput) {
  const subject = "You were invited to join Awn";
  const html = await render(InviteEmailTemplate(input));
  const text = `You were invited to join Awn by ${input.inviterName}. Accept: ${input.inviteLink}`;
  return { subject, html, text };
}

export async function renderMentionEmail(input: MentionEmailInput) {
  const subject = `${input.authorUsername} mentioned you in #${input.boardName}`;
  const html = await render(MentionEmailTemplate(input));
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
