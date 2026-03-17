import type { Metadata } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Awn",
  description: "Invite-only social network message board",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const auth = await withAuth();
  const { accessToken: _accessToken, ...initialAuth } = auth;

  return (
    <html lang="en">
      <body>
        <Providers initialAuth={initialAuth}>{children}</Providers>
      </body>
    </html>
  );
}
