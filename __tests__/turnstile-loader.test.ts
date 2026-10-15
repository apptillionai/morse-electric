import { describe, expect, it, vi } from "vitest";
import { TURNSTILE_ONLOAD, TURNSTILE_SRC, whenTurnstileReady } from "@/lib/requests/turnstile-loader";

const settled = async (p: Promise<void>) => {
  let done = false;
  p.then(() => (done = true));
  await new Promise((r) => setTimeout(r, 0));
  return done;
};

describe("whenTurnstileReady", () => {
  it("names the onload callback in the script URL", () => {
    expect(TURNSTILE_SRC).toContain("render=explicit");
    expect(TURNSTILE_SRC).toContain(`onload=${TURNSTILE_ONLOAD}`);
  });

  it("resolves at once when the API is already usable", async () => {
    expect(await settled(whenTurnstileReady({ turnstile: { render: () => "id" } }))).toBe(true);
  });

  it("waits for onload while the loader has only defined a stub", async () => {
    // What production hit: window.turnstile exists but render does not yet.
    const host: Record<string, unknown> = { turnstile: {} };
    const ready = whenTurnstileReady(host);
    expect(await settled(ready)).toBe(false);

    host.turnstile = { render: () => "id" };
    (host[TURNSTILE_ONLOAD] as () => void)();
    expect(await settled(ready)).toBe(true);
  });

  it("shares one wait between widgets and keeps an existing handler", async () => {
    const previous = vi.fn();
    const host: Record<string, unknown> = { [TURNSTILE_ONLOAD]: previous };
    const first = whenTurnstileReady(host);
    expect(whenTurnstileReady(host)).toBe(first);

    (host[TURNSTILE_ONLOAD] as () => void)();
    expect(await settled(first)).toBe(true);
    expect(previous).toHaveBeenCalledOnce();
  });
});
