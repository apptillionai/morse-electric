/** Request header the proxy sets to the /admin URL being visited. */
export const ADMIN_PATH_HEADER = "x-morse-admin-path";

/** Only same-site /admin paths are allowed as a post-sign-in destination. */
export function safeAdminPath(raw: string | null | undefined): string {
  if (!raw || !/^\/admin(?:[/?]|$)/.test(raw) || raw.startsWith("/admin/login") || /[\\\s]/.test(raw)) return "/admin";
  return raw;
}
