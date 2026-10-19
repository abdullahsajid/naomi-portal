import type { Metadata } from "next";
import { Inter, Nixie_One } from "next/font/google";
import "./globals.css";

// Headings use the store's primary font (Nixie One, from the live Cosmos theme). Body stays Inter for now.
const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const heading = Nixie_One({ variable: "--font-heading", weight: "400", subsets: ["latin"] });

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
