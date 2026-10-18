import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

// Placeholder fonts; swap once the client confirms the main store font.
const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const heading = Playfair_Display({ variable: "--font-heading", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Naomi Katz Art – Payment Portal",
  description: "Buy Naomi Katz Art by bank transfer.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
