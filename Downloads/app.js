(function () {
  const config = window.JUDGECALL_DOWNLOADS || {};
  const locale = window.JC_I18N && window.JC_I18N.locale === "en" ? "en" : "cn";
  const toast = document.querySelector(".toast");
  let toastTimer;

  function readPath(path) {
    return path.split(".").reduce((value, key) => value && value[key], config);
  }

  function showToast(message) {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("toast-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("toast-visible"), 2600);
  }

  function setCounter(key, value) {
    const counter = document.querySelector(`[data-count="${key}"]`);
    if (!counter) return;
    const count = Number(value) || 0;
    counter.dataset.value = String(count);
    const formatted = count.toLocaleString(locale === "cn" ? "zh-CN" : "en-US");
    counter.textContent = locale === "cn" ? `${formatted} 次下载` : `${formatted} ${count === 1 ? "download" : "downloads"}`;
  }

  document.querySelectorAll("[data-copy]").forEach((element) => {
    const value = readPath(element.dataset.copy);
    if (value) element.textContent = typeof value === "object" ? value[locale] : value;
  });

  document.querySelectorAll("[data-download]").forEach((link) => {
    const url = readPath(link.dataset.download);
    if (url) {
      link.href = url;
      link.addEventListener("click", () => {
        const key = link.dataset.countKey;
        const counter = key && document.querySelector(`[data-count="${key}"]`);
        if (!counter || counter.dataset.value === undefined) return;
        setCounter(key, Number(counter.dataset.value) + 1);
      });
      return;
    }

    link.addEventListener("click", (event) => {
      event.preventDefault();
      showToast(locale === "cn" ? "安装包尚未提供。" : "The installer is not available yet.");
    });
  });

  if (config.countsUrl) {
    fetch(config.countsUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Count API returned ${response.status}`);
        return response.json();
      })
      .then((counts) => {
        setCounter("judgecallApp", counts.judgecallApp);
        setCounter("ratheDict", counts.ratheDict);
        setCounter("streamingTome", counts.streamingTome);
        setCounter("lynxExtension", counts.lynxExtension);
      })
      .catch(() => {});
  }

  const year = document.querySelector("#year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
