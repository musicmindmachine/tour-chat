import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const viewer = await fetchQuery(
    api.users.viewer,
    {},
    { token: await convexAuthNextjsToken() },
  );

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Drop Tuning Box
            </Link>
            <span className="hidden text-xs text-muted-foreground md:inline">
              Shared files
            </span>
          </div>

          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/">Files</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/account">Account</Link>
            </Button>
            <UserMenu
              name={viewer.name ?? viewer.email ?? "Account"}
              email={viewer.email ?? undefined}
            />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
