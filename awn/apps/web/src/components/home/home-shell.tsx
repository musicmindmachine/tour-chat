"use client";

import Link from "next/link";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Dashboard } from "@/components/boards/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type HomeShellProps = {
  inviteToken?: string;
};

export function HomeShell({ inviteToken }: HomeShellProps) {
  const { loading, user } = useAuth();
  const inviteSuffix = inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : "";

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 text-sm text-muted-foreground">
        Loading…
      </main>
    );
  }

  if (user) {
    return <Dashboard inviteToken={inviteToken} />;
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex w-full max-w-6xl justify-end px-4 pt-4 sm:px-6 lg:px-8">
        <ThemeToggle />
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 lg:py-16">
        <section className="flex flex-col justify-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Awn</p>
          <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Private message boards with a cleaner operational surface.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">
            Invite-only discussions, moderated access, real-time updates, and member administration in one compact workspace.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Controlled access</CardTitle>
              </CardHeader>
              <CardContent className="text-[13px] leading-6 text-muted-foreground">
                Invite members by email and keep approval workflows inside the app.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Board-based structure</CardTitle>
              </CardHeader>
              <CardContent className="text-[13px] leading-6 text-muted-foreground">
                Separate topics cleanly without losing the speed of a single shared workspace.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Real-time collaboration</CardTitle>
              </CardHeader>
              <CardContent className="text-[13px] leading-6 text-muted-foreground">
                Keep posts, mentions, and notifications flowing without leaving the board.
              </CardContent>
            </Card>
          </div>
        </section>

        <Card className="self-center">
          <CardHeader>
            <CardTitle>Enter workspace</CardTitle>
            <CardDescription>Use your invite link to sign in or create an account.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Link
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground"
              href={`/sign-in${inviteSuffix}`}
            >
              Sign in
            </Link>
            <Link
              className="inline-flex h-9 items-center justify-center rounded-lg border border-border/80 bg-background/80 px-3 text-[13px] font-medium"
              href={`/sign-up${inviteSuffix}`}
            >
              Sign up
            </Link>
            <div className="rounded-lg border border-border/80 bg-background/60 px-3 py-3 text-[13px] leading-6 text-muted-foreground">
              If you were invited, use the same email address that received the invite. Your access level will be applied automatically.
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
