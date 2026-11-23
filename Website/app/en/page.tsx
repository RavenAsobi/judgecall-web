import type { Metadata } from "next";
import { HomePage } from "../page";

export const metadata: Metadata = {
  title: "JudgeCall | TCG Tournament Tools and Judge Resources",
  description: "Lynx tournament management, round timing, rules resources, and offline tools for TCG judges, tournament organizers, and players.",
  alternates: {
    canonical: "/en",
    languages: { "zh-CN": "/cn", en: "/en" },
  },
};

export default function EnglishHomePage() {
  return <HomePage locale="en" />;
}
