import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/lib/session/SessionProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NONNA — Zapatillas hechas a tu medida",
  description:
    "Analizamos tus necesidades y la forma de tus pies para crear una zapatilla diseñada pensando en tu comodidad.",
};

export const viewport: Viewport = {
  themeColor: "#0e4d45",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-[var(--color-bg)]">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
