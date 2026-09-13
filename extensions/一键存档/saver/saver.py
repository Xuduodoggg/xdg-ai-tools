# -*- coding: utf-8 -*-
"""
一键存档 · 本地存档工具（Windows）

职责：
  1. 提供本地 HTTP 服务（127.0.0.1:<port>），接收浏览器扩展发来的选中文字，
     校验 token 后追加写入 notes.md。
  2. 监听系统剪贴板：在其他软件（Word / PDF / 微信等）里复制的文字，
     自动过滤 + 去重后追加写入同一个 notes.md。
  3. 托盘菜单：打开笔记 / 打开配置 / 暂停与恢复剪贴板 / 退出。

用法：
  python saver.py               正常启动（含托盘）
  python saver.py --no-tray     无托盘启动（调试/测试用，Ctrl+C 退出）
  python saver.py --notes <路径> 临时指定笔记文件路径（覆盖配置）

依赖：pyperclip（剪贴板）、pystray + Pillow（托盘）。缺失时工具仍能运行，
只是剪贴板监听或托盘会被自动禁用并给出提示。
"""

import argparse
import hashlib
import json
import os
import re
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# 兼容两种运行方式：
#   源码运行: __file__ 指向 saver.py 所在目录
#   PyInstaller 打包(exe): 以 exe 所在目录为基准（config.json 放在 exe 旁边）
if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

# 默认配置：首次启动自动生成 config.json 时使用
DEFAULT_CONFIG = {
    "notes_path": os.path.join(BASE_DIR, "notes.md"),  # 笔记文件路径，可改为任意绝对路径
    "port": 8631,                                       # 本地服务端口
    "token": "",                                        # 留空则首次启动时自动生成
    "min_length": 15,                                   # 剪贴板文字短于此长度不入档
    "ignore_urls": True,                                # 忽略纯链接
    "ignore_pure_digits": True,                         # 忽略纯数字（验证码/金额误复制）
    "clipboard_enabled": True,                          # 剪贴板监听总开关
    "dedupe_window": 5,                                 # 去重窗口（秒），窗口内相同内容不重复写入
    "max_len": 8000,                                    # 单条记录最大字数，超出截断
    "ignore_browser_copy": True,                        # 复制时前台窗口是浏览器 → 不入档（网页复制只做普通复制）
    "browser_processes": "msedge.exe,chrome.exe,firefox.exe,brave.exe,opera.exe",  # 视为"浏览器"的进程名
}


# ---------------------------------------------------------------- 配置

def load_config(cli_notes=None):
    """读取配置；不存在则生成默认配置并自动生成 token。"""
    config = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                config.update(json.load(f))
        except Exception as e:
            print("[警告] config.json 读取失败，使用默认配置：{}".format(e))
    if not config.get("token"):
        config["token"] = "".join(
            secrets.choice("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
            for _ in range(16)
        )
        save_config(config)
    if cli_notes:
        config["notes_path"] = os.path.abspath(cli_notes)
    return config


def save_config(config):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("[警告] config.json 写入失败：{}".format(e))


# ---------------------------------------------------------------- 去重器

class Deduper:
    """记录最近写入内容的哈希与时间，窗口内重复的内容直接跳过。"""

    def __init__(self, window_seconds):
        self.window = window_seconds
        self._lock = threading.Lock()
        self._recent = {}  # hash -> 最后写入时间戳

    def is_duplicate(self, text):
        if not self.window:
            return False
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        now = time.time()
        with self._lock:
            last = self._recent.get(digest)
            if last is not None and now - last < self.window:
                return True
            self._recent[digest] = now
            # 清理 1 小时前的记录，避免内存无限增长
            for key in [k for k, v in self._recent.items() if now - v > 3600]:
                self._recent.pop(key, None)
        return False


# ---------------------------------------------------------------- 写入

class NoteWriter:
    """线程安全地向 notes.md 追加 Markdown 条目。"""

    def __init__(self, path):
        self.path = path
        self._lock = threading.Lock()
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

    def append(self, text, url=None, title=None, source="扩展"):
        text = (text or "").strip()
        if not text:
            return False
        if len(text) > self.max_len_hint():
            text = text[: self.max_len_hint()] + "\n…（已截断）"

        ts = time.strftime("%Y-%m-%d %H:%M")
        lines = []
        lines.append("")
        lines.append("---")
        lines.append("")
        lines.append("## {} ｜ {}".format(ts, (title or source).strip()))
        if url:
            lines.append("> 来源：<{}>".format(url.strip()))
        lines.append("")
        lines.append(text)
        lines.append("")

        with self._lock:
            try:
                with open(self.path, "a", encoding="utf-8") as f:
                    f.write("\n".join(lines))
                return True
            except Exception as e:
                print("[错误] 写入笔记失败：{}".format(e))
                return False

    def max_len_hint(self):
        return int(self._max_len) if hasattr(self, "_max_len") else 8000


# ---------------------------------------------------------------- 前台窗口检测

def foreground_process_name():
    """返回当前前台窗口所属进程名（小写，不含扩展名；失败返回空串）。
    用于区分"这次复制发生在浏览器还是其他软件"。"""
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return ""
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if not pid.value:
            return ""
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        h = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
        if not h:
            return ""
        try:
            buf = ctypes.create_unicode_buffer(1024)
            size = wintypes.DWORD(1024)
            if kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
                return os.path.basename(buf.value).lower()
        finally:
            kernel32.CloseHandle(h)
    except Exception:
        pass
    return ""


# ---------------------------------------------------------------- 剪贴板监听

class ClipboardMonitor(threading.Thread):
    """轮询系统剪贴板，发现新文字且通过过滤后自动入档。
    若复制时前台窗口是浏览器（ignore_browser_copy），则跳过不入档，
    网页里的 Ctrl+C 只保留普通复制粘贴功能。"""

    def __init__(self, config, writer, deduper, get_paused):
        super().__init__(daemon=True)
        self.config = config
        self.writer = writer
        self.deduper = deduper
        self.get_paused = get_paused
        self._last_text = None
        self._stop = threading.Event()
        self._browsers = {
            b.strip().lower()
            for b in str(config.get("browser_processes", "msedge.exe,chrome.exe,firefox.exe,brave.exe,opera.exe")).split(",")
            if b.strip()
        }

    def run(self):
        try:
            import pyperclip
        except ImportError:
            print("[提示] 未安装 pyperclip，剪贴板监听已禁用（pip install pyperclip 可启用）")
            return
        mode = "浏览器复制将跳过，其余软件自动入档" if self.config.get("ignore_browser_copy", True) else "所有软件复制都自动入档"
        print("[剪贴板] 监听已开启：{}".format(mode))
        while not self._stop.is_set():
            try:
                text = pyperclip.paste()
            except Exception:
                text = None
            if not text or not isinstance(text, str) or text == self._last_text:
                time.sleep(0.5)
                continue
            self._last_text = text  # 任何剪贴板变化都记录，避免重复处理
            if self.get_paused():
                continue
            if not self._filter(text):
                continue
            if self._is_browser_copy():
                print("[跳过] 浏览器中的复制（仅普通复制粘贴）")
                continue
            if self.deduper.is_duplicate(text):
                continue
            self.writer.append(text, url=None, title="剪贴板", source="剪贴板")
            print("[已存档] 剪贴板（{} 字）".format(len(text)))
            time.sleep(0.5)

    def _is_browser_copy(self):
        if not self.config.get("ignore_browser_copy", True):
            return False
        return foreground_process_name() in self._browsers

    def _filter(self, text):
        """智能过滤：过短、纯链接、纯数字等内容不入档。"""
        t = text.strip()
        if len(t) < int(self.config.get("min_length", 15)):
            return False
        if self.config.get("ignore_urls") and re.fullmatch(r"https?://\S+", t):
            return False
        if self.config.get("ignore_pure_digits") and re.fullmatch(r"\d{4,}", t):
            return False
        return True

    def stop(self):
        self._stop.set()


# ---------------------------------------------------------------- HTTP 服务

class SaveHandler(BaseHTTPRequestHandler):
    config = None
    writer = None
    deduper = None

    def log_message(self, *args):
        pass  # 关闭默认访问日志，保持控制台干净

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # 供 Chrome/Edge 的 Private Network Access 预检通过
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            body = json.dumps({"ok": True, "service": "web-note-saver"}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors_headers()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if urlparse(self.path).path != "/save":
            self.send_response(404)
            self.end_headers()
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._reply(400, {"ok": False, "error": "无效的请求体"})
            return

        if payload.get("token") != self.config.get("token"):
            self._reply(403, {"ok": False, "error": "token 校验失败"})
            return

        text = payload.get("text", "")
        if not text or not text.strip():
            self._reply(400, {"ok": False, "error": "内容为空"})
            return

        if self.deduper.is_duplicate(text):
            self._reply(200, {"ok": True, "duplicated": True})
            return

        ok = self.writer.append(
            text,
            url=payload.get("url"),
            title=payload.get("title"),
            source="扩展",
        )
        self._reply(200 if ok else 500, {"ok": ok})

    def _reply(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors_headers()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_http_server(config, writer, deduper):
    handler = SaveHandler
    handler.config = config
    handler.writer = writer
    handler.deduper = deduper
    server = ThreadingHTTPServer(("127.0.0.1", int(config.get("port", 8631))), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


# ---------------------------------------------------------------- 托盘

def start_tray(config, writer, get_paused, set_paused):
    try:
        import pystray
        from PIL import Image, ImageDraw
    except ImportError:
        print("[提示] 未安装 pystray/Pillow，托盘菜单不可用（pip install pystray pillow 可启用）")
        print("[提示] 如需退出工具：请直接关闭本窗口或按 Ctrl+C")
        return None

    def open_notes():
        os.startfile(writer.path)  # noqa: S606  -- Windows 专用

    def open_config():
        os.startfile(CONFIG_PATH)

    def toggle_paused(icon, item):
        set_paused(not get_paused())
        icon.update_menu()

    def quit_app(icon, item):
        icon.stop()
        os._exit(0)

    def make_image():
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([4, 4, 60, 60], radius=14, fill=(24, 95, 165, 255))
        d.rectangle([20, 12, 34, 34], fill=(255, 255, 255, 255))       # 文档
        d.polygon([(27, 40), (27, 52), (20, 52), (27, 60), (34, 52), (27, 52)], fill=(255, 255, 255, 255))  # 下箭头
        return img

    menu = pystray.Menu(
        pystray.MenuItem("打开笔记", open_notes, default=True),
        pystray.MenuItem("打开配置", open_config),
        pystray.MenuItem(lambda item: "暂停剪贴板" if not get_paused() else "恢复剪贴板", toggle_paused),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("退出", quit_app),
    )
    icon = pystray.Icon("web-note-saver", make_image(), "一键存档", menu)
    icon.run_detached()
    return icon


# ---------------------------------------------------------------- 主流程

def main():
    parser = argparse.ArgumentParser(description="一键存档 · 本地存档工具")
    parser.add_argument("--no-tray", action="store_true", help="无托盘启动（调试用）")
    parser.add_argument("--notes", default=None, help="临时指定笔记文件路径")
    args = parser.parse_args()

    config = load_config(cli_notes=args.notes)

    print("=" * 48)
    print("  一键存档 · 本地存档工具")
    print("=" * 48)
    print("  笔记文件 : {}".format(config["notes_path"]))
    print("  服务地址 : http://127.0.0.1:{}".format(config["port"]))
    print("  访问令牌 : {}".format(config["token"]))
    print("  ---- 令牌请填写到浏览器扩展的选项页 ----")
    print("=" * 48)

    writer = NoteWriter(config["notes_path"])
    writer._max_len = int(config.get("max_len", 8000))
    deduper = Deduper(int(config.get("dedupe_window", 5)))

    state = {"paused": False}
    get_paused = lambda: state["paused"]            # noqa: E731
    set_paused = lambda v: state.update(paused=v)   # noqa: E731

    server = start_http_server(config, writer, deduper)
    print("[服务] HTTP 服务已启动（Ctrl+C 退出）")

    monitor = None
    if config.get("clipboard_enabled"):
        monitor = ClipboardMonitor(config, writer, deduper, get_paused)
        monitor.start()

    if args.no_tray:
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            print("\n[退出] 再见")
    else:
        start_tray(config, writer, get_paused, set_paused)
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass
        finally:
            os._exit(0)


if __name__ == "__main__":
    main()
