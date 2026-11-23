(function () {
  const STORAGE_KEY = "judgecall-language";
  const supportedLocales = new Set(["cn", "en"]);
  const requestedLocale = new URLSearchParams(window.location.search).get("lang");
  let locale = supportedLocales.has(requestedLocale) ? requestedLocale : null;

  if (!locale) {
    try {
      const savedLocale = window.localStorage.getItem(STORAGE_KEY);
      if (supportedLocales.has(savedLocale)) locale = savedLocale;
    } catch (_) {}
  }

  if (!locale) {
    locale = (window.navigator.language || "").toLowerCase().startsWith("zh") ? "cn" : "en";
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch (_) {}

  function localizedHref(href) {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return href;
    url.searchParams.set("lang", locale);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function apply() {
    document.documentElement.lang = locale === "cn" ? "zh-CN" : "en";
    document.body.classList.toggle("locale-en", locale === "en");

    const title = locale === "cn" ? document.body.dataset.titleCn : document.body.dataset.titleEn;
    if (title) document.title = title;

    document.querySelectorAll("[data-cn][data-en]").forEach((element) => {
      element.textContent = element.dataset[locale];
    });
    document.querySelectorAll("[data-cn-aria][data-en-aria]").forEach((element) => {
      element.setAttribute("aria-label", element.dataset[`${locale}Aria`]);
    });
    document.querySelectorAll("[data-cn-alt][data-en-alt]").forEach((element) => {
      element.setAttribute("alt", element.dataset[`${locale}Alt`]);
    });
    document.querySelectorAll("[data-language-content]").forEach((element) => {
      element.hidden = element.dataset.languageContent !== locale;
    });
    document.querySelectorAll("[data-preserve-lang]").forEach((link) => {
      link.href = localizedHref(link.getAttribute("href"));
    });
    document.querySelectorAll("[data-index-lang]").forEach((link) => {
      link.href = `https://index.judgecall.net/${locale}`;
    });
    document.querySelectorAll("[data-lang-option]").forEach((link) => {
      const targetLocale = link.dataset.langOption;
      const url = new URL(window.location.href);
      url.searchParams.set("lang", targetLocale);
      link.href = `${url.pathname}${url.search}${url.hash}`;
      link.classList.toggle("language-active", targetLocale === locale);
      if (targetLocale === locale) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  window.JC_I18N = { locale, apply, localizedHref };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
})();
