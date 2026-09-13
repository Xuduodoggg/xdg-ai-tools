// 一键存档 · 内容脚本
// 职责：响应后台请求，返回当前页选中的文字、页面 URL 和标题

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "get-selection") {
    let text = "";
    try {
      const sel = window.getSelection();
      if (sel && sel.toString) text = sel.toString();
    } catch (e) {
      text = "";
    }
    sendResponse({
      text: (text || "").trim(),
      url: location.href,
      title: document.title || "",
    });
  }
  return true;
});
