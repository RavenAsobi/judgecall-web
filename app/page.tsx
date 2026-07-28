"use client";

import { useEffect, useState } from "react";

const LYNX_URL = "https://lynx.judgecall.net/";
const navItems = [["Lynx", LYNX_URL], ["Tools", "#tools"], ["Games", "#games"], ["Download", "#download"], ["Articles", "#articles"], ["About Us", "#about"]] as const;
const games = [
  { name: "Flesh and Blood", code: "FAB", accent: "#e7b85c" },
  { name: "Magic: The Gathering", code: "MTG", accent: "#fb835f" },
  { name: "Riftbound", code: "RFT", accent: "#8f9cff" },
  { name: "Disney Lorcana", code: "LOR", accent: "#6fd7ff" },
];
const resources = ["完整规则", "赛事规则", "违规处理方针", "裁判认证"];
const articles = [
  { type: "裁判技巧", date: "2026.07.26", title: "一场顺畅赛事，从赛前沟通开始", excerpt: "把流程、职责与关键信息说在前面，让裁判团队和主办方从同一张地图出发。", number: "01" },
  { type: "社群发展", date: "2026.07.18", title: "如何建立更健康的本地裁判社群", excerpt: "从招募、培训到反馈机制，拆解一个裁判社群能够长期运转的基础结构。", number: "02" },
  { type: "网站更新", date: "2026.07.01", title: "裁判通 2026.07 更新日志", excerpt: "Lynx 赛事流程、计时工具与规则索引迎来一轮体验升级。", number: "03" },
];
const downloads = [
  { name: "Lynx Desktop", note: "完整赛事管理套件", platform: "Windows · macOS" },
  { name: "JudgeCall Timer", note: "离线比赛计时器", platform: "Windows · macOS" },
  { name: "Policy Reader", note: "规则与方针速查", platform: "Windows · Android" },
];

function Arrow({ direction = "right" }: { direction?: "right" | "down" }) {
  return <svg aria-hidden="true" className={`arrow arrow-${direction}`} viewBox="0 0 24 24" fill="none"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <a className={`brand ${compact ? "brand-compact" : ""}`} href="#top" aria-label="裁判通首页"><span className="brand-mark" aria-hidden="true"><span /><span /></span><span className="brand-name">JudgeCall</span><span className="brand-cn">裁判通</span></a>;
}

function SectionHeading({ index, en, cn, summary }: { index: string; en: string; cn: string; summary: string }) {
  return <div className="section-heading"><span className="section-index">{index}</span><div><p className="section-en">{en}</p><h2>{cn}</h2><p className="section-summary">{summary}</p></div></div>;
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [seconds, setSeconds] = useState(38 * 60 + 24);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!running || seconds === 0) return;
    const timer = window.setInterval(() => setSeconds((value) => { if (value <= 1) { setRunning(false); return 0; } return value - 1; }), 1000);
    return () => window.clearInterval(timer);
  }, [running, seconds]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 2600); return () => window.clearTimeout(timer); }, [notice]);

  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  const resetTimer = () => { setRunning(false); setSeconds(50 * 60); };
  const announce = (message: string) => setNotice(message);

  return <main id="top">
    <header className="site-header">
      <Brand />
      <button className="menu-button" aria-label="打开导航" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><span /><span /></button>
      <nav className={menuOpen ? "nav-open" : ""} aria-label="主要导航">{navItems.map(([label, href]) => <a key={label} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}</nav>
    </header>

    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-copy"><h1 id="hero-title">让每一场比赛，<br /><span>都被清晰地看见。</span></h1><p>裁判通为 TCG 裁判、赛事主办方与玩家提供可靠的赛事工具与规则资源。</p><div className="hero-actions"><a className="button button-primary" href={LYNX_URL}>进入 Lynx <Arrow /></a><a className="button button-secondary" href="#about">了解裁判通</a></div></div>
      <div className="hero-product" aria-label="Lynx 赛事管理界面预览">
        <div className="product-ear product-ear-left" /><div className="product-ear product-ear-right" />
        <div className="product-topbar"><div className="mini-brand"><span className="mini-mark" />Lynx</div><span className="live-dot">赛事进行中</span></div>
        <div className="product-shell"><aside>{["赛事概览", "轮次与对阵", "桌位管理", "裁判呼叫", "公告"].map((item, index) => <span className={index === 0 ? "active" : ""} key={item}><i />{item}</span>)}</aside><div className="dashboard">
          <div className="dash-head"><div><small>星辰杯 TCG 公开赛</small><strong>瑞士轮 · 第 4 轮 / 共 9 轮</strong></div><span>进行中</span></div>
          <div className="dash-metrics"><div><span>轮次进度</span><strong>44%</strong><i><b /></i></div><div><span>裁判呼叫</span><strong className="gold">03</strong><small>待处理</small></div><div><span>已完成桌</span><strong>18</strong><small>共 32 桌</small></div></div>
          <div className="pairings"><div><span>桌号</span><span>当前对阵</span><span>状态</span></div><div><b>12</b><span>张天翼 vs 李昊然</span><em>进行中</em></div><div><b>13</b><span>王思远 vs 陈一航</span><em>已完成</em></div><div><b>15</b><span>赵晨曦 vs 孙景行</span><em>进行中</em></div></div>
        </div></div>
      </div>
      <div className="scroll-cue" aria-hidden="true"><span>SCROLL TO EXPLORE</span><Arrow direction="down" /></div>
    </section>

    <section className="lynx-section" id="lynx"><div className="section-wrap lynx-layout"><div><SectionHeading index="01" en="LYNX" cn="为赛事而生的管理中枢" summary="从报名到对阵，从桌位到裁判协作，让主办方掌控全局，让裁判专注比赛本身。" /><a className="text-link" href={LYNX_URL}>进入 Lynx 在线版 <Arrow /></a></div><div className="feature-rail">{[["轮次与对阵", "灵活赛制，自动对阵"], ["桌位管理", "实时分配，清晰可控"], ["裁判协作", "呼叫处理，高效响应"], ["赛事掌控", "全程进度，一目了然"]].map(([title, body], index) => <div key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></div>)}</div></div></section>

    <section className="tools-section" id="tools"><div className="section-wrap"><SectionHeading index="02" en="TOOLS" cn="为比赛现场而设计的计时器" summary="清楚、稳定、触手可及。为 TCG 轮次计时与加时管理保留每一秒。" /><div className="timer-stage">
      <div className="timer-display"><p>当前回合剩余时间</p><div className="time" aria-live="polite">{minutes}<span>:</span>{secs}</div><span>回合预设 <b>50</b> 分钟</span></div>
      <div className="timer-controls"><button onClick={() => setRunning(true)} disabled={running || seconds === 0}><span className="play-icon" /> 开始</button><button onClick={() => setRunning(false)} disabled={!running}><span className="pause-icon" /> 暂停</button><button onClick={resetTimer}><span className="reset-icon">↻</span> 重置</button></div>
      <div className="overtime"><div><strong>加时表</strong><span>每次 +5 分钟</span></div>{[1, 2, 3, 4, "5+"].map((value) => <button key={value} onClick={() => { setSeconds((current) => current + 5 * 60); announce(`已添加第 ${value} 次加时：5 分钟`); }}><span>{value}</span><b>+05:00</b></button>)}</div>
    </div></div></section>

    <section className="games-section" id="games"><div className="section-wrap"><SectionHeading index="03" en="GAMES" cn="规则，是每一场公平比赛的共同语言" summary="聚合主流 TCG 完整规则、赛事方针与裁判成长路径，快速抵达你需要的答案。" /><div className="game-list">{games.map((game, index) => <article className="game-row" key={game.name}><div className="game-number">0{index + 1}</div><div className="game-title"><span style={{ "--game-accent": game.accent } as React.CSSProperties}>{game.code}</span><h3>{game.name}</h3></div><div className="resource-list">{resources.map((resource) => <button key={resource} onClick={() => announce(`${game.name} · ${resource}正在整理中`)}>{resource}</button>)}</div><button className="row-arrow" aria-label={`查看 ${game.name} 规则`} onClick={() => announce(`${game.name} 规则中心正在建设中`)}><Arrow /></button></article>)}</div></div></section>

    <section className="articles-section" id="articles"><div className="section-wrap"><SectionHeading index="04" en="ARTICLES" cn="洞见与交流" summary="记录裁判经验、社群成长与裁判通的每一次前进。" /><div className="article-list">{articles.map((article) => <article key={article.title}><span className="article-number">{article.number}</span><div className="article-meta"><span>{article.type}</span><time>{article.date}</time></div><div><h3>{article.title}</h3><p>{article.excerpt}</p></div><button aria-label={`阅读 ${article.title}`} onClick={() => announce("完整文章即将发布")}><Arrow /></button></article>)}</div></div></section>

    <section className="download-section" id="download"><div className="section-wrap download-grid"><SectionHeading index="05" en="DOWNLOAD" cn="把可靠工具带到赛场" summary="自主开发的离线应用，在网络不稳定的现场依然保持顺畅。" /><div className="download-list">{downloads.map((app, index) => <article key={app.name}><span className="app-icon">0{index + 1}</span><div><h3>{app.name}</h3><p>{app.note}</p></div><span className="platform">{app.platform}</span><button onClick={() => announce(`${app.name} 下载通道即将开放`)}>获取应用 <Arrow direction="down" /></button></article>)}</div></div></section>

    <section className="about-section" id="about"><div className="about-glow" aria-hidden="true" /><div className="section-wrap about-grid"><SectionHeading index="06" en="ABOUT US" cn="让专业经验，更容易被传递" summary="JudgeCall / 裁判通是服务于 TCG 裁判、赛事主办方与玩家的独立平台。" /><div className="about-copy"><p>我们相信，清晰的工具、易于理解的规则与长期的社群建设，能让每一场比赛更值得信赖。从赛事管理到规则索引，从现场计时到经验分享，裁判通希望成为裁判与社群长期成长的可靠伙伴。</p><div className="principles"><div><span>01</span><strong>可靠的工具</strong></div><div><span>02</span><strong>易理解的规则</strong></div><div><span>03</span><strong>长期的社群建设</strong></div></div></div></div></section>

    <footer><div className="footer-main"><Brand compact /><nav aria-label="页脚导航">{navItems.map(([label, href]) => <a key={label} href={href}>{label}</a>)}</nav></div><div className="footer-bottom"><span>© 2026 JUDGECALL · 裁判通</span><span>为每一场认真对待的比赛而做</span></div></footer>
    <div className={`toast ${notice ? "toast-visible" : ""}`} role="status">{notice}</div>
  </main>;
}
