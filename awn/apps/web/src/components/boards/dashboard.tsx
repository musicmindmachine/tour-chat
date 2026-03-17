"use client";

import Link from "next/link";
import type { FunctionReference } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useSearchParams } from "next/navigation";
import { api } from "@awn/convex/convex/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type ChangeEvent, useEffect, useState } from "react";

type ConvexApi = {
  users: { current: FunctionReference<"query">; syncCurrentUser: FunctionReference<"mutation"> };
  boards: { list: FunctionReference<"query">; create: FunctionReference<"mutation"> };
};

type DashboardProps = {
  inviteToken?: string;
};

export function Dashboard({ inviteToken: initialInviteToken }: DashboardProps) {
  const convexApi = api as ConvexApi;
  const { signOut, user } = useAuth();
  const searchParams = useSearchParams();
  const viewer = useQuery(convexApi.users.current);
  const createBoard = useMutation(convexApi.boards.create);
  const syncCurrentUser = useMutation(convexApi.users.syncCurrentUser);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [syncingUser, setSyncingUser] = useState(false);

  const inviteToken = searchParams.get("invite") ?? initialInviteToken;
  const shouldLoadBoards = viewer?.status === "active";
  const boards = useQuery(convexApi.boards.list, shouldLoadBoards ? {} : ("skip" as never));

  useEffect(() => {
    let cancelled = false;

    if (!user || viewer !== null || syncingUser) {
      return () => {
        cancelled = true;
      };
    }

    setSyncingUser(true);

    void syncCurrentUser({
      inviteToken: inviteToken ?? undefined,
    })
      .catch((error) => {
        console.error("Failed to sync current user with Convex.", error);
      })
      .finally(() => {
        if (!cancelled) {
          setSyncingUser(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inviteToken, syncCurrentUser, syncingUser, user, viewer]);

  if (viewer === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (user && (viewer === null || syncingUser)) {
    return <div className="p-6 text-sm text-muted-foreground">Finishing account setup…</div>;
  }

  if (!viewer) {
    return null;
  }

  if (viewer.status !== "active") {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
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
          <CardContent className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Your account is pending admin approval before you can access message boards.
            </div>
            <Button variant="outline" onClick={() => signOut()}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (boards === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading boards…</div>;
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>@{viewer.username}</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{viewer.role}</Badge>
              <Badge variant={viewer.status === "active" ? "default" : "outline"}>{viewer.status}</Badge>
            </div>
          </CardTitle>
          <CardDescription>Invite-only message board network</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {viewer.status === "active"
              ? "You have full access to boards."
              : "Your account is pending admin approval."}
          </div>
          <Button variant="outline" onClick={() => signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Create board</CardTitle>
            <CardDescription>Only admins can create boards.</CardDescription>
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
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Boards</CardTitle>
          <CardDescription>Open a board to read and post messages.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {boardList.length === 0 ? (
            <div className="text-sm text-muted-foreground">No boards yet.</div>
          ) : (
            boardList.map((board) => (
              <Link
                key={board._id}
                className="rounded-lg border p-3 text-sm transition hover:bg-accent"
                href={`/boards/${board._id}`}
              >
                <div className="font-medium">{board.name}</div>
                <div className="text-muted-foreground">{board.description ?? "No description"}</div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
