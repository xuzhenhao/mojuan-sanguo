#!/usr/bin/env python3
"""#177 武将立绘 → WebP。用法：python3 scripts/build-portraits.py
源：docs/art/refs 下用户批准的 512×712 定稿竖裁（不再重裁）。
产物（不入库；已上传阿里云 OSS <baseUrl>/portraits/heroes/）：art/out/portraits/heroes/<slug>.webp（512×712）与 <slug>@s.webp（256×356，LANCZOS 缩小），WebP q82。
需要 Pillow（带 WebP 支持）。改定稿时只改下面的 SOURCES 表，然后重跑本脚本。"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REFS = ROOT / 'docs/art/refs'
OUT = ROOT / 'art/out/portraits/heroes'
QUALITY = 82
SIZE = (512, 712)
SMALL = (256, 356)
SOURCES = {
    'liubei': 'liubei-512x712.png',
    'caocao': 'caocao-512x712.png',
    'lvbu': 'lvbu-final-512.png',
    'guojia': 'guojia-512x712.png',
    'zhouyu': 'zhouyu-512x712.png',
    'luxun': 'luxun-512x712.png',
    'diaochan': 'diaochan-512x712.png',
    'zhaoyun': 'zhaoyun-512x712.png',  # Z2 定稿，不是 Z3 存档
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, src in SOURCES.items():
        im = Image.open(REFS / src)
        if im.size != SIZE:
            raise SystemExit(f'{src}: 尺寸 {im.size} ≠ {SIZE}')
        im = im.convert('RGB')
        im.save(OUT / f'{slug}.webp', 'WEBP', quality=QUALITY, method=6)
        im.resize(SMALL, Image.LANCZOS).save(OUT / f'{slug}@s.webp', 'WEBP', quality=QUALITY, method=6)
        print(f'{slug}: {(OUT / f"{slug}.webp").stat().st_size // 1024}KB / {(OUT / f"{slug}@s.webp").stat().st_size // 1024}KB')


if __name__ == '__main__':
    main()
