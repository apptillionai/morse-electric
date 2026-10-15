import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { template: "%s · Your account · Morse Electric", default: "Your account" },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return children;
}
