import type { Metadata } from "next";
import { LegalPage } from "../../legal-content";
import { PRIVACY_EN } from "../../privacy-en";

export const metadata: Metadata = {
  title: "Privacy Policy | JudgeCall",
  alternates: {
    canonical: "/en/privacy",
    languages: { "zh-CN": "/cn/privacy", en: "/en/privacy" },
  },
};

export default function EnglishPrivacyPage() {
  return <LegalPage markdown={PRIVACY_EN} locale="en" />;
}
