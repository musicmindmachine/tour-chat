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
import { useAuthActions } from "@convex-dev/auth/react";
import { PersonIcon } from "@radix-ui/react-icons";
import Link from "next/link";

export function UserMenu({ name, email }: { name: string; email?: string }) {
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
