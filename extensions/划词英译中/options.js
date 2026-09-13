/* =========================================================
 * 划词翻译 · 英译中助手 — options 设置页逻辑
 * ========================================================= */
(() => {
  "use strict";

  const DEFAULT_SETTINGS = {
    engine: "auto",
    direction: "auto",
    baiduAppId: "",
    baiduSecretKey: "",
    openaiBaseUrl: "https://api.openai.com/v1",
    openaiApiKey: "",
    openaiModel: "gpt-4o-mini"
  };

  const $ = (id) => document.getElementById(id);

  async function load() {
    const data = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const s = { ...DEFAULT_SETTINGS, ...data };

    document.querySelectorAll('input[name="engine"]').forEach((r) => {
      r.checked = (r.value === s.engine);
    });
    $("direction").value = s.direction;
    $("baiduAppId").value = s.baiduAppId || "";
    $("baiduSecretKey").value = s.baiduSecretKey || "";
    $("openaiBaseUrl").value = s.openaiBaseUrl || "";
    $("openaiApiKey").value = s.openaiApiKey || "";
    $("openaiModel").value = s.openaiModel || "";

    updatePanelVisibility();
  }

  function updatePanelVisibility() {
    const engine = document.querySelector('input[name="engine"]:checked')?.value || "auto";
    $("baiduPanel").style.opacity = engine === "baidu" ? "1" : "0.45";
    $("openaiPanel").style.opacity = engine === "openai" ? "1" : "0.45";
  }

  function collect() {
    return {
      engine: document.querySelector('input[name="engine"]:checked')?.value || "auto",
      direction: $("direction").value,
      baiduAppId: $("baiduAppId").value.trim(),
      baiduSecretKey: $("baiduSecretKey").value.trim(),
      openaiBaseUrl: $("openaiBaseUrl").value.trim() || "https://api.openai.com/v1",
      openaiApiKey: $("openaiApiKey").value.trim(),
      openaiModel: $("openaiModel").value.trim() || "gpt-4o-mini"
    };
  }

  async function save() {
    const s = collect();
    await chrome.storage.sync.set(s);
    const el = $("saveStatus");
    el.textContent = "✓ 已保存";
    el.style.color = "#3f9d63";
    setTimeout(() => { el.textContent = ""; }, 2000);
  }

  async function test() {
    const s = collect();
    const text = $("testInput").value.trim();
    const status = $("status");
    const result = $("testResult");
    status.textContent = "翻译中…";
    status.className = "";
    result.style.display = "none";

    const resp = await chrome.runtime.sendMessage({
      type: "wbt-translate",
      text: text || "Machine learning is a branch of artificial intelligence.",
      settings: {
        engine: s.engine,
        targetLang: s.direction === "zh2en" ? "en" : "zh-CN",
        autoDetect: s.direction === "auto",
        baiduAppId: s.baiduAppId,
        baiduSecretKey: s.baiduSecretKey,
        openaiBaseUrl: s.openaiBaseUrl,
        openaiApiKey: s.openaiApiKey,
        openaiModel: s.openaiModel
      }
    });

    if (resp && resp.ok) {
      status.textContent = "✓ 成功";
      status.className = "ok";
      result.style.display = "block";
      result.textContent = resp.translated;
    } else {
      status.textContent = "✕ 失败";
      status.className = "err";
      result.style.display = "block";
      result.textContent = (resp && resp.error) || "未知错误";
    }
  }

  document.querySelectorAll('input[name="engine"]').forEach((r) => {
    r.addEventListener("change", updatePanelVisibility);
  });
  $("saveBtn").addEventListener("click", save);
  $("testBtn").addEventListener("click", test);
  $("testInput").addEventListener("keydown", (e) => { if (e.key === "Enter") test(); });

  load();
})();
