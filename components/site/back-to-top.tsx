"use client";

import { ArrowUp } from "lucide-react";
import { useSyncExternalStore } from "react";

/** How far down the page (px) before the button appears. */
const SHOW_AFTER = 400;

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

const scrolledDown = () => window.scrollY > SHOW_AFTER;

/**
 * Round "back to top" button, shown once the visitor has scrolled down.
 * Scrolling is smooth unless they prefer reduced motion (see `html` in
 * globals.css). Focus moves to the top of the page so keyboard users
 * aren't left on a button that has just disappeared.
 */
export function BackToTop() {
  const shown = useSyncExternalStore(subscribe, scrolledDown, () => false);
  if (!shown) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => {
        window.scrollTo({ top: 0 });
        document.getElementById("top")?.focus({ preventScroll: true });
      }}
      className="fixed right-5 bottom-5 z-40 inline-flex size-12 items-center justify-center rounded-full border-2 border-on-bold bg-bold text-on-bold shadow-lg transition-opacity duration-200 hover:bg-bold-hover starting:opacity-0 motion-reduce:transition-none sm:right-6 sm:bottom-6"
    >
      <ArrowUp size={22} aria-hidden="true" />
    </button>
  );
}
