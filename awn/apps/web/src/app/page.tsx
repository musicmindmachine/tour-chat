import Link from "next/link";
import { getSignInUrl, getSignUpUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { Dashboard } from "@/components/boards/dashboard";

export default async function HomePage() {
  const { user } = await withAuth();

  if (!user) {
    const [signInUrl, signUpUrl] = await Promise.all([getSignInUrl(), getSignUpUrl()]);

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Awn</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Invite-only social network with moderated message boards, real-time sync, and mention notifications.
        </p>
        <div className="flex gap-3">
          <Link className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" href={signInUrl}>
            Sign in
          </Link>
          <Link className="rounded-md border px-4 py-2 text-sm" href={signUpUrl}>
            Sign up
          </Link>
        </div>
      </main>
    );
  }

  return <Dashboard />;
}
