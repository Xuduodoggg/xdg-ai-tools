# -*- coding: utf-8 -*-
"""一键存档 · 图标生成（512 设计稿缩放）：靛蓝圆角底 + 白色文档 + 橙色存入箭头"""
import os
from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.abspath(__file__))
ICONS_DIR = os.path.join(BASE, "webext", "icons")
os.makedirs(ICONS_DIR, exist_ok=True)


def draw(size):
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def R(v):
        return int(v * s / 512)

    # 靛蓝圆角底
    d.rounded_rectangle([R(24), R(24), R(488), R(488)], radius=R(110), fill=(47, 59, 156, 255))
    # 白色文档
    d.rounded_rectangle([R(168), R(108), R(344), R(300)], radius=R(22), fill=(255, 255, 255, 255))
    # 右上折角
    d.polygon([(R(344), R(108)), (R(344), R(122)), (R(330), R(108))], fill=(203, 213, 238, 255))
    # 文档内文本线（靛蓝）
    for y in (160, 180, 200):
        d.rounded_rectangle([R(200), R(y), R(312), R(y + 6)], radius=R(3), fill=(75, 90, 160, 255))
    # 橙色箭头杆
    d.rounded_rectangle([R(244), R(320), R(268), R(382)], radius=R(12), fill=(245, 158, 11, 255))
    # 橙色箭头头部
    d.polygon([(R(256), R(424)), (R(214), R(366)), (R(298), R(366))], fill=(245, 158, 11, 255))
    return img


# 扩展用 PNG
for size in (16, 48, 128):
    draw(size).save(os.path.join(ICONS_DIR, "icon{}.png".format(size)))
    print("PNG {} ok".format(size))

# 桌面快捷方式用 ICO（多尺寸）
ico_path = os.path.join(BASE, "icon.ico")
draw(256).save(
    ico_path,
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print("ICO ok ->", ico_path)
