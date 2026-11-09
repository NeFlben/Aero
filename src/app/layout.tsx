import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { I18nProvider, type Locale } from "@/lib/i18n";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const jbMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-jb-mono" });

export const metadata: Metadata = {
  title: { default: "Hangar", template: "%s · Hangar" },
  description: "A modern database for aircraft model collections.",
  applicationName: "Hangar",
  appleWebApp: { capable: true, title: "Hangar", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#eef2fb" }, { media: "(prefers-color-scheme: dark)", color: "#070a1a" }] };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const locale: Locale = jar.get("locale")?.value === "de" ? "de" : "en";
  const stored = jar.get("theme")?.value;
  return (
    <html lang={locale} data-theme={stored === "dark" ? "dark" : stored === "light" ? "light" : undefined} className={`${jakarta.variable} ${jbMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Follows the system setting until the user has chosen, before the first paint. */}
        {!stored && <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"` }} />}
      </head>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
