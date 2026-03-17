"use client";

import Link from "next/link";
import type { FunctionReference } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { type ChangeEvent, useState } from "react";
import { api } from "@awn/convex/convex/api";
import { AppNavbar } from "@/components/app/app-navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAwnViewer } from "@/components/app/use-awn-viewer";

type ConvexApi = {
  boards: { list: FunctionReference<"query">; create: FunctionReference<"mutation"> };
};

type DashboardProps = {
  inviteToken?: string;
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/80 bg-card/75 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}

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
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Workspace access pending</CardTitle>
                  <CardDescription>Your account is waiting on admin approval.</CardDescription>
                </div>
                <Badge variant="outline">{viewer.status}</Badge>
              </div>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  if (boards === undefined) {
    return (
      <div className="min-h-screen pb-8">
        <AppNavbar viewer={viewer} />
        <main className="mx-auto w-full max-w-6xl px-4 py-4 text-sm text-muted-foreground sm:px-6 lg:px-8">
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
    <div className="min-h-screen pb-8">
      <AppNavbar viewer={viewer} />

      <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Boards</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Workspace overview</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
              Keep conversations organized, monitor access, and jump directly into any board.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <StatCard label="Role" value={viewer.role} />
            <StatCard label="Status" value={viewer.status} />
            <StatCard label="Boards" value={boardList.length} />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Board directory</CardTitle>
                <CardDescription>Compact view of every active board in the workspace.</CardDescription>
              </div>
              <Badge variant="secondary">{boardList.length} total</Badge>
            </CardHeader>
            <CardContent className="pt-0">
              {boardList.length === 0 ? (
                <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">No boards yet.</div>
              ) : (
                <div className="divide-y divide-border/80">
                  {boardList.map((board) => (
                    <Link
                      key={board._id}
                      href={`/boards/${board._id}`}
                      className="grid gap-2 px-1 py-3 transition-colors hover:bg-accent/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{board.name}</div>
                        <div className="mt-1 truncate text-[13px] text-muted-foreground">
                          {board.description ?? "No description provided."}
                        </div>
                      </div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Open</div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Create board</CardTitle>
                <CardDescription>Add a new space for a topic, team, or event.</CardDescription>
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
                <CardTitle>Operations</CardTitle>
                <CardDescription>Need to adjust access or send new invites?</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Link
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-border/80 bg-background/80 px-3 text-[13px] font-medium shadow-sm transition-colors hover:bg-accent"
                  href="/members"
                >
                  Open members
                </Link>
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}
