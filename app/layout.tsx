import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter_Tight } from "next/font/google";
import "./globals.css";

const sans = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Groundtruth — grounded document Q&A",
  description:
    "A retrieval-augmented assistant for operational documents: hybrid retrieval, sentence-level citations, contradiction detection and an explicit refusal path.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
