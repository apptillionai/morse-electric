export const THEMES = ["light", "mid", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = { light: "Light", mid: "Mid", dark: "Dark" };

export const THEME_STORAGE_KEY = "morse-theme";

/**
 * Runs in <head> before first paint: apply the saved theme, or follow the
 * operating system's light/dark preference when nothing is saved yet.
 * Kept as a plain string so it can be inlined without a bundle request.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEMES)}.indexOf(t)<0){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
