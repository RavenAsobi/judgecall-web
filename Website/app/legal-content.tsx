import type { ReactNode } from "react";
import type { Locale } from "./i18n";
import { LanguageSwitcher } from "./language-switcher";
import { PublicSecurityFiling } from "./public-security-filing";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*.+?\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{renderInline(part.slice(2, -2), `${key}-strong`)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return <a key={key} href={link[2]}>{link[1]}</a>;
    return part;
  });
}

function MarkdownDocument({ markdown }: { markdown: string }) {
  const blocks: ReactNode[] = [];
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listStart = 1;
  let blockIndex = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    if (text) blocks.push(<p key={`p-${blockIndex}`}>{renderInline(text, `p-${blockIndex}`)}</p>);
    paragraph = [];
    blockIndex += 1;
  };
  const flushList = () => {
    if (!listType || !listItems.length) return;
    const items = listItems.map((item, index) => <li key={`${listType}-${blockIndex}-${index}`}>{renderInline(item, `${listType}-${blockIndex}-${index}`)}</li>);
    blocks.push(listType === "ol" ? <ol key={`ol-${blockIndex}`} start={listStart}>{items}</ol> : <ul key={`ul-${blockIndex}`}>{items}</ul>);
    listItems = [];
    listType = null;
    blockIndex += 1;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flushParagraph(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      const content = renderInline(heading[2], `h-${blockIndex}`);
      blocks.push(heading[1].length === 1 ? <h1 key={`h1-${blockIndex}`}>{content}</h1> : heading[1].length === 2 ? <h2 key={`h2-${blockIndex}`}>{content}</h2> : <h3 key={`h3-${blockIndex}`}>{content}</h3>);
      blockIndex += 1;
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^(\d+)\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = ordered ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      if (!listType && ordered) listStart = Number(ordered[1]);
      listType = nextType;
      listItems.push(ordered ? ordered[2] : unordered![1]);
      continue;
    }
    flushList();
    paragraph.push(line.replace(/\s{2,}$/, ""));
  }
  flushParagraph(); flushList();
  return <>{blocks}</>;
}

export function LegalPage({ markdown, locale }: { markdown: string; locale: Locale }) {
  const isEnglish = locale === "en";
  return <main className="legal-page">
    <header className="legal-header">
      <a className="brand" href={`/${locale}`} aria-label={isEnglish ? "Return to JudgeCall home" : "返回裁判通首页"}><span className="brand-logo-crop"><img src="/judgecall-logo.png" alt={isEnglish ? "JudgeCall" : "JudgeCall 裁判通"} width="4096" height="4096" /></span></a>
      <div className="legal-header-actions">
        <LanguageSwitcher locale={locale} />
        <a className="legal-back" href={`/${locale}`}>{isEnglish ? "Back to Home" : "返回首页"}</a>
      </div>
    </header>
    <article className="legal-document"><MarkdownDocument markdown={markdown} /></article>
    <footer className="legal-footer">
      <nav aria-label={isEnglish ? "Legal documents" : "法律文件"}><a href={`/${locale}/terms`}>{isEnglish ? "Terms of Service" : "服务条款"}</a><a href={`/${locale}/privacy`}>{isEnglish ? "Privacy Policy" : "隐私条款"}</a></nav>
      <div className="legal-filings">
        <PublicSecurityFiling />
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{isEnglish ? "ICP Filing 辽ICP备2026017181号" : "辽ICP备2026017181号"}</a>
      </div>
    </footer>
  </main>;
}