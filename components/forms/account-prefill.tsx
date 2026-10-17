"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { UnitPrefill } from "@/lib/customers/equipment";

interface Prefill {
  name: string;
  company: string;
  email: string;
  phone: string;
  /** The customer's equipment list (service form only uses it). */
  units?: UnitPrefill[];
}

/**
 * Fills empty contact fields from the signed-in customer's profile. Done in
 * the browser so the quote and service pages stay static for everyone else.
 */
export function useAccountPrefill(formRef: RefObject<HTMLFormElement | null>): Prefill | null {
  const [profile, setProfile] = useState<Prefill | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const controller = new AbortController();
    fetch("/api/account/prefill", { signal: controller.signal, credentials: "same-origin" })
      .then((r) => (r.status === 200 ? (r.json() as Promise<Prefill>) : null))
      .then((data) => {
        if (!data) return;
        setProfile(data);
        const form = formRef.current;
        if (!form) return;
        for (const key of ["name", "company", "email", "phone"] as const) {
          const input = form.elements.namedItem(key);
          if (input instanceof HTMLInputElement && !input.value && data[key]) input.value = data[key];
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [formRef]);

  return profile;
}

export function SignedInNote({ profile }: { profile: Prefill | null }) {
  if (!profile) return null;
  return (
    <p className="rounded border border-edge bg-page px-4 py-3 text-sm">
      Signed in as <strong>{profile.name}</strong>. This request will appear in{" "}
      <Link href="/account">your account</Link>, where you can follow its status.
    </p>
  );
}
