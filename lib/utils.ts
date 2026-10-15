import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatPrice(cents: number | null): string | null {
  return cents === null ? null : usd.format(cents / 100);
}

/** 0.5 → "½", 7.5 → "7½", 5 → "5": horsepower the way nameplates print it. */
export function formatHp(hp: number): string {
  const whole = Math.trunc(hp);
  const fraction = Math.round((hp - whole) * 100) / 100;
  const glyph: Record<number, string> = { 0.25: "¼", 0.33: "⅓", 0.5: "½", 0.75: "¾" };
  if (fraction === 0) return String(whole);
  if (glyph[fraction]) return `${whole || ""}${glyph[fraction]}`;
  return String(hp);
}
