import type { Metadata } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { SITE } from "@/lib/site";
import { getSiteSettings } from "@/lib/site-settings";
import { initialTheme, THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow",
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

const DESCRIPTION =
  "New and remanufactured electric motors, pumps, blowers, vacuum pumps, starters and alternators, plus shop repair, rewinding and field service.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} | Motor sales, repair & service`,
    template: `%s | ${SITE.name}`,
  },
  description: DESCRIPTION,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE.name,
    title: `${SITE.name} | Motor sales, repair & service`,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Staff choose the default theme in /admin/settings; a visitor's own choice still wins.
  const { defaultTheme } = await getSiteSettings();
  return (
    // The boot script sets data-theme before paint, so React must accept the attribute it finds.
    <html
      lang="en"
      data-theme={initialTheme(defaultTheme)}
      data-default-theme={defaultTheme}
      suppressHydrationWarning
      className={`${barlow.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
