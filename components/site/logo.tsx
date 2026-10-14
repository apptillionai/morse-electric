import Link from "next/link";

// "MORSE" in Morse code: -- / --- / .-. / ... / .
const MORSE_MARKS: [x: number, w: number][] = [
  [0, 12], [15, 12],
  [36, 12], [51, 12], [66, 12],
  [87, 4], [94, 12], [109, 4],
  [122, 4], [129, 4], [136, 4],
  [149, 4],
];

export function MorseMark({ className }: { className?: string }) {
  return (
    <svg width="153" height="4" viewBox="0 0 153 4" aria-hidden="true" className={className}>
      <g fill="currentColor">
        {MORSE_MARKS.map(([x, w]) => (
          <rect key={x} x={x} y="0" width={w} height="4" />
        ))}
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex flex-col gap-1.5 text-fg no-underline hover:text-fg">
      <span className="font-display text-[32px] leading-none font-bold tracking-[0.04em]">
        MORSE{" "}
        <span className="text-[15px] font-medium tracking-[0.14em] text-fg-muted">ELECTRIC MOTOR CO.</span>
      </span>
      <MorseMark className="text-accent-ink" />
      <span className="sr-only">Morse Electric Motor Co. home</span>
    </Link>
  );
}
