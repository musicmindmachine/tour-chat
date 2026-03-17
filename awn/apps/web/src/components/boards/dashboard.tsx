"use client";

import Link from "next/link";
import type { FunctionReference } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { api } from "@awn/convex/convex/api";
import { AppNavbar } from "@/components/app/app-navbar";
import { useAwnViewer } from "@/components/app/use-awn-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type ChangeEvent, useState } from "react";

type ConvexApi = {
  boards: { list: FunctionReference<"query">; create: FunctionReference<"mutation"> };
};

type DashboardProps = {
  inviteToken?: string;
};

export function Dashboard({ inviteToken }: DashboardProps) {
  const convexApi = api as ConvexApi;
  const { authLoading, syncingUser, user, viewer } = useAwnViewer(inviteToken);
  const createBoard = useMutation(convexApi.boards.create);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const shouldLoadBoards = viewer?.status === "active";
  const boards = useQuery(convexApi.boards.list, shouldLoadBoards ? {} : ("skip" as never));

  if (authLoading || viewer === undefined) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 text-sm text-muted-foreground">
        Loading boards…
      </main>
    );
  }

  if (!user) {
    return null;
  }

  if (viewer === null || syncingUser) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 text-sm text-muted-foreground">
        Finishing account setup…
      </main>
    );
  }

  if (!viewer) {
    return null;
  }

  if (viewer.status !== "active") {
    return (
      <div className="min-h-screen pb-8">
        <AppNavbar viewer={viewer} />
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>@{viewer.username}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{viewer.role}</Badge>
                  <Badge variant="outline">{viewer.status}</Badge>
                </div>
              </CardTitle>
              <CardDescription>Invite-only message board network</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Your account is pending admin approval before you can access message boards.
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (boards === undefined) {
    return (
      <div className="min-h-screen pb-8">
        <AppNavbar viewer={viewer} />
        <main className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-muted-foreground sm:px-6 lg:px-8">
          Loading boards…
        </main>
      </div>
    );
  }

  const isAdmin = viewer.role === "admin";
  const boardList = (boards ?? []) as Array<{ _id: string; name: string; description?: string }>;

  const onCreateBoard = async () => {
    if (!name.trim()) {
      return;
    }

    setCreating(true);
    try {
      await createBoard({
        name,
        description: description || undefined,
      });
      setName("");
      setDescription("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen pb-10">
      <AppNavbar viewer={viewer} />

      <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
          <Card className="overflow-hidden border-0 bg-slate-950 text-white shadow-[0_24px_90px_-40px_rgba(15,23,42,0.75)]">
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.26em] text-slate-300">
                <span>Boards</span>
                <span className="h-1 w-1 rounded-full bg-slate-500" />
                <span>{boardList.length} live</span>
              </div>
              <div>
                <CardTitle className="text-3xl tracking-tight text-white">Jump back into the network.</CardTitle>
                <CardDescription className="mt-3 max-w-2xl text-slate-300">
                  Read across the boards, post updates in real time, and keep the invite-only space moving.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-slate-300">Your role</div>
                <div className="mt-2 text-2xl font-semibold capitalize">{viewer.role}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-slate-300">Account status</div>
                <div className="mt-2 text-2xl font-semibold capitalize">{viewer.status}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-slate-300">Boards available</div>
                <div className="mt-2 text-2xl font-semibold">{boardList.length}</div>
              </div>
            </CardContent>
          </Card>

          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Create board</CardTitle>
                <CardDescription>Admins can spin up new rooms for different parts of the network.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Input
                  value={name}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
                  placeholder="Board name"
                />
                <Input
                  value={description}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setDescription(event.target.value)}
                  placeholder="Short description"
                />
                <Button onClick={onCreateBoard} disabled={creating || !name.trim()}>
                  {creating ? "Creating…" : "Create board"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Need to add people?</CardTitle>
                <CardDescription>
                  Head to the members page to send invite links and see who already has access.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link className="inline-flex rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" href="/members">
                  Open members
                </Link>
              </CardContent>
            </Card>
          )}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Board directory</CardTitle>
            <CardDescription>Open a board to read and post messages.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {boardList.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">No boards yet.</div>
            ) : (
              boardList.map((board) => (
                <Link
                  key={board._id}
                  className="rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:bg-accent"
                  href={`/boards/${board._id}`}
                >
                  <div className="text-base font-semibold text-slate-950">{board.name}</div>
                  <div className="mt-2 text-sm text-muted-foreground">{board.description ?? "No description yet."}</div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
