"use client";

import { Check, Moon, SunMedium, SunMoon } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { THEME_LABELS, THEME_STORAGE_KEY, THEMES, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS = { light: SunMedium, mid: SunMoon, dark: Moon } as const;
const MENU_WIDTH = 144;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function currentTheme(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "light";
}

/**
 * Light / Mid / Dark switch: one small icon button that opens a short list.
 * The choice is saved and re-applied before paint by THEME_BOOT_SCRIPT.
 */
export function ThemeChooser({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const [open, setOpen] = useState(false);
  // Open the list towards whichever side has room, so it never runs off a narrow screen.
  const [alignLeft, setAlignLeft] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const Icon = ICONS[theme];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    if (!open && trigger.current) setAlignLeft(trigger.current.getBoundingClientRect().right < MENU_WIDTH + 16);
    setOpen(!open);
  }

  function choose(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing can block storage; the theme still applies for this page view.
    }
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div
      ref={wrapper}
      className={cn("relative inline-flex", className)}
      onBlur={(event) => {
        if (!wrapper.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Colour theme: ${THEME_LABELS[theme]}`}
        title="Colour theme"
        onClick={toggle}
        className="inline-flex size-8 items-center justify-center rounded-full text-on-inverse-muted hover:text-on-inverse aria-expanded:text-on-inverse"
      >
        <Icon size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="Colour theme"
          style={{ width: MENU_WIDTH }}
          className={cn(
            "absolute top-full z-50 mt-1.5 flex flex-col rounded-md border border-edge bg-surface p-1 text-fg shadow-lg",
            alignLeft ? "left-0" : "right-0",
          )}
        >
          {THEMES.map((option) => {
            const OptionIcon = ICONS[option];
            const selected = theme === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => choose(option)}
                className="flex min-h-9 items-center gap-2 rounded px-2.5 text-left text-sm font-semibold hover:bg-page"
              >
                <OptionIcon size={16} aria-hidden="true" />
                <span className="flex-1">{THEME_LABELS[option]}</span>
                {selected && <Check size={16} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
