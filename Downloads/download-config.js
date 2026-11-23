/*
 * 所有产品信息与真实下载入口集中维护在这里。
 * 产品文案、版本信息与真实下载入口集中维护在此对象中。
 */
window.JUDGECALL_DOWNLOADS = {
  countsUrl: "/api/counts",
  judgecallApp: {
    description: {
      cn: "JudgeCall Android 客户端，安装包版本 v2.2。",
      en: "JudgeCall for Android, version v2.2.",
    },
    meta: {
      cn: "Android · APK · v2.2 · 约 21.1 MB",
      en: "Android · APK · v2.2 · Approx. 21.1 MB",
    },
    direct: "/download/judgecall",
  },
  lynxExtension: {
    description: {
      cn: "从 GEM、Melee 和 EventLink 提取配对与赛果；v1.0.1 加入玩家 ID 核对，并配合 Lynx 网页自动累计胜负场次与积分。",
      en: "Extract pairings and results from GEM, Melee, and EventLink. v1.0.1 adds player ID review and works with Lynx's automatic round records and points.",
    },
    meta: {
      cn: "Chrome 扩展 · ZIP 压缩包 · v1.0.1 · 约 62 KB",
      en: "Chrome extension · ZIP archive · v1.0.1 · Approx. 62 KB",
    },
    direct: "/download/lynx-extension",
  },
  ratheDict: {
    description: {
      cn: "Flesh and Blood 离线卡牌词典与清单工具。v3.0.3 支持按需下载系列图包、在线更新卡牌与释疑，并收录 IAR Release Note。",
      en: "An offline card dictionary and list tool for Flesh and Blood. v3.0.3 adds optional set image packs, downloadable card and ruling updates, and IAR Release Notes.",
    },
    meta: {
      cn: "Android 8.0+ · APK · v3.0.3 · 约 23.9 MB · 不含卡牌图包",
      en: "Android 8.0+ · APK · v3.0.3 · Approx. 23.9 MB · Card image packs separate",
    },
    direct: "/download/rathe-dict",
  },
  streamingTome: {
    description: {
      cn: "面向 Flesh and Blood 赛事直播的本地比赛控制、直播叠加与卡牌查询工具，版本 v1.2 beta。",
      en: "A local match-control, broadcast-overlay, and card-reference tool for Flesh and Blood streams, version v1.2 beta.",
    },
    meta: {
      cn: "Windows 10 / 11 · EXE · v1.2 beta · 约 449.5 MB",
      en: "Windows 10 / 11 · EXE · v1.2 beta · Approx. 449.5 MB",
    },
    direct: "/download/streaming-tome",
  },
};
