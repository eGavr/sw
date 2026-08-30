import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

import type { Metadata } from "next";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";

import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "sw dashboard",
  description: "Cloud of environments for W3C/WebDriver and Appium traffic",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
