/** Global callback Turnstile calls once its API can render widgets. */
export const TURNSTILE_ONLOAD = "__morseTurnstileOnload";

export const TURNSTILE_SRC = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${TURNSTILE_ONLOAD}`;

type TurnstileHost = { turnstile?: { render?: unknown } } & Record<string, unknown>;

const pending = new WeakMap<object, Promise<void>>();

/**
 * Resolves once `turnstile.render` can be called. Cloudflare's loader defines
 * `window.turnstile` before the real API arrives, so the script's own load
 * event is too early; wait for the `onload` callback named in the script URL.
 */
export function whenTurnstileReady(host: TurnstileHost): Promise<void> {
  if (typeof host.turnstile?.render === "function") return Promise.resolve();
  let ready = pending.get(host);
  if (!ready) {
    ready = new Promise((resolve) => {
      const previous = host[TURNSTILE_ONLOAD];
      host[TURNSTILE_ONLOAD] = () => {
        if (typeof previous === "function") previous();
        resolve();
      };
    });
    pending.set(host, ready);
  }
  return ready;
}
