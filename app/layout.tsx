import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soundprinter — client-side audio fingerprinting",
  description:
    "Landmark audio fingerprinting and reuse detection, entirely in your browser. No audio ever leaves your machine.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
