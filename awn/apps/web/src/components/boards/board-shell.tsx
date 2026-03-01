"use client";

import { useUploadFile } from "@convex-dev/r2/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FunctionReference } from "convex/server";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { PaginatedQueryReference } from "convex/react";
import Link from "next/link";
import { type ChangeEvent, type FormEvent, useMemo, useRef, useState } from "react";
import { api } from "@awn/convex/convex/api";
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

const PAGE_SIZE = 30;

export function BoardShell({ boardId }: BoardShellProps) {
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
    return <div className="p-6 text-sm text-muted-foreground">Loading board…</div>;
  }

  if (!board) {
    return (
      <div className="mx-auto max-w-3xl p-6">
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
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-screen w-full max-w-4xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
        <div>
          <p className="text-lg font-semibold">{board.name}</p>
          <p className="text-sm text-muted-foreground">{board.description ?? "Message board"}</p>
        </div>
        <Link href="/" className="text-sm underline">
          Dashboard
        </Link>
      </div>

      <div
        ref={parentRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-auto rounded-lg border bg-background"
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
                <div className="rounded-md border bg-card p-3">
                  <div className="mb-1 text-xs text-muted-foreground">{new Date(message._creationTime).toLocaleString()}</div>
                  <div className="whitespace-pre-wrap text-sm">{message.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={onSubmit} className="grid gap-2 rounded-lg border bg-card p-3">
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
    </div>
  );
}
