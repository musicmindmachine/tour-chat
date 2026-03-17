import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

type InviteEmailProps = {
  inviteLink: string;
  inviterName: string;
  inviteeRole: "admin" | "moderator" | "member";
};

export function InviteEmailTemplate({ inviteLink, inviterName, inviteeRole }: InviteEmailProps) {
  const roleCopy =
    inviteeRole === "admin"
      ? " as an admin"
      : inviteeRole === "moderator"
        ? " as a moderator"
        : "";

  return (
    <Html>
      <Head />
      <Preview>You were invited to join Awn</Preview>
      <Body style={{ backgroundColor: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
        <Container style={{ margin: "24px auto", backgroundColor: "#ffffff", padding: "24px" }}>
          <Heading style={{ marginTop: 0, color: "#0f172a" }}>You are invited</Heading>
          <Text style={{ color: "#334155" }}>
            {inviterName} invited you to join this private message board network{roleCopy}.
          </Text>
          <Section style={{ margin: "24px 0" }}>
            <Button
              href={inviteLink}
              style={{
                borderRadius: "8px",
                backgroundColor: "#0f172a",
                color: "#ffffff",
                display: "inline-block",
                padding: "12px 18px",
                textDecoration: "none",
              }}
            >
              Accept Invite
            </Button>
          </Section>
          <Text style={{ color: "#64748b", fontSize: "12px" }}>
            If the button does not work, open this URL:
            <br />
            {inviteLink}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
