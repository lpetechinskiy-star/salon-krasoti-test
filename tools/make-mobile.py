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

# Ширина мобильного файла = 2 × коробка кадра на телефоне (замерено в браузере
# на 390 px). Третья плотность на фотографии глазом не читается, а весит вдвое.
# Выбирает файл загрузчик в js/main.js: он сравнивает эту ширину с запросом
# коробки, поэтому число должно совпадать с тем, что стоит в data-src-m.
#   ig          коробка 167 CSS → 360
#   wk          коробка 168 CSS → 360
#   ba / story / sig  коробка 350 CSS → 720
JOBS = [
    ('ig-1', 360), ('ig-2', 360), ('ig-3', 360),
    ('ig-4', 360), ('ig-5', 360), ('ig-6', 360),
    ('wk-01', 360), ('wk-02', 360), ('wk-03', 360), ('wk-04', 360),
    ('wk-05', 360), ('wk-06', 360), ('wk-07', 360),
    ('ba-before', 720), ('ba-after', 720),
    ('story-room', 720), ('sig-hair', 720),
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
