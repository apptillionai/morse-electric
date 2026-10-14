/** Shown whenever pages render the placeholder catalog instead of Morse's live data. */
export function DemoCatalogBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div role="note" className="border-b border-copper/30 bg-copper-wash px-6 py-2.5 text-center text-sm text-ink">
      <strong>Preview catalog.</strong> Products shown are placeholders until Morse’s parts list is loaded.
    </div>
  );
}
