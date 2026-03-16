import { HomeShell } from "@/components/home/home-shell";

type HomePageProps = {
  searchParams?: Promise<{
    invite?: string | string[];
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const inviteToken = Array.isArray(params?.invite) ? params.invite[0] : params?.invite;

  return <HomeShell inviteToken={inviteToken} />;
}
