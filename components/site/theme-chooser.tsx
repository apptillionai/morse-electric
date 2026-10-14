"use client";

import { Moon, SunMedium, SunMoon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_LABELS, THEME_STORAGE_KEY, THEMES, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS = { light: SunMedium, mid: SunMoon, dark: Moon } as const;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function currentTheme(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "light";
}

/** Light / Mid / Dark switch. The choice is saved and re-applied before paint by THEME_BOOT_SCRIPT. */
export function ThemeChooser({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);

  function choose(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing can block storage; the theme still applies for this page view.
    }
  }

  return (
    <div role="group" aria-label="Colour theme" className={cn("inline-flex rounded-full border border-inverse-edge-strong p-0.5", className)}>
      {THEMES.map((option) => {
        const Icon = ICONS[option];
        const selected = theme === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => choose(option)}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
              selected ? "bg-on-inverse text-inverse" : "text-on-inverse-muted hover:text-on-inverse",
            )}
          >
            <Icon size={14} aria-hidden="true" />
            {THEME_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
