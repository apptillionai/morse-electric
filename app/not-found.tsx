import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-start gap-5 px-6 py-24">
      <span className="eyebrow">404</span>
      <h1 className="display text-5xl">We couldn’t find that page.</h1>
      <p className="text-lg text-muted">
        The part may have sold or moved. Search the catalog, or send us the nameplate details and we’ll track it down.
      </p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/shop">Browse the catalog</ButtonLink>
        <ButtonLink href="/quote" variant="outline">Request a quote</ButtonLink>
      </div>
    </div>
  );
}
