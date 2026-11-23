import type { Metadata } from "next";
import { PRIVACY_MARKDOWN } from "../../generated-legal-content";
import { LegalPage } from "../../legal-content";

export const metadata: Metadata = {
  title: "隐私政策｜JudgeCall",
  alternates: {
    canonical: "/cn/privacy",
    languages: { "zh-CN": "/cn/privacy", en: "/en/privacy" },
  },
};

export default function ChinesePrivacyPage() {
  return <LegalPage markdown={PRIVACY_MARKDOWN} locale="cn" />;
}
