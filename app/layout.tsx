import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "明亮视频生成工具",
  description: "AI视频和图片生成工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
