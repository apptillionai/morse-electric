import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_PATH_HEADER } from "@/lib/admin/paths";

/**
 * Keeps staff sessions fresh: refreshes the Supabase auth cookies on every
 * /admin request. Access control itself happens in the admin pages, server
 * actions and row-level security, never here.
 */
export async function proxy(request: NextRequest) {
  // Tell the admin pages which URL was asked for, so sign-in can return to it.
  request.headers.set(ADMIN_PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers ?? {})) response.headers.set(name, value);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
