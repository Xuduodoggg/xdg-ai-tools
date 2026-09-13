// 一键存档 · 后台脚本
// 职责：接收快捷键 / 点图标触发，取当前页选中文字，POST 给本地存档工具

const DEFAULT_HOST = "http://127.0.0.1:8631";

// ---------- 配置读取 ----------

async function getSettings() {
  const data = await chrome.storage.sync.get({
    token: "",
    host: DEFAULT_HOST,
  });
  return data;
}

// ---------- 通知与徽标 ----------

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: title,
    message: message || "",
  });
}

// 在扩展图标上显示结果标记（不依赖系统通知，必定可见）
function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color: color });
  chrome.action.setBadgeText({ text: text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3500);
}

// ---------- 保存主流程 ----------

async function saveSelection() {
  const settings = await getSettings();
  if (!settings.token) {
    flashBadge("配置", "#9CA3AF");
    notify("一键存档：未配置", "请右键扩展图标 → 选项，填入访问令牌");
    return;
  }

  // 取当前活动标签页
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  // chrome://、扩展商店等页面无法注入
  if (!/^https?:/.test(tab.url || "")) {
    flashBadge("✗", "#DC2626");
    notify("一键存档：此页面不支持", "浏览器内部页面无法获取选中文字");
    return;
  }

  // 通知内容脚本取选中文字
  let picked = null;
  try {
    picked = await chrome.tabs.sendMessage(tab.id, { type: "get-selection" });
  } catch (e) {
    // 页面刚加载或脚本未注入，尝试重新注入一次
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      picked = await chrome.tabs.sendMessage(tab.id, { type: "get-selection" });
    } catch (e2) {
      flashBadge("✗", "#DC2626");
      notify("一键存档：失败", "无法读取页面内容，请刷新页面后重试");
      return;
    }
  }

  const text = (picked && picked.text || "").trim();
  if (!text) {
    flashBadge("空", "#F59E0B");
    notify("一键存档：未选中文字", "请先在网页中选中要保存的文字，再按 Alt+S");
    return;
  }

  // 发给本地工具
  const url = (settings.host || DEFAULT_HOST).replace(/\/+$/, "") + "/save";
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: settings.token,
        text: text,
        url: picked.url || tab.url,
        title: picked.title || tab.title || "",
      }),
    });
    const data = await resp.json();
    if (data && data.ok) {
      flashBadge(data.duplicated ? "重" : "✓", data.duplicated ? "#9CA3AF" : "#16A34A");
      notify("一键存档：已保存", data.duplicated ? "内容与刚才重复，已跳过" : text.slice(0, 40) + "…");
    } else {
      flashBadge("✗", "#DC2626");
      notify("一键存档：被拒绝", (data && data.error) || "未知错误");
    }
  } catch (e) {
    flashBadge("✗", "#DC2626");
    notify("一键存档：连接失败", "本地存档工具未启动？请先双击桌面的一键存档.exe");
  }
}

// ---------- 事件绑定 ----------

chrome.commands.onCommand.addListener((command) => {
  if (command === "save-selection") saveSelection();
});

chrome.action.onClicked.addListener(() => {
  saveSelection();
});
