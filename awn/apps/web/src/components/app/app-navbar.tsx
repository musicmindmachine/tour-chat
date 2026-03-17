"use client";

import Link from "next/link";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/app/theme-toggle";
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
    <header className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card/92 px-3 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-primary text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground">
                A
              </span>
              <div className="leading-tight">
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Awn</div>
                <div className="text-sm font-semibold text-foreground">Workspace</div>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 rounded-lg bg-muted/70 p-1 md:flex">
              {links.map((link) => {
                const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      buttonVariants({ variant: isActive ? "default" : "ghost", size: "sm" }),
                      "h-8 rounded-md px-3",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <nav className="flex items-center gap-1 rounded-lg bg-muted/70 p-1 md:hidden">
              {links.map((link) => {
                const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      buttonVariants({ variant: isActive ? "default" : "ghost", size: "sm" }),
                      "h-8 rounded-md px-3",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="hidden min-w-0 items-center gap-2 rounded-lg border border-border/80 bg-background/70 px-2.5 py-1.5 sm:flex">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium leading-none text-foreground">@{viewer.username}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {formatRole(viewer.role)} • {formatStatus(viewer.status)}
                </div>
              </div>
            </div>

            <ThemeToggle compact />

            <Button variant="ghost" size="sm" className="h-8 px-2.5" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
