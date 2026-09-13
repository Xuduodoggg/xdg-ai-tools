# -*- coding: utf-8 -*-
"""生成扩展图标：蓝底圆角方块 + 白色"译"字 + 右上角 EN 角标"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(OUT, exist_ok=True)

SIZE = 256  # 高分辨率渲染再缩放

def load_font(paths, size):
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

# 中文字体（微软雅黑 / 黑体 / 宋体）
font_cn = load_font([
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
], 118)

# 英文角标字体
font_en = load_font([
    r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\arial.ttf",
], 44)

def draw_icon():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 圆角矩形背景（蓝色渐变：手工做垂直渐变）
    radius = 52
    for y in range(SIZE):
        t = y / SIZE
        r = int(27 + (66 - 27) * t)
        g = int(108 + (153 - 108) * t)
        b = int(176 + (225 - 176) * t)
        d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=(r, g, b, 255))
        # 逐行重画会覆盖圆角外区域，最后用遮罩修正
    # 用蒙版重画一次确保圆角透明
    mask = Image.new("L", (SIZE, SIZE), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=255)
    grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(SIZE):
        t = y / SIZE
        r = int(27 + (66 - 27) * t)
        g = int(108 + (153 - 108) * t)
        b = int(176 + (225 - 176) * t)
        gd.line([(0, y), (SIZE, y)], fill=(r, g, b, 255))
    img = Image.composite(grad, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), mask)

    d = ImageDraw.Draw(img)

    # 底部高光条（增强质感）
    d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, outline=(255, 255, 255, 60), width=3)

    # 中央"译"字
    text = "译"
    bb = d.textbbox((0, 0), text, font=font_cn)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    tx = (SIZE - tw) / 2 - bb[0]
    ty = (SIZE - th) / 2 - bb[1] - 14
    d.text((tx, ty), text, font=font_cn, fill=(255, 255, 255, 255))

    # 右上角"EN"角标（深色小圆角块 + 白色文字）
    badge_x0, badge_y0, badge_x1, badge_y1 = 158, 22, 240, 74
    d.rounded_rectangle([badge_x0, badge_y0, badge_x1, badge_y1], radius=14, fill=(20, 40, 80, 220))
    bb = d.textbbox((0, 0), "EN", font=font_en)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.text((badge_x0 + (badge_x1 - badge_x0 - tw) / 2 - bb[0],
            badge_y0 + (badge_y1 - badge_y0 - th) / 2 - bb[1] - 2),
           "EN", font=font_en, fill=(255, 255, 255, 255))

    # 底部"中"字小角标
    badge_x0, badge_y0, badge_x1, badge_y1 = 20, 178, 74, 232
    d.rounded_rectangle([badge_x0, badge_y0, badge_x1, badge_y1], radius=14, fill=(255, 255, 255, 235))
    bb = d.textbbox((0, 0), "中", font=font_en)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.text((badge_x0 + (badge_x1 - badge_x0 - tw) / 2 - bb[0],
            badge_y0 + (badge_y1 - badge_y0 - th) / 2 - bb[1] - 3),
           "中", font=font_en, fill=(20, 40, 80, 255))

    return img

def main():
    master = draw_icon()
    for size in (16, 32, 48, 128):
        icon = master.resize((size, size), Image.LANCZOS)
        path = os.path.join(OUT, f"icon{size}.png")
        icon.save(path)
        print(f"saved {path}")

if __name__ == "__main__":
    main()
