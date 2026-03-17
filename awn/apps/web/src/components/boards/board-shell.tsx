"use client";

import { useUploadFile } from "@convex-dev/r2/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FunctionReference } from "convex/server";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { PaginatedQueryReference } from "convex/react";
import Link from "next/link";
import { type ChangeEvent, type FormEvent, useMemo, useRef, useState } from "react";
import { api } from "@awn/convex/convex/api";
import { AppNavbar } from "@/components/app/app-navbar";
import { useAwnViewer } from "@/components/app/use-awn-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ConvexApi = {
  boards: { getById: FunctionReference<"query"> };
  posts: { create: FunctionReference<"mutation">; listByBoard: PaginatedQueryReference };
  files: {
    attachFileToBoard: FunctionReference<"mutation">;
    generateUploadUrl: FunctionReference<"mutation">;
    syncMetadata: FunctionReference<"mutation">;
  };
};

type BoardShellProps = {
  boardId: string;
};

type Viewer = {
  username: string;
  role: "admin" | "moderator" | "member";
  status: "active" | "pending" | "suspended";
};

const PAGE_SIZE = 30;

export function BoardShell({ boardId }: BoardShellProps) {
  const { authLoading, syncingUser, user, viewer } = useAwnViewer();

  if (authLoading || viewer === undefined) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 text-sm text-muted-foreground">
        Loading board…
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardContent>
            <Link className="text-sm underline" href="/sign-in">
              Sign in to open boards
            </Link>
          </CardContent>
        </Card>
      </main>
    );
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
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <Card>
            <CardHeader>
              <CardTitle>Account pending approval</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Your account needs admin approval before you can open boards.
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return <ActiveBoardShell boardId={boardId} viewer={viewer} />;
}

type ActiveBoardShellProps = {
  boardId: string;
  viewer: Viewer;
};

function ActiveBoardShell({ boardId, viewer }: ActiveBoardShellProps) {
  const convexApi = api as ConvexApi;
  const board = useQuery(convexApi.boards.getById, { boardId });
  const createPost = useMutation(convexApi.posts.create);
  const attachFile = useMutation(convexApi.files.attachFileToBoard);
  const uploadFile = useUploadFile(convexApi.files);
  const list = usePaginatedQuery(
    convexApi.posts.listByBoard,
    {
      boardId,
    },
    { initialNumItems: PAGE_SIZE },
  );

  const items = useMemo(() => [...list.results].reverse(), [list.results]);
  const parentRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 90,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const onScroll = () => {
    const element = parentRef.current;
    if (!element) {
      return;
    }

    const nearTop = element.scrollTop < 240;
    if (nearTop && list.status === "CanLoadMore" && !list.isLoading) {
      void list.loadMore(PAGE_SIZE);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) {
      return;
    }

    setSending(true);
    try {
      const files = fileRef.current?.files ? Array.from(fileRef.current.files) : [];
      const uploadedKeys: string[] = [];

      for (const file of files) {
        const key = await uploadFile(file);
        uploadedKeys.push(key);
        await attachFile({
          key,
          boardId,
          contentType: file.type,
          size: file.size,
        });
      }

      await createPost({
        boardId,
        body,
        attachmentKeys: uploadedKeys,
      });

      setBody("");
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    } finally {
      setSending(false);
    }
  };

  if (board === undefined) {
    return (
      <div className="min-h-screen pb-8">
        <AppNavbar viewer={viewer} />
        <main className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-muted-foreground sm:px-6 lg:px-8">
          Loading board…
        </main>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="min-h-screen pb-8">
        <AppNavbar viewer={viewer} />
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <Card>
            <CardHeader>
              <CardTitle>Board not found</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/" className="text-sm underline">
                Back to dashboard
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8">
      <AppNavbar viewer={viewer} />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] border bg-white/80 px-5 py-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.26em] text-muted-foreground">Board</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{board.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">{board.description ?? "Message board"}</p>
            </div>
            <Link href="/" className="text-sm underline">
              Back to boards
            </Link>
          </div>
        </div>

        <div
          ref={parentRef}
          onScroll={onScroll}
          className="relative min-h-[24rem] flex-1 overflow-auto rounded-[1.5rem] border bg-background"
          style={{ height: "min(56vh, 42rem)" }}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {virtualItems.map((virtualItem) => {
              const message = items[virtualItem.index];
              if (!message) {
                return null;
              }

              return (
                <div
                  key={message._id}
                  className="absolute left-0 w-full px-3 py-2"
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                >
                  <div className="rounded-xl border bg-card p-3">
                    <div className="mb-1 text-xs text-muted-foreground">
                      {new Date(message._creationTime).toLocaleString()}
                    </div>
                    <div className="whitespace-pre-wrap text-sm">{message.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={onSubmit} className="grid gap-2 rounded-[1.5rem] border bg-card p-4">
          <Textarea
            value={body}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setBody(event.target.value)}
            placeholder="Write a message. Mention users with @username"
          />
          <Input ref={fileRef} type="file" multiple />
          <Button type="submit" disabled={sending || !body.trim()}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </form>
      </main>
    </div>
  );
}
