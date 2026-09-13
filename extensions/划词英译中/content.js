/* =========================================================
 * 划词翻译 · 英译中助手 — content script
 * 选中文字 → 悬浮"译"按钮 → 翻译 → 结果卡
 * ========================================================= */
(() => {
  "use strict";

  if (window.__wbtInjected) return;
  window.__wbtInjected = true;

  const BTN_ID = "wbt-btn";
  const CARD_ID = "wbt-card";

  let btnEl = null;   // "译"按钮
  let cardEl = null;  // 结果卡
  let currentSelection = null;

  /* ---------------- 工具 ---------------- */

  function rectOfSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return null;
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return rect;
  }

  function getSelectedText() {
    const sel = window.getSelection();
    return sel ? sel.toString().trim() : "";
  }

  function isValidSelection(text) {
    if (!text || text.length > 5000) return false;
    // 至少要包含字母/数字，排除纯空白或纯标点
    return /[A-Za-z0-9]/.test(text);
  }

  /* ---------------- UI 构建 ---------------- */

  function ensureBtn() {
    if (btnEl) return btnEl;
    btnEl = document.createElement("div");
    btnEl.id = BTN_ID;
    btnEl.title = "翻译为中文（Alt+T）";
    btnEl.innerHTML =
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 5h7"/><path d="M9 3v2"/><path d="M5.5 9a6.5 6.5 0 0 0 6.5 6.5"/><path d="M12 15.5c1.5 0 3-1.8 3-4V9"/><path d="M15.5 5l-3 4"/>' +
      '<path d="M14 12h6"/><path d="M17 9.5V15"/></svg>' +
      '<span>译</span>';
    document.body.appendChild(btnEl);
    btnEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onTranslateClick();
    });
    return btnEl;
  }

  function ensureCard() {
    if (cardEl) return cardEl;
    cardEl = document.createElement("div");
    cardEl.id = CARD_ID;
    cardEl.style.display = "none";
    document.body.appendChild(cardEl);
    return cardEl;
  }

  function showCard(original, translated, rect) {
    const card = ensureCard();
    const btnRect = btnEl ? btnEl.getBoundingClientRect() : rect;

    card.innerHTML =
      '<div class="wbt-head">' +
        '<span class="wbt-title">翻译结果</span>' +
        '<button class="wbt-close" title="关闭(Esc)">✕</button>' +
      '</div>' +
      '<div class="wbt-orig"></div>' +
      '<div class="wbt-divider"></div>' +
      '<div class="wbt-trans"></div>' +
      '<div class="wbt-actions">' +
        '<button data-act="copy" title="复制译文">复制译文</button>' +
        '<button data-act="replace" title="用译文替换网页原文">替换原文</button>' +
        '<button data-act="speak" title="朗读译文">朗读</button>' +
      '</div>';

    card.querySelector(".wbt-orig").textContent = original;
    card.querySelector(".wbt-trans").textContent = translated;

    card.querySelector(".wbt-close").addEventListener("click", () => hideCard());
    card.querySelector('[data-act="copy"]').addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(translated);
        flashAction(card.querySelector('[data-act="copy"]'), "已复制 ✓");
      } catch (e) {
        fallbackCopy(translated);
        flashAction(card.querySelector('[data-act="copy"]'), "已复制 ✓");
      }
    });
    card.querySelector('[data-act="replace"]').addEventListener("click", () => {
      replaceSelectionWith(translated);
      hideCard();
    });
    card.querySelector('[data-act="speak"]').addEventListener("click", () => {
      speak(translated);
      flashAction(card.querySelector('[data-act="speak"]'), "播放中…");
    });

    card.style.display = "block";
    // 定位：按钮下方；靠近视口底部时上移
    const cardW = Math.min(420, window.innerWidth - 24);
    card.style.width = cardW + "px";
    const cardH = card.offsetHeight;
    const top = (btnRect.bottom + 8 + cardH > window.innerHeight - 8)
      ? Math.max(8, btnRect.top - cardH - 8)
      : btnRect.bottom + 8;
    const left = Math.min(Math.max(8, btnRect.left), window.innerWidth - cardW - 8);
    card.style.left = left + "px";
    card.style.top = top + "px";
    card.style.animation = "none";
    void card.offsetWidth; // reflow 后重启动画
    card.style.animation = "";
  }

  function flashAction(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    btn.classList.add("wbt-done");
    setTimeout(() => {
      btn.textContent = old;
      btn.classList.remove("wbt-done");
    }, 1200);
  }

  function hideCard() {
    if (cardEl) cardEl.style.display = "none";
  }

  function hideBtn() {
    if (btnEl) btnEl.style.display = "none";
    btnEl = null;
  }

  /* ---------------- 替换原文 ---------------- */

  function replaceSelectionWith(translated) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(translated);
    range.insertNode(node);
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(node);
    sel.addRange(newRange);
  }

  /* ---------------- 朗读 ---------------- */

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    // 根据译文是否含中文选择语言
    const zh = /[\u4e00-\u9fa5]/.test(text);
    u.lang = zh ? "zh-CN" : "en-US";
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }

  /* ---------------- 翻译流程 ---------------- */

  async function doTranslate(text, anchorRect) {
    if (!text || !isValidSelection(text)) return;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "wbt-translate", text });
      if (!resp) throw new Error("扩展后台无响应，请刷新页面重试");
      if (!resp.ok) throw new Error(resp.error);
      showCard(text, resp.translated, anchorRect);
    } catch (err) {
      // 传入点击时的位置，避免选区已消失时错误提示无处显示
      showError(text, err.message, anchorRect);
    }
  }

  function showError(original, message, anchorRect) {
    const card = ensureCard();
    const rect = anchorRect || rectOfSelection() || (btnEl ? btnEl.getBoundingClientRect() : null);
    if (!rect) return;
    card.innerHTML =
      '<div class="wbt-head">' +
        '<span class="wbt-title">翻译失败</span>' +
        '<button class="wbt-close" title="关闭">✕</button>' +
      '</div>' +
      '<div class="wbt-err"></div>' +
      '<div class="wbt-err-hint">可到扩展设置页配置百度翻译或 OpenAI 接口，国内访问更稳定。</div>';
    card.querySelector(".wbt-err").textContent = message;
    card.querySelector(".wbt-close").addEventListener("click", () => hideCard());

    card.style.display = "block";
    const cardW = Math.min(420, window.innerWidth - 24);
    card.style.width = cardW + "px";
    const cardH = card.offsetHeight;
    const top = (rect.bottom + 8 + cardH > window.innerHeight - 8)
      ? Math.max(8, rect.top - cardH - 8)
      : rect.bottom + 8;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - cardW - 8);
    card.style.left = left + "px";
    card.style.top = top + "px";
  }

  /* ---------------- 事件：选中检测 ---------------- */

  function onMouseUp(e) {
    // 点击卡片/按钮内部时不重新触发
    if (e.target && (e.target.id === BTN_ID || e.target.closest("#" + CARD_ID))) return;
    hideBtn();

    // 延迟等待选区确定
    setTimeout(() => {
      const text = getSelectedText();
      if (!isValidSelection(text)) { currentSelection = null; return; }
      const rect = rectOfSelection();
      if (!rect) return;

      currentSelection = { text, rect };
      const btn = ensureBtn();
      btn.style.display = "flex";
      const btnW = 44;
      const top = rect.bottom + 6 > window.innerHeight - 40 ? rect.top - 34 : rect.bottom + 6;
      const left = Math.min(Math.max(4, rect.left + rect.width / 2 - btnW / 2), window.innerWidth - btnW - 4);
      btn.style.left = left + "px";
      btn.style.top = top + "px";
    }, 30);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { hideCard(); hideBtn(); return; }
    if (e.altKey && !e.shiftKey && !e.ctrlKey && (e.key === "T" || e.key === "t")) {
      e.preventDefault();
      e.stopPropagation();
      triggerSelectionTranslate();
    }
  }

  let lastTranslateAt = 0;
  function triggerSelectionTranslate() {
    // 快捷键有「浏览器命令 + 页面监听」两条通道，300ms 内防重
    const now = Date.now();
    if (now - lastTranslateAt < 300) return;
    lastTranslateAt = now;

    const text = getSelectedText();
    const rect = rectOfSelection();
    if (!isValidSelection(text)) {
      const card = ensureCard();
      card.style.display = "none";
      return;
    }
    hideBtn();
    doTranslate(text, rect);
  }

  /* ---------------- 点击"译"按钮 ---------------- */

  function onTranslateClick() {
    const text = currentSelection ? currentSelection.text : getSelectedText();
    const rect = currentSelection ? currentSelection.rect : rectOfSelection();
    hideBtn();
    doTranslate(text, rect);
  }

  /* ---------------- 全局监听 ---------------- */

  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("scroll", () => { hideBtn(); }, true);

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === "wbt-show-result") {
      const rect = rectOfSelection();
      showCard(msg.original, msg.translated, rect || { left: 40, top: 80, bottom: 120, width: 0 });
    } else if (msg.type === "wbt-show-error") {
      const rect = rectOfSelection();
      if (rect) showError(msg.original || "", msg.message);
      else {
        const card = ensureCard();
        card.style.display = "block";
        card.innerHTML =
          '<div class="wbt-head"><span class="wbt-title">翻译失败</span><button class="wbt-close">✕</button></div>' +
          '<div class="wbt-err"></div>';
        card.querySelector(".wbt-err").textContent = msg.message;
        card.querySelector(".wbt-close").addEventListener("click", () => hideCard());
        card.style.left = "16px";
        card.style.top = "16px";
        card.style.width = Math.min(420, window.innerWidth - 32) + "px";
      }
    } else if (msg.type === "wbt-translate-selection") {
      triggerSelectionTranslate();
    }
  });

  /* ---------------- 剪贴板兜底 ---------------- */

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;left:-9999px;";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    ta.remove();
  }
})();
