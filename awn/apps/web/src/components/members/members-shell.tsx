"use client";

import type { FunctionReference } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { type ChangeEvent, useMemo, useState } from "react";
import { api } from "@awn/convex/convex/api";
import { AppNavbar } from "@/components/app/app-navbar";
import { useAwnViewer } from "@/components/app/use-awn-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type DirectoryUser = {
  _id: string;
  email?: string;
  username: string;
  role: "admin" | "moderator" | "member";
  status: "active" | "pending" | "suspended";
  approvedAt?: number;
  lastSeenAt: number;
  isSelf: boolean;
};

type InviteRecord = {
  _id: string;
  email: string;
  role: "admin" | "moderator" | "member";
  expiresAt: number;
  invitedBy: string;
  inviterUsername: string;
};

type InviteResult = {
  email: string;
  expiresAt: number;
  role: "admin" | "moderator" | "member";
  token: string;
};

type ConvexApi = {
  users: {
    listDirectory: FunctionReference<"query">;
    approveUser: FunctionReference<"mutation">;
  };
  invites: {
    listOpenInvites: FunctionReference<"query">;
    createInvite: FunctionReference<"mutation">;
  };
};

const convexApi = api as ConvexApi;

const inviteRoleOptions = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
] as const;

function formatRole(role: DirectoryUser["role"] | InviteRecord["role"]) {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "moderator") {
    return "Moderator";
  }

  return "Member";
}

function formatStatus(status: DirectoryUser["status"]) {
  if (status === "active") {
    return "Active";
  }

  if (status === "pending") {
    return "Pending";
  }

  return "Suspended";
}

function formatTimestamp(value?: number) {
  if (!value) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function parseInviteEmails(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]+/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function buildInviteLink(token: string) {
  if (typeof window === "undefined") {
    return `/?invite=${token}`;
  }

  return `${window.location.origin}/?invite=${token}`;
}

export function MembersShell() {
  const { authLoading, syncingUser, user, viewer } = useAwnViewer();
  const canLoadData = viewer?.status === "active";
  const directory = useQuery(convexApi.users.listDirectory, canLoadData ? {} : ("skip" as never));
  const invites = useQuery(convexApi.invites.listOpenInvites, canLoadData ? {} : ("skip" as never));
  const createInvite = useMutation(convexApi.invites.createInvite);
  const approveUser = useMutation(convexApi.users.approveUser);

  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviteState, setInviteState] = useState<{
    failures: string[];
    successes: InviteResult[];
  } | null>(null);
  const [submittingInvites, setSubmittingInvites] = useState(false);
  const [approvingKey, setApprovingKey] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const canInviteAdmins = viewer?.role === "admin";
  const resolvedInviteRole = canInviteAdmins ? inviteRole : "member";
  const directoryList = (directory ?? []) as DirectoryUser[];
  const openInvites = (invites ?? []) as InviteRecord[];

  const pendingUsers = useMemo(
    () => directoryList.filter((entry) => entry.status === "pending"),
    [directoryList],
  );
  const activeUsers = useMemo(
    () => directoryList.filter((entry) => entry.status === "active"),
    [directoryList],
  );

  const handleSendInvites = async () => {
    const emails = parseInviteEmails(inviteEmails);

    if (emails.length === 0) {
      setInviteState({
        failures: ["Enter at least one email address."],
        successes: [],
      });
      return;
    }

    setSubmittingInvites(true);
    setInviteState(null);

    try {
      const results = await Promise.allSettled(
        emails.map(async (email) => {
          const result = await createInvite({
            email,
            role: resolvedInviteRole,
          });

          return {
            email,
            expiresAt: result.expiresAt,
            role: result.role,
            token: result.token,
          } satisfies InviteResult;
        }),
      );

      const successes = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      const failures = results.flatMap((result) =>
        result.status === "rejected"
          ? [result.reason instanceof Error ? result.reason.message : String(result.reason)]
          : [],
      );

      setInviteState({ failures, successes });

      if (successes.length > 0) {
        setInviteEmails("");
      }
    } finally {
      setSubmittingInvites(false);
    }
  };

  const handleApprove = async (userId: string, role: "member" | "admin") => {
    const key = `${userId}:${role}`;
    setApprovingKey(key);

    try {
      await approveUser({ userId, role });
    } finally {
      setApprovingKey(null);
    }
  };

  const handleCopyInvite = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildInviteLink(token));
      setCopiedToken(token);
      window.setTimeout(() => {
        setCopiedToken((current) => (current === token ? null : current));
      }, 1800);
    } catch (error) {
      console.error("Failed to copy invite link.", error);
    }
  };

  if (authLoading || viewer === undefined) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 text-sm text-muted-foreground">
        Loading members…
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>You need an account to view members and send invites.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Link className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" href="/sign-in">
              Sign in
            </Link>
            <Link className="rounded-md border px-4 py-2 text-sm" href="/sign-up">
              Sign up
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
              <CardDescription>
                You will be able to invite people and browse the network once an admin activates your account.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  const inviteNote = canInviteAdmins
    ? "Admins can invite members or admins. Existing open invites are re-issued with a fresh link."
    : "Members can invite new members by email. Existing open invites are re-issued with a fresh link.";

  return (
    <div className="min-h-screen pb-10">
      <AppNavbar viewer={viewer} />

      <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
          <Card className="overflow-hidden border-0 bg-slate-950 text-white shadow-[0_24px_90px_-40px_rgba(15,23,42,0.75)]">
            <CardHeader className="gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.26em] text-slate-300">
                <span>Members</span>
                <span className="h-1 w-1 rounded-full bg-slate-500" />
                <span>{activeUsers.length} active</span>
                <span className="h-1 w-1 rounded-full bg-slate-500" />
                <span>{openInvites.length} open invite{openInvites.length === 1 ? "" : "s"}</span>
              </div>
              <div>
                <CardTitle className="text-3xl tracking-tight text-white">Grow the circle without leaving the app.</CardTitle>
                <CardDescription className="mt-3 max-w-2xl text-slate-300">
                  Invite people by email, track which links are still open, and keep an eye on who already has access.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-slate-300">Your access</div>
                <div className="mt-2 text-2xl font-semibold">{formatRole(viewer.role)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-slate-300">Pending approvals</div>
                <div className="mt-2 text-2xl font-semibold">{pendingUsers.length}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-slate-300">Visible members</div>
                <div className="mt-2 text-2xl font-semibold">{activeUsers.length}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Send invites</CardTitle>
              <CardDescription>{inviteNote}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="invite-emails">
                  Email addresses
                </label>
                <Textarea
                  id="invite-emails"
                  value={inviteEmails}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setInviteEmails(event.target.value)}
                  placeholder={"sam@example.com\ntaylor@example.com"}
                  className="min-h-28"
                />
                <p className="text-xs text-muted-foreground">Use commas or new lines to invite several people at once.</p>
              </div>

              <div className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Role</span>
                <div className="flex flex-wrap gap-2">
                  {inviteRoleOptions
                    .filter((option) => canInviteAdmins || option.value === "member")
                    .map((option) => {
                      const active = resolvedInviteRole === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setInviteRole(option.value)}
                          className={cn(
                            "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                            active
                              ? "border-slate-950 bg-slate-950 text-white"
                              : "border-border bg-background text-foreground hover:bg-accent",
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                </div>
              </div>

              <Button onClick={handleSendInvites} disabled={submittingInvites}>
                {submittingInvites ? "Sending…" : "Send invites"}
              </Button>

              {inviteState ? (
                <div className="grid gap-3 rounded-2xl border bg-slate-50 p-4">
                  {inviteState.successes.length > 0 ? (
                    <div className="grid gap-3">
                      <div className="text-sm font-medium text-slate-900">
                        Sent {inviteState.successes.length} invite{inviteState.successes.length === 1 ? "" : "s"}.
                      </div>
                      {inviteState.successes.map((result) => {
                        const inviteLink = buildInviteLink(result.token);

                        return (
                          <div key={result.token} className="rounded-xl border bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="font-medium text-slate-950">{result.email}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatRole(result.role)} invite, expires {formatTimestamp(result.expiresAt)}
                                </div>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => handleCopyInvite(result.token)}>
                                {copiedToken === result.token ? "Copied" : "Copy link"}
                              </Button>
                            </div>
                            <Input className="mt-3" readOnly value={inviteLink} />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {inviteState.failures.length > 0 ? (
                    <div className="grid gap-1 text-sm text-red-600">
                      {inviteState.failures.map((failure, index) => (
                        <div key={`${failure}-${index}`}>{failure}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>

        {canInviteAdmins ? (
          <Card>
            <CardHeader>
              <CardTitle>Pending people</CardTitle>
              <CardDescription>Approve anyone who signed in without a valid invite, or elevate them immediately.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {pendingUsers.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                  No pending users right now.
                </div>
              ) : (
                pendingUsers.map((entry) => (
                  <div
                    key={entry._id}
                    className="flex flex-col gap-4 rounded-2xl border p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-950">@{entry.username}</span>
                        <Badge variant="outline">{formatStatus(entry.status)}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">{entry.email ?? "Email hidden"}</div>
                      <div className="text-xs text-muted-foreground">Last seen {formatTimestamp(entry.lastSeenAt)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleApprove(entry._id, "member")}
                        disabled={approvingKey !== null}
                      >
                        {approvingKey === `${entry._id}:member` ? "Approving…" : "Approve as member"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(entry._id, "admin")}
                        disabled={approvingKey !== null}
                      >
                        {approvingKey === `${entry._id}:admin` ? "Approving…" : "Approve as admin"}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.08fr,0.92fr]">
          <Card>
            <CardHeader>
              <CardTitle>Directory</CardTitle>
              <CardDescription>Everyone with access you are allowed to see.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {directory === undefined ? (
                <div className="text-sm text-muted-foreground">Loading directory…</div>
              ) : activeUsers.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                  No active members yet.
                </div>
              ) : (
                activeUsers.map((entry) => (
                  <div key={entry._id} className="rounded-2xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-950">@{entry.username}</span>
                          {entry.isSelf ? <Badge variant="secondary">You</Badge> : null}
                          <Badge variant="outline">{formatRole(entry.role)}</Badge>
                        </div>
                        {entry.email ? <div className="mt-1 text-sm text-muted-foreground">{entry.email}</div> : null}
                      </div>
                      <Badge>{formatStatus(entry.status)}</Badge>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Approved {formatTimestamp(entry.approvedAt)}. Last seen {formatTimestamp(entry.lastSeenAt)}.
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open invites</CardTitle>
              <CardDescription>
                {canInviteAdmins ? "All active invites in the workspace." : "Invites you have sent that are still active."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {invites === undefined ? (
                <div className="text-sm text-muted-foreground">Loading invites…</div>
              ) : openInvites.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                  No open invites right now.
                </div>
              ) : (
                openInvites.map((invite) => (
                  <div key={invite._id} className="rounded-2xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium text-slate-950">{invite.email}</div>
                      <Badge variant={invite.role === "admin" ? "default" : "outline"}>{formatRole(invite.role)}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Invited by @{invite.inviterUsername}. Expires {formatTimestamp(invite.expiresAt)}.
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
