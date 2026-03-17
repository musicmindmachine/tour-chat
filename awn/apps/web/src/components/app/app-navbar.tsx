"use client";

import Link from "next/link";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppNavbarProps = {
  viewer: {
    username: string;
    role: "admin" | "moderator" | "member";
    status: "active" | "pending" | "suspended";
  };
};

const activeLinks = [
  { href: "/", label: "Boards" },
  { href: "/members", label: "Members" },
];

function formatRole(role: AppNavbarProps["viewer"]["role"]) {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "moderator") {
    return "Moderator";
  }

  return "Member";
}

function formatStatus(status: AppNavbarProps["viewer"]["status"]) {
  if (status === "active") {
    return "Active";
  }

  if (status === "pending") {
    return "Pending";
  }

  return "Suspended";
}

export function AppNavbar({ viewer }: AppNavbarProps) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const links = viewer.status === "active" ? activeLinks : [{ href: "/", label: "Overview" }];

  return (
    <header className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 rounded-[1.5rem] border border-white/70 bg-white/85 px-4 py-4 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.55)] backdrop-blur sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold uppercase tracking-[0.32em] text-white">
                A
              </span>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.26em] text-muted-foreground">
                  Private network
                </div>
                <div className="text-lg font-semibold tracking-tight text-slate-950">Awn</div>
              </div>
            </Link>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            {links.map((link) => {
              const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    buttonVariants({ variant: isActive ? "default" : "ghost", size: "sm" }),
                    "rounded-full px-4",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <span className="text-sm font-medium text-slate-700">@{viewer.username}</span>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {formatRole(viewer.role)}
            </Badge>
            <Badge variant={viewer.status === "active" ? "default" : "outline"} className="rounded-full px-3 py-1">
              {formatStatus(viewer.status)}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
