import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "髒話收銀機｜職場霸凌蒐證管理工具",
  description: "錄音、照片、對帳與本機備份整合的職場霸凌蒐證工具。所有資料預設只保存在使用者裝置。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
