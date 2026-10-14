/** Kinds of one-time sign-in link we send customers. */
export type AccountLinkType = "invite" | "recovery";

export const isAccountLinkType = (v: unknown): v is AccountLinkType => v === "invite" || v === "recovery";

/**
 * Our own landing URL for a Supabase one-time token. The page asks the person
 * to press a button before the token is used, so link scanners in email
 * clients can't burn it by prefetching.
 */
export function accountLinkUrl(origin: string, tokenHash: string, type: AccountLinkType): string {
  const url = new URL("/account/accept", origin);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}

/** Only same-site /account paths are allowed as a post-sign-in destination. */
export function safeAccountPath(raw: string | null | undefined): string {
  if (!raw || !/^\/account(?:[/?]|$)/.test(raw) || /^\/account\/(login|accept)/.test(raw) || /[\\\s]/.test(raw)) {
    return "/account";
  }
  return raw;
}
