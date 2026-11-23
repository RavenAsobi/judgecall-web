import type { Metadata } from "next";
import { headers } from "next/headers";
import { Noto_Sans_SC } from "next/font/google";
import "./globals.tech.css";
import "./i18n.css";

const notoSansCjk = Noto_Sans_SC({ variable: "--font-noto-sans-cjk", subsets: ["latin"], weight: ["400", "700", "900"], display: "swap" });


export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  return {
    metadataBase: base,
    title: "裁判通 JudgeCall｜TCG 赛事工具与裁判资源",
    description: "裁判通为 TCG 裁判、赛事主办方与玩家提供 Lynx 赛事管理、在线计时器、游戏规则资源、文章与离线应用。",
    icons: { icon: "/jc.png", shortcut: "/jc.png", apple: "/jc.png" },
    openGraph: {
      title: "裁判通 JudgeCall｜让每一场比赛，都被清晰地看见",
      description: "面向 TCG 裁判、赛事主办方与玩家的赛事工具与规则资源平台。",
      type: "website",
      locale: "zh_CN",
      images: [{ url: "/og.png", width: 1536, height: 910, alt: "裁判通 JudgeCall 与 Lynx 赛事管理平台" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "裁判通 JudgeCall｜让每一场比赛，都被清晰地看见",
      description: "面向 TCG 裁判、赛事主办方与玩家的赛事工具与规则资源平台。",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={notoSansCjk.variable}>{children}</body></html>;
}
