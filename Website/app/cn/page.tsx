import type { Metadata } from "next";
import { HomePage } from "../page";

export const metadata: Metadata = {
  title: "裁判通 JudgeCall｜TCG 赛事工具与裁判资源",
  description: "面向 TCG 裁判、赛事主办方与玩家的 Lynx 赛事管理、在线计时、规则资源与离线工具。",
  alternates: {
    canonical: "/cn",
    languages: { "zh-CN": "/cn", en: "/en" },
  },
};

export default function ChineseHomePage() {
  return <HomePage locale="cn" />;
}
