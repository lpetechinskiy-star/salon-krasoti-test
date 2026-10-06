#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Пересобирает все фотографии сайта из исходников.

Размер выхода = 2 × самая широкая коробка, в которой кадр показывается
(замерено в браузере на 390/768/1024/1440/1920), но не больше 3,5× ширины
исходника: дальше растут байты, а не деталь.

Увеличение — обратным проецированием, см. tools/upscale.py.

    python3 tools/rebuild-photos.py

Нужны Pillow, numpy, scipy и папка с исходниками (SRC ниже).
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from upscale import upscale, texture, consistency, sharpness

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, 'assets')
SRC  = os.environ.get('ELANE_SRC',
       '/tmp/claude-0/-home-user-salon-krasoti-test/57abd6e4-c1cc-5880-84f2-05149ddde2a3/images')
UP   = os.environ.get('ELANE_UPLOAD',
       '/root/.claude/uploads/57abd6e4-c1cc-5880-84f2-05149ddde2a3/03f7a0a1-image.jpg')

# Кадры с зерном сохраняются при q84, не выше: зерно — это шум, он дорог
# в сжатии, а на глаз q84 и q90 на нём неразличимы (проверено сравнением
# в реальном масштабе экрана). Разница в весе — около 38%.
def save(im, name, q=92):
    p = f'{OUT}/{name}.webp'
    im.save(p, 'WEBP', quality=q, method=6)
    return f'{name:12} {im.size[0]}×{im.size[1]}  {os.path.getsize(p)//1024:4} КБ'

def have(p):
    if os.path.exists(p): return True
    print(f'  пропуск: нет исходника {p}'); return False

# ── Лента «Работы» ───────────────────────────────────────────────────
# Макет-лист: семь карточек по 154×427 px. Коробка на экране до 260 CSS.
def works():
    f = f'{SRC}/28.jpg'
    if not have(f): return
    im = Image.open(f).convert('RGB')
    COLS = [(37,191),(205,358),(372,527),(540,694),(707,861),(874,1028),(1041,1192)]
    Y0, Y1 = 173, 600          # ниже 600 на макет наложена плашка ÉLANE
    W = 520; H = round(W*(Y1-Y0)/154)
    for i,(x0,x1) in enumerate(COLS):
        c = im.crop((x0, Y0, x1, Y1))
        print('  ' + save(texture(upscale(c, W, H)), f'wk-{i+1:02d}', 84))

# ── Мастера ──────────────────────────────────────────────────────────
def masters():
    f = f'{SRC}/19.jpg'
    if not have(f): return
    im = Image.open(f).convert('RGB')
    CELLS = [(83,88,333,320),(376,88,619,320),(662,88,905,320),(949,88,1200,320),
             (198,467,448,685),(513,467,767,685),(833,467,1082,685)]
    JOBS = [('mst-vera',0,'3:2',0.55,0.0), ('mst-aglaya',1,'4:5',0.50,0.0),
            ('mst-nika',6,'4:5',0.50,0.0), ('mst-lev',2,'3:2',0.50,0.0),
            ('mst-taisia',4,'4:5',0.48,0.0), ('mst-julia',3,'4:5',0.52,0.0)]
    SIZE = {'4:5': (650, 812), '3:2': (900, 600)}
    for name, idx, ar, fx, dy in JOBS:
        c = im.crop(CELLS[idx]); W, H = c.size
        if ar == '4:5':
            w = min(round(H*0.8), W)
            x = round(min(max(fx*W - w/2, 0), W-w)); box = (x, 0, x+w, H)
        else:
            h = min(round(W/1.5), H)
            y = round(min(max(dy*H, 0), H-h)); box = (0, y, W, y+h)
        print('  ' + save(texture(upscale(c.crop(box), *SIZE[ar])), name, 84))

# ── Дина: отдельный снимок, тон подгоняется под остальные шесть ──────
def dina():
    if not have(UP): return
    ref = np.concatenate([np.asarray(Image.open(f'{OUT}/{n}.webp').convert('RGB'), float).reshape(-1,3)
                          for n in ('mst-vera','mst-lev','mst-aglaya','mst-nika','mst-taisia','mst-julia')], 0)
    m_t, s_t = ref.mean(0), ref.std(0)
    crop = Image.open(UP).convert('RGB').crop((185, 20, 745, 393))   # 560×373, те же 3:2
    a = np.asarray(crop, float)
    m_s, s_s = a.reshape(-1,3).mean(0), a.reshape(-1,3).std(0)
    out = (a - m_s) * (s_t/s_s) + m_t
    H, W, _ = out.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    ex = np.minimum(xx/(W*0.26), (W-1-xx)/(W*0.20))
    ey = np.minimum(yy/(H*0.22), (H-1-yy)/(H*0.26))
    v = np.clip(np.minimum(ex, ey), 0, 1); v = v*v*(3-2*v)
    out *= (0.70 + 0.30*v)[..., None]
    g = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    print('  ' + save(texture(upscale(g, 900, 600)), 'mst-dina', 84))

# ── Сетка публикаций ─────────────────────────────────────────────────
def trim_edges(im, thr=2.5):
    """Снять кайму скриншота: однородные линии по краям."""
    a = np.asarray(im.convert('RGB'), float); H, W, _ = a.shape
    l, r, t, b = 0, W, 0, H
    while l < W and a[:, l].std(0).mean() < thr: l += 1
    while r > l and a[:, r-1].std(0).mean() < thr: r -= 1
    while t < H and a[t, :].std(0).mean() < thr: t += 1
    while b > t and a[b-1, :].std(0).mean() < thr: b -= 1
    return im.crop((l, t, r, b))

def insta():
    JOBS = [('32.jpg','ig-1',0.8,False), ('33.jpg','ig-2',1.0,False),
            ('35.webp','ig-3',0.8,True), ('30.jpg','ig-4',0.8,False),
            ('31.jpg','ig-5',1.0,False), ('36.webp','ig-6',1.0,True)]
    TW = 980
    for src, name, ar, trim in JOBS:
        f = f'{SRC}/{src}'
        if not have(f): continue
        im = Image.open(f).convert('RGB')
        if trim: im = trim_edges(im)
        W, H = im.size
        if W/H > ar: w = round(H*ar); box = ((W-w)//2, 0, (W-w)//2+w, H)
        else:        h = round(W/ar); box = (0, (H-h)//2, W, (H-h)//2+h)
        print('  ' + save(texture(upscale(im.crop(box), TW, round(TW/ar))), name, 84))

# ── «Легенда»: зал ───────────────────────────────────────────────────
def story():
    f = f'{SRC}/26.jpg'
    if not have(f): return
    im = Image.open(f).convert('RGB'); W, H = im.size
    a = np.asarray(im, float)
    flat = [x for x in range(W) if a[:, x].std(0).mean() < 2.5]
    edge = min([x for x in flat if x > W*0.8], default=W)   # коричневая полоса справа
    w = round(H*5/7); x0 = max(0, min(120, edge - w))
    print('  ' + save(upscale(im.crop((x0, 0, x0+w, H)), 1200, 1680), 'story-room', 90))

# ── ГЛАДЬ: полотно волос ─────────────────────────────────────────────
def signature():
    from scipy.ndimage import uniform_filter, gaussian_filter
    f = f'{SRC}/7.jpg'
    if not have(f): return
    im = Image.open(f).convert('RGB').crop((0, 190, 714, 1082))
    W, H = im.size; rgb = np.asarray(im, float)
    ss = lambda t: (lambda u: u*u*(3-2*u))(np.clip(t, 0, 1))
    luma = 0.2126*rgb[...,0] + 0.7152*rgb[...,1] + 0.0722*rgb[...,2]
    hi = luma - gaussian_filter(luma, 2.2)
    energy = gaussian_filter(np.sqrt(uniform_filter(hi*hi, 11)), 6)
    lo, hq = np.percentile(energy, 12), np.percentile(energy, 72)
    hair = ss((energy - lo) / max(hq - lo, 1e-6))
    TARGET = np.array([42.0, 28.0, 21.0])
    bright = ss((luma - 70.0) / 95.0)
    k = (np.clip(0.58 + 0.34*bright, 0, 0.92) * ((1.0 - hair)**1.2))[..., None]
    graded = rgb*(1-k) + TARGET*k
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    ex = np.minimum(xx/(W*0.26), (W-1-xx)/(W*0.20))
    ey = np.minimum(yy/(H*0.16), (H-1-yy)/(H*0.18))
    graded *= (0.40 + 0.60*ss(np.minimum(ex, ey)))[..., None]
    g = Image.fromarray(np.clip(graded, 0, 255).astype(np.uint8))
    print('  ' + save(upscale(g, 1400, 1749), 'sig-hair', 84))

# ── Превью услуг ─────────────────────────────────────────────────────
def services():
    RATIO = 0.8
    JOBS = [('12.jpg','svc-cut',0.50,0.46), ('11.jpg','svc-nails',0.45,0.58),
            ('9.jpg','svc-brow',0.50,0.42), ('10.jpg','svc-face',0.44,0.42),
            ('13.jpg','svc-style',0.477,0.50,1.00), ('14.jpg','svc-color',0.330,0.50,1.00),
            ('15.jpg','svc-tone',0.438,0.50,1.00), ('16.jpg','svc-care',0.508,0.50,1.00),
            ('17.jpg','svc-makeup',0.469,0.43,0.82)]
    for j in JOBS:
        src, name, cx, cy = j[:4]; hf = j[4] if len(j) > 4 else 1.0
        f = f'{SRC}/{src}'
        if not have(f): continue
        im = Image.open(f).convert('RGB'); W, H = im.size
        w = min(W, round(H*RATIO*hf)); h = round(w/RATIO)
        if h > H: h = H; w = round(h*RATIO)
        x = round(min(max(cx*W - w/2, 0), W-w)); y = round(min(max(cy*H - h/2, 0), H-h))
        print('  ' + save(upscale(im.crop((x, y, x+w, y+h)), 600, 750), name, 86))

if __name__ == '__main__':
    only = sys.argv[1:] 
    for name, fn in [('works', works), ('masters', masters), ('dina', dina),
                     ('insta', insta), ('story', story), ('signature', signature),
                     ('services', services)]:
        if only and name not in only: continue
        print(f'── {name}'); fn()
