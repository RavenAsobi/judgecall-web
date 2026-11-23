import type { Metadata } from "next";
import { TERMS_MARKDOWN } from "../../generated-legal-content";
import { LegalPage } from "../../legal-content";

export const metadata: Metadata = {
  title: "服务条款｜JudgeCall",
  alternates: {
    canonical: "/cn/terms",
    languages: { "zh-CN": "/cn/terms", en: "/en/terms" },
  },
};

export default function ChineseTermsPage() {
  return <LegalPage markdown={TERMS_MARKDOWN} locale="cn" />;
}
