"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Cloudflare Turnstile widget. It adds a hidden `cf-turnstile-response` input
 * to the surrounding form, which the server action verifies. Renders nothing
 * when no site key is configured (local development).
 *
 * `resetSignal` should change after every submission: tokens are single-use,
 * so a failed attempt needs a fresh challenge.
 */
export function Turnstile({ action, resetSignal }: { action: "quote" | "service"; resetSignal: unknown }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const render = useCallback(() => {
    if (!siteKey || !containerRef.current || !window.turnstile || widgetRef.current !== null) return;
    widgetRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      theme: "light",
      size: "flexible",
      "refresh-expired": "auto",
      "error-callback": () => setFailed(true),
    });
  }, [action, siteKey]);

  useEffect(() => {
    render();
    return () => {
      if (widgetRef.current !== null) window.turnstile?.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [render]);

  useEffect(() => {
    if (widgetRef.current !== null) window.turnstile?.reset(widgetRef.current);
  }, [resetSignal]);

  if (!siteKey) return null;

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="min-h-[65px]" />
      <Script
        id="turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={render}
        onError={() => setFailed(true)}
      />
      {failed && (
        <p role="alert" className="text-sm text-danger">
          The security check couldn’t load. Refresh the page and try again, or call us.
        </p>
      )}
    </div>
  );
}
