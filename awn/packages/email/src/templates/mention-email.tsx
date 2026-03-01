import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import * as React from "react";

type MentionEmailProps = {
  boardName: string;
  authorUsername: string;
  messageSnippet: string;
  threadUrl: string;
};

export function MentionEmailTemplate({
  boardName,
  authorUsername,
  messageSnippet,
  threadUrl,
}: MentionEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{authorUsername} mentioned you in #{boardName}</Preview>
      <Body style={{ backgroundColor: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
        <Container style={{ margin: "24px auto", backgroundColor: "#ffffff", padding: "24px" }}>
          <Heading style={{ marginTop: 0, color: "#0f172a" }}>You were mentioned</Heading>
          <Text style={{ color: "#334155" }}>
            <strong>{authorUsername}</strong> mentioned you in <strong>#{boardName}</strong>.
          </Text>
          <Text
            style={{
              borderLeft: "3px solid #cbd5e1",
              color: "#475569",
              margin: "16px 0",
              padding: "8px 12px",
              whiteSpace: "pre-wrap",
            }}
          >
            {messageSnippet}
          </Text>
          <Link href={threadUrl} style={{ color: "#0f172a", textDecoration: "underline" }}>
            Open conversation
          </Link>
        </Container>
      </Body>
    </Html>
  );
}
