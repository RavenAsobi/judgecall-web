(function () {
  "use strict";

  const content = window.JUDGECALL_CONTENT;
  if (!content) return;

  const createAvatar = (creator) => {
    if (creator.avatar) {
      const image = document.createElement("img");
      image.src = creator.avatar;
      image.alt = "";
      image.width = 112;
      image.height = 112;
      image.loading = "lazy";
      return image;
    }

    const placeholder = document.createElement("span");
    placeholder.className = "avatar-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.innerHTML = '<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="23" r="10"/><path d="M15 53c1.8-10.2 8.4-16 17-16s15.2 5.8 17 16"/></svg>';
    return placeholder;
  };

  const createCard = (creator) => {
    const article = document.createElement("article");
    article.className = "creator-card";

    const number = document.createElement("span");
    number.className = "creator-number";
    number.textContent = creator.id;

    const avatar = document.createElement("div");
    avatar.className = "creator-avatar";
    avatar.append(createAvatar(creator));

    const title = document.createElement("h3");
    title.textContent = creator.name;

    const description = document.createElement("p");
    description.className = "creator-description";
    description.textContent = creator.description;

    const footer = document.createElement("div");
    footer.className = "creator-card-footer";

    const tags = document.createElement("ul");
    tags.className = "tag-list";
    tags.setAttribute("aria-label", `${creator.name} 标签`);
    creator.tags.forEach((tag) => {
      const item = document.createElement("li");
      item.textContent = tag;
      tags.append(item);
    });

    const arrow = document.createElement(creator.url ? "a" : "span");
    arrow.className = "card-arrow";
    arrow.setAttribute("aria-hidden", creator.url ? "false" : "true");
    if (creator.url) {
      arrow.href = creator.url;
      arrow.target = "_blank";
      arrow.rel = "noreferrer";
      arrow.setAttribute("aria-label", `查看 ${creator.name}`);
    }
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';

    footer.append(tags, arrow);
    article.append(number, avatar, title, description, footer);
    return article;
  };

  const creatorGrid = document.querySelector("#creator-grid");
  if (creatorGrid) creatorGrid.append(...content.creators.map(createCard));

  const videos = Array.isArray(content.videos) ? content.videos : [];
  const videoFrame = document.querySelector("#video-frame");
  const videoStage = document.querySelector("#video-stage");
  const videoCover = document.querySelector("#video-cover");
  const videoOwner = document.querySelector("#video-owner");
  const videoTitle = document.querySelector("#video-title");
  const videoCounter = document.querySelector("#video-counter");
  const videoDots = document.querySelector("#video-dots");
  const videoProgress = document.querySelector("#video-progress-bar");
  const playButton = document.querySelector("#video-play");
  const previousButton = document.querySelector("#video-prev");
  const nextButton = document.querySelector("#video-next");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const ROTATION_INTERVAL = 5000;
  let activeVideo = 0;
  let carouselTimer = 0;

  const stopCarousel = () => {
    if (!carouselTimer) return;
    window.clearInterval(carouselTimer);
    carouselTimer = 0;
  };

  const removePlayer = () => {
    videoStage?.querySelector("iframe")?.remove();
    if (videoFrame) videoFrame.dataset.playing = "false";
  };

  const restartProgress = () => {
    if (!videoProgress) return;
    videoProgress.classList.remove("video-progress-active");
    if (reduceMotion.matches) return;
    void videoProgress.offsetWidth;
    videoProgress.classList.add("video-progress-active");
  };

  const renderCover = () => {
    if (!videos.length || !videoCover || !videoOwner || !videoTitle || !videoCounter) return;
    const video = videos[activeVideo];
    removePlayer();
    videoCover.src = video.cover;
    videoCover.alt = video.title;
    videoOwner.textContent = video.owner;
    videoTitle.textContent = video.title;
    videoCounter.textContent = `${String(activeVideo + 1).padStart(2, "0")} / ${String(videos.length).padStart(2, "0")}`;
    playButton?.setAttribute("aria-label", `播放：${video.title}`);
    videoDots?.querySelectorAll("button").forEach((dot, index) => {
      dot.setAttribute("aria-current", index === activeVideo ? "true" : "false");
    });
    restartProgress();
  };

  const startCarousel = () => {
    stopCarousel();
    if (videos.length < 2 || reduceMotion.matches || document.hidden || videoFrame?.dataset.playing === "true") return;
    carouselTimer = window.setInterval(() => {
      activeVideo = (activeVideo + 1) % videos.length;
      renderCover();
    }, ROTATION_INTERVAL);
  };

  const selectVideo = (index) => {
    if (!videos.length) return;
    activeVideo = (index + videos.length) % videos.length;
    renderCover();
    startCarousel();
  };

  if (videoDots) {
    videos.forEach((video, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `查看第 ${index + 1} 个视频：${video.title}`);
      dot.addEventListener("click", () => selectVideo(index));
      videoDots.append(dot);
    });
  }

  previousButton?.addEventListener("click", () => selectVideo(activeVideo - 1));
  nextButton?.addEventListener("click", () => selectVideo(activeVideo + 1));

  playButton?.addEventListener("click", () => {
    if (!videos.length || !videoStage || !videoFrame) return;
    stopCarousel();
    const video = videos[activeVideo];
    const iframe = document.createElement("iframe");
    const params = new URLSearchParams({
      bvid: video.bvid,
      page: "1",
      high_quality: "1",
      danmaku: "0",
      autoplay: "1",
    });
    iframe.src = `https://player.bilibili.com/player.html?${params.toString()}`;
    iframe.title = video.title;
    iframe.allow = "autoplay; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.loading = "eager";
    videoStage.append(iframe);
    videoFrame.dataset.playing = "true";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCarousel();
    else startCarousel();
  });
  window.addEventListener("pagehide", stopCarousel, { once: true });
  reduceMotion.addEventListener("change", () => {
    renderCover();
    startCarousel();
  });

  videos.slice(1).forEach((video) => {
    const image = new Image();
    image.src = video.cover;
  });
  renderCover();
  startCarousel();

})();
