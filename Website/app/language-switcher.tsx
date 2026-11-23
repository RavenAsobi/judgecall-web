"use client";

import { useEffect } from "react";
import type { Locale } from "./i18n";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const targetLocale: Locale = locale === "cn" ? "en" : "cn";
  const targetHref = `/${targetLocale}`;

  useEffect(() => {
    document.documentElement.lang = locale === "cn" ? "zh-CN" : "en";
  }, [locale]);

  const preserveCurrentPage = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const nextPath = window.location.pathname.replace(/^\/(cn|en)(?=\/|$)/, `/${targetLocale}`);
    window.location.assign(`${nextPath}${window.location.search}${window.location.hash}`);
  };

  return (
    <div className="language-switcher" aria-label={locale === "cn" ? "语言切换" : "Language selector"}>
      <a
        href={targetHref}
        hrefLang={targetLocale === "cn" ? "zh-CN" : "en"}
        aria-label={locale === "cn" ? "Switch to English" : "切换至中文"}
        onClick={preserveCurrentPage}
      >
        <span className={locale === "cn" ? "language-active" : ""}>中文</span>
        <span aria-hidden="true">/</span>
        <span className={locale === "en" ? "language-active" : ""}>EN</span>
      </a>
    </div>
  );
}
