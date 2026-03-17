"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const STORAGE_KEY = "awn-theme";

function resolveTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

type ThemeToggleProps = {
  compact?: boolean;
};

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const nextTheme = resolveTheme();
    setTheme(nextTheme);
    applyTheme(nextTheme);
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  const nextModeLabel = mounted ? (theme === "dark" ? "light" : "dark") : "theme";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(compact ? "h-8 w-8 px-0" : "h-8 px-2.5")}
      onClick={toggleTheme}
      aria-label={`Switch to ${nextModeLabel} mode`}
      title={`Switch to ${nextModeLabel} mode`}
    >
      {theme === "dark" ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
      {compact ? null : <span className="text-xs">{theme === "dark" ? "Light" : "Dark"}</span>}
    </Button>
  );
}
