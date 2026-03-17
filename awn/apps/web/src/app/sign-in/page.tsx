import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { getWorkosRedirectUri } from "@/lib/workos";

type SignInPageProps = {
  searchParams?: Promise<{
    invite?: string | string[];
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const inviteToken = Array.isArray(params?.invite) ? params.invite[0] : params?.invite;
  const signInUrl = await getSignInUrl({
    redirectUri: getWorkosRedirectUri(),
    state: inviteToken ? JSON.stringify({ inviteToken }) : undefined,
  });
  redirect(signInUrl);
}
