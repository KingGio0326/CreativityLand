import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import FloatingSidebar from "@/components/FloatingSidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TradingBot Dashboard",
  description: "AI-powered trading signals dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: "#07070f", margin: 0 }}
      >
        <FloatingSidebar />
        <main className="main-content">
          {children}
        </main>
      </body>
    </html>
  );
}
