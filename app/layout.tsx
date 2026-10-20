import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { IDIOMA_POR_DEFECTO, t } from "@/lib/i18n";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["italic"],
});

export const metadata: Metadata = {
  title: "ADNweb",
  description: t("marca.descripcion"),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={IDIOMA_POR_DEFECTO}
      className={`${barlow.variable} ${barlowCondensed.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
