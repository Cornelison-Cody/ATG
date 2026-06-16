import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATG Codex Chat",
  description: "Local Codex chat interface for Azure Tides Gaming",
  icons: {
    icon: "/icon.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
