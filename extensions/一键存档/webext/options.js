// 一键存档 · 选项页脚本（独立文件，兼容 Manifest V3 CSP）
const $ = (id) => document.getElementById(id);

function showNotInExtension() {
  const card = document.querySelector(".card");
  if (!card) return;
  card.innerHTML =
    '<p style="color:#a32d2d;font-size:14px;line-height:1.9;">' +
    "此设置页必须以浏览器扩展的方式打开，按钮才会生效：<br>" +
    "1) 打开 edge://extensions（Chrome 用 chrome://extensions）<br>" +
    "2) 找到「一键存档」→ 点「详细信息」→「扩展选项」<br>" +
    "3) 或右键浏览器工具栏的扩展图标 →「选项」<br><br>" +
    "直接双击 options.html 文件打开是无效的（浏览器安全限制）。</p>";
}

if (!(window.chrome && chrome.storage && chrome.storage.sync)) {
  showNotInExtension();
} else {
  function updateTokenState(token) {
    const el = $("tokenState");
    if (!el) return;
    if (token) {
      el.textContent = "已保存令牌：***" + token.slice(-4) + "（保存设置后生效）";
      el.style.color = "#0f6e56";
    } else {
      el.textContent = "当前未保存令牌 —— 填入下方后点「保存设置」";
      el.style.color = "#a32d2d";
    }
  }

  chrome.storage.sync.get({ token: "", host: "http://127.0.0.1:8631" }, (data) => {
    $("token").value = data.token || "";
    $("host").value = data.host || "http://127.0.0.1:8631";
    updateTokenState(data.token || "");
  });

  function flash(msg, cls) {
    const s = $("status");
    s.textContent = msg;
    s.className = "status " + cls;
    clearTimeout(s._t);
    s._t = setTimeout(() => { s.textContent = ""; s.className = "status"; }, 4000);
  }

  $("save").addEventListener("click", () => {
    const btn = $("save");
    const token = $("token").value.trim();
    chrome.storage.sync.set({
      token: token,
      host: $("host").value.trim() || "http://127.0.0.1:8631",
    }, () => {
      flash("已保存", "ok");
      updateTokenState(token);
      const old = btn.textContent;
      btn.textContent = "已保存";
      setTimeout(() => { btn.textContent = old; }, 1500);
    });
  });

  $("test").addEventListener("click", async () => {
    const host = $("host").value.trim() || "http://127.0.0.1:8631";
    try {
      const resp = await fetch(host.replace(/\/+$/, "") + "/health");
      const data = await resp.json();
      flash(data.ok ? "连接成功，工具运行中" : "连接异常", data.ok ? "ok" : "err");
    } catch (e) {
      flash("连接失败：请确认 start.bat 已运行", "err");
    }
  });
}
