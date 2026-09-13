/* =========================================================
 * 划词翻译 · 英译中助手 — background (Service Worker)
 * 翻译引擎：自动(MyMemory→Google) / 百度翻译 / OpenAI 兼容
 * ========================================================= */

const DEFAULT_SETTINGS = {
  engine: "auto",            // auto | baidu | openai
  targetLang: "zh-CN",       // 目标语言
  autoDetect: true,          // true: 自动检测源语言; false: 固定英文
  baiduAppId: "",
  baiduSecretKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini"
};

const MENU_ID = "wbt-translate-selection";

/* ---------------- 工具函数 ---------------- */

async function getSettings() {
  const data = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...data };
}

function detectTargetLang(settings, text) {
  // 自动检测：含较多中文则视为中译英，否则英译中
  const zhRatio = (text.match(/[\u4e00-\u9fa5]/g) || []).length / Math.max(text.length, 1);
  let src;
  if (settings.autoDetect) {
    src = zhRatio > 0.15 ? "zh-CN" : "en";
  } else {
    // 固定方向：目标为中文则源为英文，目标为英文则源为中文，避免相同语言报错
    src = settings.targetLang === "en" ? "zh-CN" : "en";
  }
  const target = src === "en" ? settings.targetLang || "zh-CN" : "en";
  return { src, target };
}

/* ---------------- MD5（百度签名用） ---------------- */

function md5(str) {
  const rotateLeft = (x, c) => (x << c) | (x >>> (32 - c));

  // UTF-8 字节
  const input = new TextEncoder().encode(String(str));
  const len = input.length;
  const blockCount = ((len + 8) >> 6) + 1;
  const buf = new Uint8Array(blockCount * 64);
  buf.set(input);
  buf[len] = 0x80;
  const bitLen = len * 8;
  // 低 4 字节写消息长度（小端）；高 4 字节为 0
  // 注意：不能用 bitLen >>> (i*8) 处理 i>=4，JS 位运算移位量会取模 32，导致高字节被错误写入
  for (let i = 0; i < 4; i++) {
    buf[blockCount * 64 - 8 + i] = (bitLen >>> (i * 8)) & 0xff;
  }

  const K = [];
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  }
  const SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let off = 0; off < buf.length; off += 64) {
    const M = new Array(16);
    for (let i = 0; i < 16; i++) {
      M[i] = buf[off + i * 4] | (buf[off + i * 4 + 1] << 8) | (buf[off + i * 4 + 2] << 16) | (buf[off + i * 4 + 3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;

    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + rotateLeft(F, SHIFTS[Math.floor(i / 16) * 4 + (i % 4)])) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }

  // MD5 输出为小端字节序（低字节在前），之前的实现漏了这一步导致签名错误
  const toHexLE = (n) => {
    let s = "";
    for (let i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
    return s;
  };
  return toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0);
}

/* ---------------- 各引擎翻译实现 ---------------- */

// MyMemory 偶尔会返回带格式标签的译文（如 <g id="1">…</g>），统一剥离
function cleanMyMemoryText(s) {
  return String(s || "").replace(/<[^>]*>/g, "").trim();
}

async function translateMyMemory(text, target) {
  // langpair 直接用检测结果：英文→中文 = "en|zh-CN"，中文→英文 = "zh-CN|en"
  const langpair = `${target.src}|${target.target}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error(`MyMemory HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.responseStatus !== 200) throw new Error(data.responseDetails || "MyMemory 翻译失败");
  return cleanMyMemoryText(data.responseData.translatedText);
}

async function translateGoogleFree(text, target) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${target.src}&tl=${target.target}&dt=t&q=${encodeURIComponent(text)}`;
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error(`Google HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data || !Array.isArray(data[0])) throw new Error("Google 翻译失败");
  return data[0].map((seg) => seg[0]).join("");
}

async function translateBaidu(text, target, settings) {
  if (!settings.baiduAppId || !settings.baiduSecretKey) {
    throw new Error("尚未配置百度翻译 AppID 和密钥，请到设置页填写");
  }
  // 百度翻译的语言代码是 zh（简体中文）/ cht（繁体），不是 zh-CN
  const toBaiduLang = (code) => (code === "zh-CN" ? "zh" : "en");
  const salt = Date.now() + Math.floor(Math.random() * 10000);
  const from = toBaiduLang(target.src);
  const to = toBaiduLang(target.target);
  const sign = md5(settings.baiduAppId + text + salt + settings.baiduSecretKey);
  const params = new URLSearchParams({
    q: text, from, to,
    appid: settings.baiduAppId,
    salt: String(salt),
    sign
  });
  const url = `https://fanyi-api.baidu.com/api/trans/vip/translate?${params.toString()}`;
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error(`百度翻译 HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.error_code) {
    if (data.error_code === "52001") throw new Error("百度翻译超时，请重试");
    if (data.error_code === "52003") throw new Error("百度翻译 AppID 无效或未授权（52003），请检查 AppID 是否复制正确");
    if (data.error_code === "54000") throw new Error("百度翻译必填参数为空（54000）");
    if (data.error_code === "54001") {
      // 附上调试信息：q/salt/sign 供用户在百度官方「签名生成工具」中对照验证
      throw new Error(
        "百度翻译签名错误（54001）。" +
        "请先用「百度开放平台控制台 → 签名生成工具」验证签名（工具中粘贴以下参数，注意 q 必须原样完整）：\n" +
        `q=${text}\nsalt=${salt}\nsign=${sign}\n` +
        "若工具算出相同 sign，说明 AppID 与密钥不匹配或密钥已失效，请重新复制；若不同，请反馈给我。"
      );
    }
    if (data.error_code === "54003") throw new Error("百度翻译频率超限，请稍后再试");
    if (data.error_code === "54004") throw new Error("百度翻译账户余额不足（54004），免费额度已用完");
    if (data.error_code === "58000") throw new Error("百度翻译 IP 校验失败（58000），请在开放平台关闭 IP 校验或添加本机 IP");
    if (data.error_code === "58001") throw new Error("百度翻译语言方向不支持（58001）");
    throw new Error(`百度翻译错误 ${data.error_code}: ${data.error_msg}`);
  }
  return (data.trans_result || []).map((r) => r.dst).join("");
}

async function translateOpenAI(text, target, settings) {
  if (!settings.openaiApiKey) {
    throw new Error("尚未配置 OpenAI 兼容 API Key，请到设置页填写");
  }
  const base = (settings.openaiBaseUrl || "").replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const systemPrompt =
    "You are a professional translator. Translate the user's text into " +
    (target.target === "zh-CN" ? "Simplified Chinese" : "English") +
    ". Output ONLY the translation, no explanations, no quotes, keep formatting like line breaks.";
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.openaiApiKey}`
    },
    body: JSON.stringify({
      model: settings.openaiModel || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ]
    })
  });
  if (!resp.ok) {
    let msg = `OpenAI 接口 HTTP ${resp.status}`;
    try {
      const err = await resp.json();
      msg += `: ${err.error?.message || JSON.stringify(err).slice(0, 200)}`;
    } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI 接口返回为空");
  return content.trim();
}

/* ---------------- 统一翻译入口（含分段） ---------------- */

async function translateText(text, settings) {
  const clean = (text || "").trim();
  if (!clean) throw new Error("没有可翻译的文字");
  if (clean.length > 20000) throw new Error("文字过长（超过 20000 字符），请分段翻译");

  const target = detectTargetLang(settings, clean);

  // 分段大小：百度标准版单次上限 1000 字符（高级版 6000），取 950 兼容所有版本；MyMemory 450；OpenAI 大模型不限
  let chunkSize = 5000;
  if (settings.engine === "baidu") chunkSize = 950;
  if (settings.engine === "auto") chunkSize = 450;

  const chunks = [];
  for (let i = 0; i < clean.length; i += chunkSize) {
    chunks.push(clean.slice(i, i + chunkSize));
  }

  const results = [];
  for (const chunk of chunks) {
    results.push(await translateChunk(chunk, target, settings));
  }
  return results.join("\n");
}

async function translateChunk(text, target, settings) {
  if (settings.engine === "baidu") return translateBaidu(text, target, settings);
  if (settings.engine === "openai") return translateOpenAI(text, target, settings);

  // auto：MyMemory 优先，失败则 Google 免费端点兜底
  try {
    return await translateMyMemory(text, target);
  } catch (errMy) {
    try {
      return await translateGoogleFree(text, target);
    } catch (errGg) {
      throw new Error(
        `免费翻译引擎均失败：MyMemory(${errMy.message})，Google(${errGg.message})。` +
        `建议在扩展设置页配置「百度翻译」（国内速度快）或「OpenAI 兼容」引擎。`
      );
    }
  }
}

/* ---------------- 右键菜单 ---------------- */

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "英译中 · 翻译选中文字",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  try {
    const settings = await getSettings();
    const translated = await translateText(info.selectionText, settings);
    // 优先让页面 content script 弹出结果卡
    if (tab && tab.id != null) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "wbt-show-result",
          original: info.selectionText,
          translated
        });
        return;
      } catch (e) {
        // 页面未注入 content script，退回系统通知
      }
    }
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "划词翻译结果",
      message: translated.slice(0, 200) + (translated.length > 200 ? "…" : "")
    });
  } catch (err) {
    if (tab && tab.id != null) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "wbt-show-error", message: err.message });
        return;
      } catch (e) { /* ignore */ }
    }
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "翻译失败",
      message: err.message
    });
  }
});

/* ---------------- 消息处理（content/popup 调用） ---------------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "wbt-translate") {
    (async () => {
      try {
        // 划词/快捷键不传 settings 时，读取用户保存的引擎配置（与右键菜单一致）
        // 否则会退回默认免费引擎，导致与右键行为不一致
        const settings = (msg.settings && Object.keys(msg.settings).length)
          ? msg.settings
          : await getSettings();
        const translated = await translateText(msg.text, settings);
        sendResponse({ ok: true, translated });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // 异步响应
  }
  return false;
});

/* ---------------- 快捷键命令 ---------------- */

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "translate-selection") return;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0] || tabs[0].id == null) return;
  try {
    await chrome.tabs.sendMessage(tabs[0].id, { type: "wbt-translate-selection" });
  } catch (e) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "划词翻译",
      message: "请先在页面上选中一段英文文字，再按快捷键 Alt+T"
    });
  }
});
