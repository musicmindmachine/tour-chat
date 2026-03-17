"use client";

import { useUploadFile } from "@convex-dev/r2/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FunctionReference } from "convex/server";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { PaginatedQueryReference } from "convex/react";
import Link from "next/link";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@awn/convex/convex/api";
import { AppNavbar } from "@/components/app/app-navbar";
import { useAwnViewer } from "@/components/app/use-awn-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ConvexApi = {
  boards: { getById: FunctionReference<"query">; markRead: FunctionReference<"mutation"> };
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

type Board = {
  _id: string;
  name: string;
  description?: string;
};

type BoardMessage = {
  _id: string;
  _creationTime: number;
  authorName: string;
  body: string;
  createdAt: number;
  deletedAt?: number;
  isUnread: boolean;
};

const PAGE_SIZE = 30;

function isNearBottom(element: HTMLDivElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
}

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
        <main className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
          <Card>
            <CardHeader>
              <CardTitle>Workspace access pending</CardTitle>
              <CardDescription>Your account needs admin approval before you can open boards.</CardDescription>
            </CardHeader>
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
  const board = useQuery(convexApi.boards.getById, { boardId }) as Board | null | undefined;
  const markBoardRead = useMutation(convexApi.boards.markRead);
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

  const items = useMemo(() => ([...list.results] as BoardMessage[]).reverse(), [list.results]);
  const latestMessage = items[items.length - 1];
  const unreadCount = items.filter((message) => message.isUnread).length;
  const parentRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const didAutoScrollRef = useRef(false);
  const lastMarkedHeadRef = useRef<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 104,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const element = parentRef.current;
    if (!element || !latestMessage) {
      return;
    }

    const syncLatestReadHead = async () => {
      if (!latestMessage || lastMarkedHeadRef.current === latestMessage._id) {
        return;
      }

      try {
        await markBoardRead({
          boardId,
          postId: latestMessage._id,
        });
        lastMarkedHeadRef.current = latestMessage._id;
      } catch (error) {
        console.error("Failed to sync board read state.", error);
      }
    };

    if (!didAutoScrollRef.current) {
      didAutoScrollRef.current = true;
      requestAnimationFrame(() => {
        const node = parentRef.current;
        if (!node) {
          return;
        }

        node.scrollTop = node.scrollHeight;
        void syncLatestReadHead();
      });
      return;
    }

    if (!isNearBottom(element)) {
      return;
    }

    requestAnimationFrame(() => {
      const node = parentRef.current;
      if (!node) {
        return;
      }

      node.scrollTop = node.scrollHeight;
      void syncLatestReadHead();
    });
  }, [boardId, items.length, latestMessage, markBoardRead]);

  useEffect(() => {
    const syncLatestReadHead = async () => {
      if (!latestMessage || lastMarkedHeadRef.current === latestMessage._id) {
        return;
      }

      try {
        await markBoardRead({
          boardId,
          postId: latestMessage._id,
        });
        lastMarkedHeadRef.current = latestMessage._id;
      } catch (error) {
        console.error("Failed to sync board read state.", error);
      }
    };

    const onVisibilityChange = () => {
      const element = parentRef.current;
      if (!element || document.visibilityState !== "visible" || !isNearBottom(element)) {
        return;
      }

      void syncLatestReadHead();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [boardId, latestMessage, markBoardRead]);

  const onScroll = () => {
    const element = parentRef.current;
    if (!element) {
      return;
    }

    const nearTop = element.scrollTop < 240;
    if (nearTop && list.status === "CanLoadMore" && !list.isLoading) {
      void list.loadMore(PAGE_SIZE);
    }

    if (isNearBottom(element)) {
      if (!latestMessage || lastMarkedHeadRef.current === latestMessage._id) {
        return;
      }

      void markBoardRead({
        boardId,
        postId: latestMessage._id,
      })
        .then(() => {
          lastMarkedHeadRef.current = latestMessage._id;
        })
        .catch((error) => {
          console.error("Failed to sync board read state.", error);
        });
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
        <main className="mx-auto w-full max-w-6xl px-4 py-4 text-sm text-muted-foreground sm:px-6 lg:px-8">
          Loading board…
        </main>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="min-h-screen pb-8">
        <AppNavbar viewer={viewer} />
        <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
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

      <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Board</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{board.name}</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
              {board.description ?? "Internal discussion board"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{items.length} shown</Badge>
            <Badge variant="outline">{unreadCount > 0 ? `${unreadCount} unread` : "Caught up"}</Badge>
            <Link
              href="/"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border/80 bg-background/80 px-3 text-[12px] font-medium shadow-sm transition-colors hover:bg-accent"
            >
              Back to boards
            </Link>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Message log</CardTitle>
                <CardDescription>Latest activity in chronological order.</CardDescription>
              </div>
              <Badge variant="outline">{list.status === "CanLoadMore" ? "Live" : "Loaded"}</Badge>
            </CardHeader>
            <CardContent className="pt-0">
              <div
                ref={parentRef}
                onScroll={onScroll}
                className="relative h-[68vh] overflow-auto rounded-lg border border-border/80 bg-background/70"
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
                        <div className="rounded-lg border border-border/80 bg-card px-3 py-2.5 shadow-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="truncate text-[12px] font-semibold text-foreground">{message.authorName}</div>
                              {message.isUnread ? (
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                  Unread
                                </Badge>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-[11px] font-medium text-muted-foreground">
                              {new Date(message.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <div className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-foreground">
                            {message.body}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>New post</CardTitle>
              <CardDescription>Write a short update and optionally attach files.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="grid gap-3">
                <Textarea
                  value={body}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setBody(event.target.value)}
                  placeholder="Write a message. Mention users with @username"
                  className="min-h-[160px]"
                />
                <Input ref={fileRef} type="file" multiple />
                <Button type="submit" disabled={sending || !body.trim()}>
                  {sending ? "Sending…" : "Send"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
