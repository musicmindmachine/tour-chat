"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuthActions } from "@convex-dev/auth/react";
import { PersonIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type UserRole = "admin" | "user";
type AllowlistEntry = {
  _id: string;
  email: string;
};

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email?: string;
  role?: UserRole;
}) {
  const isAdmin = role === "admin";
  const [allowlistEntries, setAllowlistEntries] = useState<AllowlistEntry[]>(
    [],
  );
  const [isLoadingAllowlist, setIsLoadingAllowlist] = useState(false);
  const [emailToAdd, setEmailToAdd] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removingEntryId, setRemovingEntryId] = useState<string | null>(null);

  const refreshAllowlist = useCallback(async () => {
    if (!isAdmin) {
      return;
    }
    setIsLoadingAllowlist(true);
    try {
      const response = await fetch("/api/admin/allowlist", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const result = (await response.json()) as { entries: AllowlistEntry[] };
      setAllowlistEntries(result.entries);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoadingAllowlist(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    void refreshAllowlist();
  }, [isAdmin, refreshAllowlist]);

  async function handleAddEmail() {
    const normalizedEmail = emailToAdd.trim().toLowerCase();
    if (normalizedEmail.length === 0) {
      toast.error("Enter an email address.");
      return;
    }

    setIsAdding(true);
    try {
      const response = await fetch("/api/admin/allowlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      setEmailToAdd("");
      await refreshAllowlist();
      toast.success("Email allowlisted.");
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemoveEmail(entryId: string) {
    setRemovingEntryId(entryId);
    try {
      const response = await fetch(`/api/admin/allowlist/${entryId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      await refreshAllowlist();
      toast.success("Email removed from allowlist.");
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error));
    } finally {
      setRemovingEntryId(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" className="rounded-full">
          <PersonIcon className="h-5 w-5" />
          <span className="sr-only">Open account menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate text-sm font-semibold">{name}</p>
          {email ? (
            <p className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">Account</Link>
        </DropdownMenuItem>

        {isAdmin ? (
          <>
            <DropdownMenuSeparator />
            <div className="space-y-2 px-2 py-2">
              <p className="text-xs font-medium text-muted-foreground">
                Email allowlist
              </p>
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleAddEmail();
                }}
              >
                <Input
                  value={emailToAdd}
                  onChange={(event) => setEmailToAdd(event.target.value)}
                  className="h-8 text-xs"
                  placeholder="name@example.com"
                  type="email"
                />
                <Button
                  className="h-8 px-2 text-xs"
                  size="sm"
                  type="submit"
                  disabled={isAdding}
                >
                  {isAdding ? "Adding..." : "Add"}
                </Button>
              </form>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {isLoadingAllowlist ? (
                  <p className="text-xs text-muted-foreground">Loading...</p>
                ) : allowlistEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No emails allowlisted yet.
                  </p>
                ) : (
                  allowlistEntries.map((entry) => (
                    <div
                      key={entry._id}
                      className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                    >
                      <span className="truncate text-xs">{entry.email}</span>
                      <Button
                        className="h-6 px-2 text-xs"
                        variant="ghost"
                        type="button"
                        onClick={() => void handleRemoveEmail(entry._id)}
                        disabled={removingEntryId === entry._id}
                      >
                        {removingEntryId === entry._id ? "..." : "Remove"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center justify-between py-2 text-xs font-normal">
          Theme
          <ThemeToggle />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <SignOutButton />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SignOutButton() {
  const { signOut } = useAuthActions();
  return (
    <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Request failed. Please try again.";
}

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    if (typeof data.error === "string" && data.error.trim().length > 0) {
      return data.error;
    }
  } catch {
    // Ignore invalid JSON body.
  }
  return `Request failed (${response.status})`;
}
