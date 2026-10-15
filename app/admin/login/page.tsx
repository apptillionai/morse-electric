import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { getStaffUser } from "@/lib/admin/auth";
import { safeAdminPath } from "@/lib/admin/paths";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Staff sign in" };

export default async function LoginPage(props: PageProps<"/admin/login">) {
  const { next } = await props.searchParams;
  const destination = safeAdminPath(typeof next === "string" ? next : null);
  if (await getStaffUser()) redirect(destination);
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-md border border-edge bg-surface p-8">
        <p className="eyebrow mb-2">Morse Electric Motor Co.</p>
        <h1 className="display mb-6 text-4xl">Staff sign in</h1>
        {isSupabaseConfigured() ? (
          <LoginForm next={destination} />
        ) : (
          <p className="text-fg-muted">
            The admin needs the Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL and
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) before anyone can sign in.
          </p>
        )}
        <p className="mt-6 text-sm text-fg-muted">
          <Link href="/">Back to the website</Link>
        </p>
      </div>
    </main>
  );
}
