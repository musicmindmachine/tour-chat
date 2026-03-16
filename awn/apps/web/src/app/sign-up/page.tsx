import { getSignUpUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

type SignUpPageProps = {
  searchParams?: Promise<{
    invite?: string | string[];
  }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const inviteToken = Array.isArray(params?.invite) ? params.invite[0] : params?.invite;
  const signUpUrl = await getSignUpUrl({
    state: inviteToken ? JSON.stringify({ inviteToken }) : undefined,
  });
  redirect(signUpUrl);
}
