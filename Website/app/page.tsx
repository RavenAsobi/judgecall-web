"use client";

import { useEffect, useRef, useState } from "react";
import { COPYRIGHT_TEXT } from "./generated-legal-content";
import type { Locale } from "./i18n";

import { LanguageSwitcher } from "./language-switcher";
import { PublicSecurityFiling } from "./public-security-filing";
const LYNX_URL = "https://lynx.judgecall.net/";
const CONTENT_CREATOR_URL = "https://content.judgecall.net/";
const DOWNLOAD_URL = {
  cn: "https://download.judgecall.net/?lang=cn",
  en: "https://download.judgecall.net/?lang=en",
} as const;
const games = [
  { name: "Flesh and Blood", code: "FAB", logo: "/game-fab.png" },
  { name: "Magic: The Gathering", code: "MTG", logo: "/game-mtg.png" },
  { name: "Riftbound", code: "RFT", logo: "/game-rft.svg?v=1" },
  { name: "Disney Lorcana", code: "LOR", logo: "/game-lor.png" },
];
const manualPages = [
  { src: "/judgecall-manual-page-4.png", page: "04", alt: "JudgeCall Product Manual page 4 - Rule Reader" },
  { src: "/judgecall-manual-page-7.png", page: "07", alt: "JudgeCall Product Manual page 7 - Judging Record" },
  { src: "/judgecall-manual-page-8.png", page: "08", alt: "JudgeCall Product Manual page 8 - IBIS" },
] as const;
const DEFAULT_TIMER_NAME = "Launch Your Next Experience";
const fabFormats = [
  { name: "Classic Constructed", minutes: 55 },
  { name: "Living Legend", minutes: 55 },
  { name: "Silver Age", minutes: 35 },
  { name: "Limited", minutes: 35 },
  { name: "Others", minutes: 55 },
] as const;

type ScreenWakeLockSentinel = EventTarget & {
  readonly released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
  };
};

const homeCopy = {
  cn: {
    nav: [["Lynx", LYNX_URL], ["工具", "#tools"], ["游戏", "#games"], ["下载", DOWNLOAD_URL.cn], ["文章", "#articles"], ["关于我们", "#about"]],
    resources: ["完整规则", "赛事规则", "违规处理方针", "裁判认证"],
    articles: [
      { type: "裁判技巧", date: "2026.07.26", title: "一场顺畅赛事，从赛前沟通开始", excerpt: "把流程、职责与关键信息说在前面，让裁判团队和主办方从同一张地图出发。", number: "01" },
      { type: "社群发展", date: "2026.07.18", title: "如何建立更健康的本地裁判社群", excerpt: "从招募、培训到反馈机制，拆解一个裁判社群能够长期运转的基础结构。", number: "02" },
      { type: "网站更新", date: "2026.07.01", title: "裁判通 2026.07 更新日志", excerpt: "Lynx 赛事流程、计时工具与规则索引迎来一轮体验升级。", number: "03" },
    ],
    features: [
      { number: "01", title: "完全离线", body: "规则、方针、版本说明与勘误公告随时可查，不依赖网络、账号或云端服务。" },
      { number: "02", title: "IBIS 精准检索", body: "按规则编号、文档、短语或赛场用语搜索，从命中条目快速展开章节上下文。" },
      { number: "03", title: "场边工具", body: "集成呼叫计时、2D6 骰子与生命值记录，让常用动作保持一触即达。" },
      { number: "04", title: "裁判记录", body: "在本地记录事件、裁决与复盘笔记，形成可检索、可导出的个人经验档案。" },
    ],
    shots: [
      { src: "/lynx-live-board.png", label: "桌位看板", alt: "Lynx 真实赛事桌位看板" },
      { src: "/lynx-live-events.png", label: "赛事列表", alt: "Lynx 真实赛事列表" },
      { src: "/lynx-live-create.png", label: "创建比赛", alt: "Lynx 真实创建比赛表单" },
    ],
  },
  en: {
    nav: [["Lynx", LYNX_URL], ["Tools", "#tools"], ["Games", "#games"], ["Download", DOWNLOAD_URL.en], ["Articles", "#articles"], ["About Us", "#about"]],
    resources: ["Comprehensive Rules", "Tournament Rules", "Infraction Policy", "Judge Certification"],
    articles: [
      { type: "JUDGING", date: "2026.07.26", title: "A Smooth Event Starts with Pre-Event Communication", excerpt: "Align the team on process, responsibilities, and critical information before the first round begins.", number: "01" },
      { type: "COMMUNITY", date: "2026.07.18", title: "Building a Healthier Local Judge Community", excerpt: "A practical look at recruitment, training, and feedback systems that help judge communities thrive.", number: "02" },
      { type: "SITE UPDATE", date: "2026.07.01", title: "JudgeCall July 2026 Update", excerpt: "A new round of improvements for Lynx event workflows, timing tools, and the rules index.", number: "03" },
    ],
    features: [
      { number: "01", title: "Fully Offline", body: "Rules, policies, release notes, and errata remain available without a connection, account, or cloud service." },
      { number: "02", title: "Precise IBIS Search", body: "Search by rule number, document, phrase, or table terminology, then open the full context around each match." },
      { number: "03", title: "Table-Side Tools", body: "Call timing, 2D6 dice, and life tracking keep common actions one tap away." },
      { number: "04", title: "Judging Records", body: "Keep incidents, rulings, and review notes locally in a searchable, exportable record of your experience." },
    ],
    shots: [
      { src: "/lynx-live-board.png", label: "Table Board", alt: "Lynx live event table board" },
      { src: "/lynx-live-events.png", label: "Event List", alt: "Lynx live event list" },
      { src: "/lynx-live-create.png", label: "Create Event", alt: "Lynx live event creation form" },
    ],
  },
} as const;

function Arrow({ direction = "right" }: { direction?: "right" | "down" }) {
  return <svg aria-hidden="true" className={`arrow arrow-${direction}`} viewBox="0 0 24 24" fill="none"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

function Brand({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const label = locale === "cn" ? "裁判通首页" : "JudgeCall home";
  return <a className={`brand ${compact ? "brand-compact" : ""}`} href={`/${locale}#top`} aria-label={label}><span className="brand-logo-crop"><img src="/judgecall-logo.png" alt={locale === "cn" ? "JudgeCall 裁判通" : "JudgeCall"} width="4096" height="4096" /></span></a>;
}

function LynxPreview({ locale }: { locale: Locale }) {
  const copy = homeCopy[locale];
  const [activeShot, setActiveShot] = useState(0);
  const shot = copy.shots[activeShot];

  return <div className="hero-product" aria-label={locale === "cn" ? "Lynx 真实产品界面预览" : "Live Lynx product preview"}>
    <div className="product-ear product-ear-left" /><div className="product-ear product-ear-right" />
    <div className="lynx-preview-topbar">
      <a className="lynx-preview-brand" href={LYNX_URL} aria-label={locale === "cn" ? "进入 Lynx" : "Open Lynx"}>
        <span className="lynx-logo-crop"><img src="/lynx-logo.png" alt="Lynx" width="1254" height="1254" /></span>
        <span><strong>Lynx</strong><small>{locale === "cn" ? "真实产品界面" : "LIVE PRODUCT INTERFACE"}</small></span>
      </a>
      <span className="lynx-preview-status"><i /> LYNX.JUDGECALL.NET</span>
    </div>
    <div className="lynx-shot-tabs" role="tablist" aria-label={locale === "cn" ? "切换 Lynx 页面截图" : "Switch Lynx interface preview"}>
      {copy.shots.map((item, index) => <button key={item.src} type="button" role="tab" aria-selected={activeShot === index} aria-controls="lynx-live-preview" onClick={() => setActiveShot(index)}>{item.label}</button>)}
    </div>
    <figure className="lynx-screenshot-stage" id="lynx-live-preview" role="tabpanel">
      <img key={shot.src} src={shot.src} alt={shot.alt} width="1274" height="838" fetchPriority={activeShot === 0 ? "high" : "auto"} />
      <figcaption>{locale === "cn" ? "来自 lynx.judgecall.net 的真实页面截图" : "Live interface captured from lynx.judgecall.net"}</figcaption>
    </figure>
  </div>;
}

function PreventOrphan({ children }: { children: string }) {
  const characters = Array.from(children);
  if (characters.length < 3) return children;
  return <>{characters.slice(0, -2).join("")}<span className="keep-together">{characters.slice(-2).join("")}</span></>;
}

function SectionHeading({ index, en, cn, summary }: { index: string; en: string; cn: string; summary: string }) {
  return <div className="section-heading"><span className="section-index">{index}</span><div><p className="section-en">{en}</p><h2><PreventOrphan>{cn}</PreventOrphan></h2><p className="section-summary">{summary}</p></div></div>;
}

function TournamentTimer({ locale }: { locale: Locale }) {
  const isEnglish = locale === "en";
  const [game, setGame] = useState<"fab" | "mtg">("fab");
  const [format, setFormat] = useState<(typeof fabFormats)[number]["name"]>("Classic Constructed");
  const [baseSeconds, setBaseSeconds] = useState(55 * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(55 * 60);
  const [running, setRunning] = useState(false);
  const [timerName, setTimerName] = useState(DEFAULT_TIMER_NAME);
  const [fullscreen, setFullscreen] = useState(false);
  const [wakeLockStatus, setWakeLockStatus] = useState<"idle" | "active" | "unavailable">("idle");
  const stageRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<ScreenWakeLockSentinel | null>(null);
  const wakeLockRequestRef = useRef<Promise<void> | null>(null);

  const releaseScreenWakeLock = async () => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch {
        // The browser may have already released the lock while leaving fullscreen.
      }
    }
    setWakeLockStatus("idle");
  };

  const requestScreenWakeLock = () => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock) {
      setWakeLockStatus("unavailable");
      return Promise.resolve();
    }
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      setWakeLockStatus("active");
      return Promise.resolve();
    }
    if (wakeLockRequestRef.current) return wakeLockRequestRef.current;

    const request = (async () => {
      try {
        const sentinel = await wakeLock.request("screen");
        if (document.fullscreenElement !== stageRef.current) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        setWakeLockStatus("active");
        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
            setWakeLockStatus("unavailable");
          }
        }, { once: true });
      } catch {
        setWakeLockStatus("unavailable");
      }
    })();

    wakeLockRequestRef.current = request;
    void request.finally(() => {
      if (wakeLockRequestRef.current === request) wakeLockRequestRef.current = null;
    });
    return request;
  };

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setRemainingSeconds((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    const handleFullscreen = () => {
      const active = document.fullscreenElement === stageRef.current;
      setFullscreen(active);
      if (active) void requestScreenWakeLock();
      else void releaseScreenWakeLock();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && document.fullscreenElement === stageRef.current) {
        void requestScreenWakeLock();
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreen);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreen);
      document.removeEventListener("visibilitychange", handleVisibility);
      void releaseScreenWakeLock();
    };
  }, []);

  const applyDuration = (minutes: number) => {
    const next = minutes * 60;
    setRunning(false);
    setBaseSeconds(next);
    setRemainingSeconds(next);
  };
  const selectGame = (nextGame: "fab" | "mtg") => {
    setGame(nextGame);
    if (nextGame === "mtg") applyDuration(50);
    else {
      setFormat("Classic Constructed");
      applyDuration(55);
    }
  };
  const selectFormat = (nextFormat: (typeof fabFormats)[number]) => {
    setFormat(nextFormat.name);
    applyDuration(nextFormat.minutes);
  };
  const setManualTime = (minutes: number, seconds: number) => {
    const safeMinutes = Math.max(0, Math.min(999, Number.isFinite(minutes) ? minutes : 0));
    const safeSeconds = Math.max(0, Math.min(59, Number.isFinite(seconds) ? seconds : 0));
    const next = safeMinutes * 60 + safeSeconds;
    setRunning(false);
    setBaseSeconds(next);
    setRemainingSeconds(next);
  };
  const resetTimer = () => {
    setRunning(false);
    setRemainingSeconds(baseSeconds);
  };
  const toggleFullscreen = async () => {
    if (!stageRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      await stageRef.current.requestFullscreen();
      await requestScreenWakeLock();
    }
  };

  const overtime = remainingSeconds <= 0;
  const absoluteSeconds = Math.abs(remainingSeconds);
  const minutes = Math.floor(absoluteSeconds / 60).toString().padStart(2, "0");
  const seconds = (absoluteSeconds % 60).toString().padStart(2, "0");
  const manualMinutes = Math.floor(baseSeconds / 60);
  const manualSeconds = baseSeconds % 60;

  return <div className={`timer-stage ${overtime ? "timer-overtime" : ""}`} ref={stageRef} data-fullscreen={fullscreen ? "true" : "false"} data-wake-lock={wakeLockStatus}>
    <div className="timer-topline">
      <input className={timerName === DEFAULT_TIMER_NAME ? "timer-name timer-name-default" : "timer-name"} aria-label={isEnglish ? "Timer name" : "计时器名称"} value={timerName} onFocus={() => { if (timerName === DEFAULT_TIMER_NAME) setTimerName(""); }} onBlur={() => { if (!timerName.trim()) setTimerName(DEFAULT_TIMER_NAME); }} onChange={(event) => setTimerName(event.target.value)} />
      <button className="fullscreen-button" type="button" onClick={toggleFullscreen} aria-label={fullscreen ? (isEnglish ? "Exit fullscreen" : "退出全屏显示") : (isEnglish ? "Show timer fullscreen" : "全屏显示计时器")}><span aria-hidden="true">{fullscreen ? "↙" : "↗"}</span>{fullscreen ? (isEnglish ? "Exit Fullscreen" : "退出全屏") : (isEnglish ? "Fullscreen" : "全屏显示")}</button>
    </div>
    <div className="timer-presets">
      <div className="timer-level"><span>{isEnglish ? "Game" : "游戏"}</span><div className="timer-tabs" role="tablist" aria-label={isEnglish ? "Select game" : "选择游戏"}><button type="button" role="tab" aria-selected={game === "fab"} onClick={() => selectGame("fab")}>Flesh and Blood</button><button type="button" role="tab" aria-selected={game === "mtg"} onClick={() => selectGame("mtg")}>Magic: the Gathering</button></div></div>
      {game === "fab" ? <div className="timer-level"><span>{isEnglish ? "Format" : "赛制"}</span><div className="timer-tabs timer-format-tabs" role="tablist" aria-label={isEnglish ? "Select Flesh and Blood format" : "选择 Flesh and Blood 赛制"}>{fabFormats.map((item) => <button key={item.name} type="button" role="tab" aria-selected={format === item.name} onClick={() => selectFormat(item)}>{item.name}</button>)}</div></div> : <p className="timer-preset-note">{isEnglish ? "The default Magic: the Gathering round time is 50 minutes." : "Magic: the Gathering 默认回合时间为 50 分钟"}</p>}
    </div>
    <div className="timer-display">
      <p>{overtime ? (isEnglish ? "Overtime in progress" : "加时进行中") : (isEnglish ? "Time remaining in this round" : "当前回合剩余时间")}</p>
      <div className="time" aria-label={isEnglish ? `${overtime ? "Overtime" : "Remaining"} ${minutes} minutes ${seconds} seconds` : `${overtime ? "加时" : "剩余"}${minutes}分${seconds}秒`}><span className="time-prefix">{overtime ? "+" : ""}</span>{minutes}<span className="time-colon">:</span>{seconds}</div>
      <div className="manual-time" aria-label={isEnglish ? "Set timer manually" : "手动设置计时器"}><label><span>{isEnglish ? "Minutes" : "分钟"}</span><input type="number" min="0" max="999" inputMode="numeric" value={manualMinutes} onChange={(event) => setManualTime(Number(event.target.value), manualSeconds)} /></label><label><span>{isEnglish ? "Seconds" : "秒"}</span><input type="number" min="0" max="59" inputMode="numeric" value={manualSeconds} onChange={(event) => setManualTime(manualMinutes, Number(event.target.value))} /></label></div>
    </div>
    <div className="timer-controls"><button type="button" className="timer-primary" onClick={() => setRunning((value) => !value)}>{running ? <span className="pause-icon" /> : <span className="play-icon" />}{running ? (isEnglish ? "Pause" : "暂停") : (isEnglish ? "Start" : "开始")}</button><button type="button" onClick={resetTimer}><span className="reset-icon">↻</span>{isEnglish ? "Reset" : "重置"}</button></div>
  </div>;
}
export function HomePage({ locale }: { locale: Locale }) {
  const copy = homeCopy[locale];
  const isEnglish = locale === "en";
  const headerNav = [...copy.nav.slice(0, 4), [isEnglish ? "Content Creator" : "内容创作者", CONTENT_CREATOR_URL] as const, ...copy.nav.slice(4)];
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    document.documentElement.lang = isEnglish ? "en" : "zh-CN";
  }, [isEnglish]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 2600); return () => window.clearTimeout(timer); }, [notice]);
  const announce = (message: string) => setNotice(message);
  const handleHeaderNavigation = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    setMenuOpen(false);
    if (!href.startsWith("#")) return;
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    event.preventDefault();
    const top = Math.round(window.scrollY + target.getBoundingClientRect().top);
    window.scrollTo({ top, behavior: "auto" });
    window.history.pushState(null, "", href);
  };
  return <main id="top" data-scroll-fix="viewport-v2">
    <header className="site-header">
      <Brand locale={locale} />
      <div className="header-actions">
        <LanguageSwitcher locale={locale} />
        <button className="menu-button" aria-label={menuOpen ? (isEnglish ? "Close navigation" : "关闭导航") : (isEnglish ? "Open navigation" : "打开导航")} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><span /><span /></button>
      </div>
      <nav className={menuOpen ? "nav-open" : ""} aria-label={isEnglish ? "Primary navigation" : "主要导航"}>{headerNav.map(([label, href]) => <a key={label} href={href} onClick={(event) => handleHeaderNavigation(event, href)}>{label}</a>)}</nav>
    </header>

    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-copy"><h1 id="hero-title"><span className="hero-line">{isEnglish ? "Make every match" : "让每一场比赛，"}</span><br /><span className="hero-line">{isEnglish ? "clear for everyone." : "都被清晰地看见。"}</span></h1><p>{isEnglish ? "JudgeCall gives TCG judges, tournament organizers, and players dependable event tools and rules resources." : "裁判通为 TCG 裁判、赛事主办方与玩家提供可靠的赛事工具与规则资源。"}</p><div className="hero-actions"><a className="button button-primary" href={LYNX_URL}>{isEnglish ? "Open Lynx" : "进入 Lynx"} <Arrow /></a><a className="button button-secondary" href="#about">{isEnglish ? "About JudgeCall" : "了解裁判通"}</a></div></div>
      <LynxPreview locale={locale} />
      <div className="scroll-cue" aria-hidden="true"><span>SCROLL TO EXPLORE</span><Arrow direction="down" /></div>
    </section>

    <section className="lynx-section" id="lynx"><div className="section-wrap lynx-layout"><div><SectionHeading index="01" en="LYNX" cn={isEnglish ? "The Control Center Built for Tournaments" : "为赛事而生的管理中枢"} summary={isEnglish ? "From registration and pairings to table assignments and judge coordination, Lynx keeps organizers in control and judges focused on the match." : "从报名到对阵，从桌位到裁判协作，让主办方掌控全局，让裁判专注比赛本身。"} /><a className="text-link" href={LYNX_URL}>{isEnglish ? "Open Lynx Online" : "进入 Lynx 在线版"} <Arrow /></a></div><div className="feature-rail">{(isEnglish ? [["Rounds & Pairings", "Flexible formats with automatic pairings"], ["Table Management", "Live assignments, clear and controlled"], ["Judge Coordination", "Efficient calls and faster responses"], ["Event Oversight", "Every stage visible at a glance"]] : [["轮次与对阵", "灵活赛制，自动对阵"], ["桌位管理", "实时分配，清晰可控"], ["裁判协作", "呼叫处理，高效响应"], ["赛事掌控", "全程进度，一目了然"]]).map(([title, body], index) => <div key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></div>)}</div></div></section>

    <section className="tools-section" id="tools"><div className="section-wrap"><SectionHeading index="02" en="TOOLS" cn={isEnglish ? "A Timer Designed for Tournament Floors" : "为比赛现场而设计的计时器"} summary={isEnglish ? "Clear, dependable, and always within reach—built for TCG round timing and overtime management." : "清楚、稳定、触手可及。为 TCG 轮次计时与加时管理保留每一秒。"} /><TournamentTimer locale={locale} /></div></section>
    <section className="games-section" id="games"><div className="section-wrap"><SectionHeading index="03" en="GAMES" cn={isEnglish ? "Rules Are the Shared Language of Fair Play" : "规则，是每一场公平比赛的共同语言"} summary={isEnglish ? "Find comprehensive rules, tournament policies, and judge development paths for leading TCGs—all in one place." : "聚合主流 TCG 完整规则、赛事方针与裁判成长路径，快速抵达你需要的答案。"} /><div className="game-list">{games.map((game, index) => <article className="game-row" key={game.name}><div className="game-number">0{index + 1}</div><div className="game-title"><span className={`game-logo game-logo-${game.code.toLowerCase()}`}><img src={game.logo} alt="" aria-hidden="true" /></span><h3>{game.name}</h3></div><div className="resource-list">{copy.resources.map((resource) => <button key={resource} onClick={() => announce(isEnglish ? `${game.name} · ${resource} is being prepared` : `${game.name} · ${resource}正在整理中`)}>{resource}</button>)}</div><button className="row-arrow" aria-label={isEnglish ? `View ${game.name} rules` : `查看 ${game.name} 规则`} onClick={() => announce(isEnglish ? `The ${game.name} rules center is under construction` : `${game.name} 规则中心正在建设中`)}><Arrow /></button></article>)}</div></div></section>

    <section className="articles-section" id="articles"><div className="section-wrap"><SectionHeading index="04" en="ARTICLES" cn={isEnglish ? "Insight and Exchange" : "洞见与交流"} summary={isEnglish ? "Judge experience, community growth, and every step forward for JudgeCall." : "记录裁判经验、社群成长与裁判通的每一次前进。"} /><div className="article-list">{copy.articles.map((article) => <article key={article.title}><span className="article-number">{article.number}</span><div className="article-meta"><span>{article.type}</span><time>{article.date}</time></div><div><h3>{article.title}</h3><p>{article.excerpt}</p></div><button aria-label={isEnglish ? `Read ${article.title}` : `阅读 ${article.title}`} onClick={() => announce(isEnglish ? "The full article is coming soon" : "完整文章即将发布")}><Arrow /></button></article>)}</div></div></section>

    <section className="download-section" id="download">
      <div className="section-wrap judgecall-product">
        <div className="product-intro-copy">
          <SectionHeading index="05" en="JUDGECALL APP" cn={isEnglish ? "Rules at the Table. Decisions with Confidence." : "规则在桌边，判断更从容"} summary={isEnglish ? "An offline Android rules reference for Flesh and Blood judges, combining search, reading, table-side tools, and judging records in one dependable app." : "面向 Flesh and Blood 裁判打造的 Android 离线规则参考应用，把查找、阅读、场边工具与裁判记录放进同一个可靠入口。"} />
          <div className="product-meta"><span>VERSION 2.0.1</span><span>ANDROID 8.0+</span><span>FULLY OFFLINE</span></div>
          <a className="button button-primary product-download-link" href={DOWNLOAD_URL[locale]}>{isEnglish ? "Go to Downloads" : "前往下载页面"} <Arrow /></a>
        </div>
        <div className="product-app-showcase" aria-label={isEnglish ? "JudgeCall feature preview" : "JudgeCall 产品能力预览"}>
          <div className="product-app-bar"><div className="product-logo-crop"><img src="/judgecall-logo.png" alt="JudgeCall" width="4096" height="4096" /></div><span>FOR JUDGES, BY JUDGES</span></div>
          <div className="manual-preview-scroll" aria-label={isEnglish ? "JudgeCall Product Manual pages 4, 7, and 8" : "JudgeCall Product Manual 第 4、7、8 页"}>
            <div className="manual-preview-grid">{manualPages.map((page) => <figure key={page.page}><img src={page.src} alt={page.alt} width="1050" height="1867" loading="lazy" /><figcaption>PRODUCT MANUAL · {page.page}</figcaption></figure>)}</div>
          </div>
        </div>
        <div className="product-feature-grid">{copy.features.map((feature) => <article key={feature.number}><span>{feature.number}</span><h3>{feature.title}</h3><p>{feature.body}</p></article>)}</div>
      </div>
    </section>

    <section className="about-section" id="about"><div className="about-glow" aria-hidden="true" /><div className="section-wrap about-grid"><SectionHeading index="06" en="ABOUT US" cn={isEnglish ? "Making Professional Experience Easier to Share" : "让专业经验，更容易被传递"} summary={isEnglish ? "JudgeCall is an independent platform for TCG judges, tournament organizers, and players." : "JudgeCall / 裁判通是服务于 TCG 裁判、赛事主办方与玩家的独立平台。"} /><div className="about-copy"><p>{isEnglish ? "We believe clear tools, understandable rules, and long-term community building make every match more trustworthy. From event management and rules indexing to round timing and shared experience, JudgeCall aims to be a dependable partner in the growth of judges and their communities." : "我们相信，清晰的工具、易于理解的规则与长期的社群建设，能让每一场比赛更值得信赖。从赛事管理到规则索引，从现场计时到经验分享，裁判通希望成为裁判与社群长期成长的可靠伙伴。"}</p><div className="principles"><div><span>01</span><strong>{isEnglish ? "Dependable Tools" : "可靠的工具"}</strong></div><div><span>02</span><strong>{isEnglish ? "Understandable Rules" : "易理解的规则"}</strong></div><div><span>03</span><strong>{isEnglish ? "Long-Term Community Building" : "长期的社群建设"}</strong></div></div></div></div></section>

    <footer><div className="footer-main"><Brand locale={locale} compact /><nav aria-label={isEnglish ? "Footer navigation" : "页脚导航"}>{copy.nav.map(([label, href]) => <a key={label} href={href}>{label}</a>)}</nav></div><div className="footer-legal-links"><a href={`/${locale}/terms`}>{isEnglish ? "Terms of Service" : "服务条款"}</a><a href={`/${locale}/privacy`}>{isEnglish ? "Privacy Policy" : "隐私条款"}</a></div><div className="footer-copyright-notice">{COPYRIGHT_TEXT.trim().split(/\r?\n+/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div><div className="footer-bottom"><span>{isEnglish ? "© 2026 JUDGECALL" : "© 2026 JUDGECALL · 裁判通"}</span><PublicSecurityFiling /><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{isEnglish ? "ICP Filing 辽ICP备2026017181号" : "辽ICP备2026017181号"}</a><span>{isEnglish ? "Built for every match that matters" : "为每一场认真对待的比赛而做"}</span></div></footer>
    <div className={`toast ${notice ? "toast-visible" : ""}`} role="status">{notice}</div>
  </main>;
}

export default function RootRedirect() {
  useEffect(() => {
    window.location.replace("/cn");
  }, []);
  return <>
    <meta httpEquiv="refresh" content="0;url=/cn" />
    <script dangerouslySetInnerHTML={{ __html: 'window.location.replace("/cn");' }} />
  </>;
}
