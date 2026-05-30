import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "집잡아 JipJaba — 부동산 상담 AI",
  description: "전세·월세·매물·계약·법률을 도와주는 집잡아 AI 상담사",
};

export const viewport: Viewport = {
  themeColor: "#3182F6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-surface text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
