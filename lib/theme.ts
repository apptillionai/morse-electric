export const THEMES = ["light", "mid", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = { light: "Light", mid: "Mid", dark: "Dark" };

export const THEME_STORAGE_KEY = "morse-theme";

/** What staff can pick as the site-wide default: a theme, or follow the visitor's device. */
export const DEFAULT_THEME_OPTIONS = [...THEMES, "system"] as const;
export type DefaultTheme = (typeof DEFAULT_THEME_OPTIONS)[number];
export const FALLBACK_DEFAULT_THEME: DefaultTheme = "light";

export const DEFAULT_THEME_LABELS: Record<DefaultTheme, string> = {
  light: "Light",
  mid: "Mid",
  dark: "Dark",
  system: "Match the visitor’s device (light or dark)",
};

export const isDefaultTheme = (v: unknown): v is DefaultTheme =>
  typeof v === "string" && (DEFAULT_THEME_OPTIONS as readonly string[]).includes(v);

/** The theme to render on the server before the boot script runs. */
export const initialTheme = (d: DefaultTheme): Theme => (d === "system" ? "light" : d);

/**
 * Runs in <head> before first paint. A visitor's own saved choice wins;
 * otherwise use the site default from <html data-default-theme>, where
 * "system" follows the operating system's light/dark preference.
 * Kept as a plain string so it can be inlined without a bundle request.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,a=${JSON.stringify(THEMES)},t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(a.indexOf(t)<0){t=d.getAttribute("data-default-theme");if(t==="system"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}else if(a.indexOf(t)<0){t=${JSON.stringify(FALLBACK_DEFAULT_THEME)}}}d.setAttribute("data-theme",t)}catch(e){}})()`;
