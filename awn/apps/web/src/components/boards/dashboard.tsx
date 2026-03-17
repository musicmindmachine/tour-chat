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

type BoardSummary = {
  _id: string;
  description?: string;
  name: string;
  unreadCount: number;
  unreadPreview: Array<{
    _id: string;
    authorName: string;
    body: string;
    createdAt: number;
  }>;
};

function normalizeBoardSummary(board: Partial<BoardSummary> & { _id: string; name: string }) {
  return {
    ...board,
    unreadCount: typeof board.unreadCount === "number" ? board.unreadCount : 0,
    unreadPreview: Array.isArray(board.unreadPreview) ? board.unreadPreview : [],
  };
}

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
  const boardList = ((boards ?? []) as Array<Partial<BoardSummary> & { _id: string; name: string }>).map(
    normalizeBoardSummary,
  );
  const totalUnread = boardList.reduce((sum, board) => sum + board.unreadCount, 0);

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

          <div className="grid gap-2 sm:grid-cols-4">
            <StatCard label="Role" value={viewer.role} />
            <StatCard label="Status" value={viewer.status} />
            <StatCard label="Boards" value={boardList.length} />
            <StatCard label="Unread" value={totalUnread} />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Board directory</CardTitle>
                <CardDescription>Compact view of every active board and the unread activity waiting in each.</CardDescription>
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
                      className="grid gap-2 px-1 py-3 transition-colors hover:bg-accent/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-medium text-foreground">{board.name}</div>
                          <Badge variant={board.unreadCount > 0 ? "secondary" : "outline"}>
                            {board.unreadCount > 0 ? `${board.unreadCount} unread` : "Caught up"}
                          </Badge>
                        </div>
                        {board.unreadPreview.length > 0 ? (
                          <div className="mt-2 grid gap-1.5">
                            {board.unreadPreview.map((post) => (
                              <div
                                key={post._id}
                                className="flex items-center gap-2 rounded-md border border-border/70 bg-background/70 px-2 py-1"
                              >
                                <div className="shrink-0 text-[11px] font-medium text-foreground">{post.authorName}</div>
                                <div className="truncate text-[12px] text-muted-foreground">{post.body}</div>
                              </div>
                            ))}
                            {board.unreadCount > board.unreadPreview.length ? (
                              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                +{board.unreadCount - board.unreadPreview.length} more unread
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-1 truncate text-[13px] text-muted-foreground">
                            {board.description ?? "No description provided."}
                          </div>
                        )}
                      </div>
                      <div className="pt-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        Open
                      </div>
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
