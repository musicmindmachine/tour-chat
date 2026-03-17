import type { Metadata } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import Script from "next/script";
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
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="awn-theme" strategy="beforeInteractive">
          {`(() => {
            try {
              const stored = window.localStorage.getItem("awn-theme");
              const theme =
                stored === "light" || stored === "dark"
                  ? stored
                  : window.matchMedia("(prefers-color-scheme: dark)").matches
                    ? "dark"
                    : "light";
              document.documentElement.dataset.theme = theme;
              document.documentElement.style.colorScheme = theme;
            } catch {}
          })();`}
        </Script>
        <Providers initialAuth={initialAuth}>{children}</Providers>
      </body>
    </html>
  );
}
