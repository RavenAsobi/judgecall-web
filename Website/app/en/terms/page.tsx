import type { Metadata } from "next";
import { LegalPage } from "../../legal-content";
import { TERMS_EN } from "../../terms-en";

export const metadata: Metadata = {
  title: "Terms of Service | JudgeCall",
  alternates: {
    canonical: "/en/terms",
    languages: { "zh-CN": "/cn/terms", en: "/en/terms" },
  },
};

export default function EnglishTermsPage() {
  return <LegalPage markdown={TERMS_EN} locale="en" />;
}
