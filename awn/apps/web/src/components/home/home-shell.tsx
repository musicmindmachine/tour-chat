"use client";

import Link from "next/link";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Dashboard } from "@/components/boards/dashboard";

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
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Awn</h1>
      <p className="max-w-xl text-sm text-muted-foreground">
        Invite-only social network with moderated message boards, real-time sync, and mention notifications.
      </p>
      <div className="flex gap-3">
        <Link className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" href={`/sign-in${inviteSuffix}`}>
          Sign in
        </Link>
        <Link className="rounded-md border px-4 py-2 text-sm" href={`/sign-up${inviteSuffix}`}>
          Sign up
        </Link>
      </div>
    </main>
  );
}
