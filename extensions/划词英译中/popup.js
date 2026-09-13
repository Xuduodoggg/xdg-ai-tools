/* =========================================================
 * 划词翻译 · 英译中助手 — popup 弹窗逻辑
 * ========================================================= */
(() => {
  "use strict";

  const input = document.getElementById("input");
  const translateBtn = document.getElementById("translateBtn");
  const copyBtn = document.getElementById("copyBtn");
  const result = document.getElementById("result");
  const resultText = document.getElementById("resultText");
  const status = document.getElementById("status");
  const engineTag = document.getElementById("engineTag");

  const ENGINE_NAMES = {
    auto: "自动（免费）",
    baidu: "百度翻译",
    openai: "OpenAI 兼容"
  };

  async function translate() {
    const text = input.value.trim();
    if (!text) {
      setStatus("请先输入要翻译的文字", "err");
      return;
    }
    setStatus("翻译中…", "");
    translateBtn.disabled = true;

    const data = await chrome.storage.sync.get({
      engine: "auto",
      direction: "auto",
      baiduAppId: "",
      baiduSecretKey: "",
      openaiBaseUrl: "https://api.openai.com/v1",
      openaiApiKey: "",
      openaiModel: "gpt-4o-mini"
    });

    const resp = await chrome.runtime.sendMessage({
      type: "wbt-translate",
      text,
      settings: {
        engine: data.engine,
        targetLang: data.direction === "zh2en" ? "en" : "zh-CN",
        autoDetect: data.direction === "auto",
        baiduAppId: data.baiduAppId,
        baiduSecretKey: data.baiduSecretKey,
        openaiBaseUrl: data.openaiBaseUrl,
        openaiApiKey: data.openaiApiKey,
        openaiModel: data.openaiModel
      }
    });

    translateBtn.disabled = false;
    if (resp && resp.ok) {
      result.classList.add("show");
      resultText.textContent = resp.translated;
      setStatus("", "");
    } else {
      setStatus((resp && resp.error) || "翻译失败", "err");
    }
  }

  async function copy() {
    const text = resultText.textContent;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e2) { /* ignore */ }
      ta.remove();
    }
    setStatus("✓ 已复制到剪贴板", "ok");
  }

  function setStatus(msg, cls) {
    status.textContent = msg;
    status.className = cls || "";
  }

  async function init() {
    const data = await chrome.storage.sync.get({ engine: "auto" });
    engineTag.textContent = ENGINE_NAMES[data.engine] || ENGINE_NAMES.auto;
  }

  translateBtn.addEventListener("click", translate);
  copyBtn.addEventListener("click", copy);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) translate();
  });
  document.getElementById("openOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  init();
})();
