import { readFileSync } from "node:fs";
import path from "node:path";
import { THEMES } from "@/lib/theme";

/**
 * Reads the theme tokens straight from app/globals.css and checks every
 * foreground/background pairing the UI uses against WCAG 2.1 AA:
 * 4.5:1 for text, 3:1 for component boundaries (inputs, buttons, focus ring).
 */

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

function tokensFor(theme: string): Record<string, string> {
  const block = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`));
  if (!block) throw new Error(`No [data-theme="${theme}"] block in globals.css`);
  return Object.fromEntries([...block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function luminance(hex: string): number {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`Expected a #rrggbb colour, got ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5;
const UI = 3;

// [foreground token, background token, minimum ratio]
const PAIRS: [string, string, number][] = [
  ...["page", "surface"].flatMap((bg): [string, string, number][] => [
    ["fg", bg, TEXT],
    ["fg-muted", bg, TEXT],
    ["accent-ink", bg, TEXT],
    ["ok", bg, TEXT],
    ["warn", bg, TEXT],
    ["danger", bg, TEXT],
    ["edge-strong", bg, UI],
    ["bold", bg, UI],
    ["accent", bg, UI],
    ["focus", bg, UI],
  ]),
  ["on-accent", "accent", TEXT],
  ["on-accent", "accent-hover", TEXT],
  ["on-bold", "bold", TEXT],
  ["on-bold", "bold-hover", TEXT],
  ["fg", "accent-wash", TEXT],
  ["fg-muted", "placeholder", TEXT],
  ["on-inverse", "inverse", TEXT],
  ["on-inverse-muted", "inverse", TEXT],
  ["on-inverse-accent", "inverse", TEXT],
  ["inverse-edge-strong", "inverse", UI],
  ["focus", "inverse", UI],
];

describe.each(THEMES)("%s theme", (theme) => {
  const tokens = tokensFor(theme);

  it("defines every token the other themes define", () => {
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(tokensFor("light")).sort());
  });

  it.each(PAIRS)("%s on %s meets %s:1", (fg, bg, min) => {
    expect(tokens[fg], `--${fg}`).toBeDefined();
    expect(tokens[bg], `--${bg}`).toBeDefined();
    const ratio = contrast(tokens[fg], tokens[bg]);
    expect(ratio, `--${fg} ${tokens[fg]} on --${bg} ${tokens[bg]} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });
});
