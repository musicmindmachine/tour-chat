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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/80 bg-card/75 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
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
            <CardDescription>You need an account to manage membership and invites.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Link className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground" href="/sign-in">
              Sign in
            </Link>
            <Link className="inline-flex h-9 items-center rounded-lg border border-border/80 bg-background/80 px-3 text-[13px] font-medium" href="/sign-up">
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
        <main className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
          <Card>
            <CardHeader>
              <CardTitle>Workspace access pending</CardTitle>
              <CardDescription>
                You will be able to invite people and browse the directory once an admin activates your account.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  const inviteNote = canInviteAdmins
    ? "Admins can invite members or admins."
    : "Members can invite new members by email.";

  return (
    <div className="min-h-screen pb-8">
      <AppNavbar viewer={viewer} />

      <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Members</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Directory and access</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
              Review who has access, send new invites, and approve pending people from one place.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <StatCard label="Role" value={formatRole(viewer.role)} />
            <StatCard label="Active" value={activeUsers.length} />
            <StatCard label="Invites" value={openInvites.length} />
            <StatCard label="Pending" value={pendingUsers.length} />
          </div>
        </section>

        {canInviteAdmins && pendingUsers.length > 0 ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Pending approvals</CardTitle>
                <CardDescription>People who signed in before receiving an invite.</CardDescription>
              </div>
              <Badge variant="secondary">{pendingUsers.length} awaiting review</Badge>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y divide-border/80">
                {pendingUsers.map((entry) => (
                  <div
                    key={entry._id}
                    className="grid gap-3 px-1 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">@{entry.username}</span>
                        <Badge variant="outline">{formatStatus(entry.status)}</Badge>
                      </div>
                      <div className="mt-1 text-[13px] text-muted-foreground">{entry.email ?? "Email hidden"}</div>
                      <div className="mt-1 text-[12px] text-muted-foreground">
                        Last seen {formatTimestamp(entry.lastSeenAt)}
                      </div>
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
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Directory</CardTitle>
                <CardDescription>Visible accounts in the workspace.</CardDescription>
              </div>
              <Badge variant="secondary">{activeUsers.length} active</Badge>
            </CardHeader>
            <CardContent className="pt-0">
              {directory === undefined ? (
                <div className="px-1 py-3 text-sm text-muted-foreground">Loading directory…</div>
              ) : activeUsers.length === 0 ? (
                <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  No active members yet.
                </div>
              ) : (
                <div className="divide-y divide-border/80">
                  {activeUsers.map((entry) => (
                    <div
                      key={entry._id}
                      className="grid gap-3 px-1 py-3 sm:grid-cols-[minmax(0,1fr)_160px_180px] sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">@{entry.username}</span>
                          {entry.isSelf ? <Badge variant="secondary">You</Badge> : null}
                        </div>
                        <div className="mt-1 truncate text-[13px] text-muted-foreground">
                          {entry.email ?? "Email visible to admins only"}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{formatRole(entry.role)}</Badge>
                        <Badge>{formatStatus(entry.status)}</Badge>
                      </div>

                      <div className="text-[12px] text-muted-foreground">
                        Approved {formatTimestamp(entry.approvedAt)}
                        <br />
                        Last seen {formatTimestamp(entry.lastSeenAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Send invites</CardTitle>
                <CardDescription>{inviteNote} Existing open invites are re-issued with a fresh link.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-2">
                  <label className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="invite-emails">
                    Email addresses
                  </label>
                  <Textarea
                    id="invite-emails"
                    value={inviteEmails}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setInviteEmails(event.target.value)}
                    placeholder={"sam@example.com\ntaylor@example.com"}
                    className="min-h-[132px]"
                  />
                  <p className="text-[12px] text-muted-foreground">Use commas or new lines for multiple invites.</p>
                </div>

                <div className="grid gap-2">
                  <span className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Role</span>
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
                              "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border/80 bg-background/80 text-foreground hover:bg-accent",
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
                  <div className="grid gap-3 rounded-lg border border-border/80 bg-background/60 p-3">
                    {inviteState.successes.length > 0 ? (
                      <div className="grid gap-2">
                        {inviteState.successes.map((result) => (
                          <div key={result.token} className="rounded-lg border border-border/80 bg-card px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground">{result.email}</div>
                                <div className="mt-1 text-[12px] text-muted-foreground">
                                  {formatRole(result.role)} • expires {formatTimestamp(result.expiresAt)}
                                </div>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => handleCopyInvite(result.token)}>
                                {copiedToken === result.token ? "Copied" : "Copy link"}
                              </Button>
                            </div>
                            <Input className="mt-2" readOnly value={buildInviteLink(result.token)} />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {inviteState.failures.length > 0 ? (
                      <div className="grid gap-1 text-[13px] text-red-600">
                        {inviteState.failures.map((failure, index) => (
                          <div key={`${failure}-${index}`}>{failure}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>Open invites</CardTitle>
                  <CardDescription>
                    {canInviteAdmins ? "All active invites in the workspace." : "Active invites you have sent."}
                  </CardDescription>
                </div>
                <Badge variant="secondary">{openInvites.length}</Badge>
              </CardHeader>
              <CardContent className="pt-0">
                {invites === undefined ? (
                  <div className="px-1 py-3 text-sm text-muted-foreground">Loading invites…</div>
                ) : openInvites.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                    No open invites right now.
                  </div>
                ) : (
                  <div className="divide-y divide-border/80">
                    {openInvites.map((invite) => (
                      <div key={invite._id} className="px-1 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">{invite.email}</div>
                            <div className="mt-1 text-[12px] text-muted-foreground">
                              @{invite.inviterUsername} • expires {formatTimestamp(invite.expiresAt)}
                            </div>
                          </div>
                          <Badge variant={invite.role === "admin" ? "default" : "outline"}>{formatRole(invite.role)}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
