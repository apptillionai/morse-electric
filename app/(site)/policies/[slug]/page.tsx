import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PolicyContent } from "@/components/site/policy-content";
import { getPolicy, POLICIES } from "@/lib/policies";
import { getBusiness } from "@/lib/site-settings";

export const dynamicParams = false;

export function generateStaticParams() {
  return POLICIES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: PageProps<"/policies/[slug]">): Promise<Metadata> {
  const policy = getPolicy((await props.params).slug);
  if (!policy) return {};
  return {
    title: policy.title,
    description: policy.description,
    alternates: { canonical: `/policies/${policy.slug}` },
    // Drafts stay out of search results until Morse approves the wording.
    ...(policy.draft ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function PolicyPage(props: PageProps<"/policies/[slug]">) {
  const policy = getPolicy((await props.params).slug);
  if (!policy) notFound();
  const business = await getBusiness();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 pt-12 pb-20 leading-relaxed">
      <div className="flex flex-col gap-3">
        <span className="eyebrow">Policies</span>
        <h1 className="display text-5xl">{policy.title}</h1>
      </div>
      {policy.draft && (
        <p role="note" className="rounded border-2 border-warn bg-surface px-4 py-3 text-sm">
          <strong>Draft.</strong> We’re finalising this policy, and values in brackets such as [XX] are still to be
          confirmed. If anything here matters to an order, {business.callUs}.
        </p>
      )}
      <PolicyContent slug={policy.slug} business={business} />
      <nav aria-label="Other policies" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-edge pt-6 text-sm">
        {POLICIES.filter((p) => p.slug !== policy.slug).map((p) => (
          <Link key={p.slug} href={`/policies/${p.slug}`}>
            {p.title}
          </Link>
        ))}
      </nav>
    </div>
  );
}
