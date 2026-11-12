import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Plotline · Deforestation-free, proven plot by plot", template: "%s · Plotline" },
  description:
    "Plotline helps EU importers and their suppliers prove every shipment of cocoa, coffee, soy, palm oil, cattle, rubber and wood comes from land not deforested after 2020, and file the due diligence statement. Aligned with EUDR (Regulation (EU) 2023/1115).",
  applicationName: "Plotline",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ece7db" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1014" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-paper font-serif text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:border focus:border-ink focus:bg-sheet focus:px-3 focus:py-2 focus:label-caps focus:shadow-pop"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
