import type { SVGProps } from "react";

// Line icons drawn for the six product lines (24px grid, stroked).
const PATHS: Record<string, React.ReactNode> = {
  "electric-motors": (
    <>
      <rect x="3" y="7" width="13" height="10" rx="2" />
      <path d="M16 12h5M7 7v10M10.5 7v10M5 17v3h9v-3" />
    </>
  ),
  pumps: (
    <>
      <circle cx="10" cy="14" r="6" />
      <path d="M10 8V4h9v4M16 14h5M10 14l3-3" />
    </>
  ),
  blowers: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 12c0-4 2-6 4.5-6M12 12c4 0 6 2 6 4.5M12 12c0 4-2 6-4.5 6M12 12c-4 0-6-2-6-4.5" />
    </>
  ),
  "vacuum-pumps": (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 13l4-4M12 5V2M9 2h6" />
    </>
  ),
  "starters-controls": (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M13 7l-3 5h4l-3 5" />
    </>
  ),
  alternators: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 12c1.5-3 3-3 4.5 0s3 3 4.5 0 2.2-2 3 0" />
    </>
  ),
};

export function CategoryIcon({ slug, ...props }: { slug: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[slug] ?? <rect x="4" y="4" width="16" height="16" rx="2" />}
    </svg>
  );
}
