import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 产品分析助手 · Amazon 商品洞察与口播文案",
  description: "粘贴一个 Amazon 商品链接，自动完成产品信息整理、深度产品分析、短视频口播文案和事实/合规质检。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
