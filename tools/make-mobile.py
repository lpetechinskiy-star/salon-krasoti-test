#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Пересобирает мобильные варианты кадров (суффикс -m).
Запускать после любой замены фотографии в assets/, иначе телефон
продолжит показывать старый снимок: он грузит именно файл с -m.

    python3 tools/make-mobile.py

Нужен Pillow:  pip install Pillow
"""
import os, sys
from PIL import Image, ImageFilter

A = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets')

# Ширина мобильного файла = 2 × самая широкая телефонная коробка (телефон до 430 CSS px).
# Третья плотность на фотографии не читается глазом, а весит вдвое; поэтому потолок — 2×.
#   ig   46vw  → 198 CSS → 396 → 420
#   ba   92vw, стейдж ≤560 → 396 → 792 → 800
#   story 92vw → 396 → 792 → 800
#   wk   clamp(168px,15.5vw,260px) → 168 CSS → 336 → 340
JOBS = [
    ('ig-1', 420), ('ig-2', 420), ('ig-3', 420),
    ('ig-4', 420), ('ig-5', 420), ('ig-6', 420),
    ('ba-before', 800), ('ba-after', 800),
    ('story-room', 800),
    ('wk-01', 340), ('wk-02', 340), ('wk-03', 340),
    ('wk-04', 340), ('wk-05', 340), ('wk-06', 340), ('wk-07', 340),
]
was = tot = 0
for name, w in JOBS:
    src = f'{A}/{name}.webp'
    if not os.path.exists(src):
        print(f'{name:12} пропущен: нет {src}'); continue
    im = Image.open(src).convert('RGB'); W, H = im.size
    h = round(w*H/W)
    sm = im.resize((w, h), Image.LANCZOS)
    # Lanczos после уменьшения слегка размывает край — возвращаем его слабым контуром.
    sm = sm.filter(ImageFilter.UnsharpMask(radius=1.0, percent=55, threshold=3))
    sm.save(f'{A}/{name}-m.webp', 'WEBP', quality=84, method=6)
    a, b = os.path.getsize(src), os.path.getsize(f'{A}/{name}-m.webp')
    was += a; tot += b
    print(f'{name:12} {W}×{H} {a//1024:4} КБ → {w}×{h} {b//1024:3} КБ')
print(f'\nсумма: {was//1024} КБ → {tot//1024} КБ  (экономия {100*(was-tot)//was}%)')
