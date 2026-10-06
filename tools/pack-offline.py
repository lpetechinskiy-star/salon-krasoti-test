#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Собирает сайт в один HTML-файл: стили, шрифты, скрипты и кадры
внутри документа, ни одного внешнего запроса. Файл открывается
двойным щелчком, работает без сервера и без интернета.

    python3 tools/pack-offline.py [путь/к/файлу.html]
"""
import base64, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'elane-offline.html')
MIME = {'.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml',
        '.woff2':'font/woff2','.ico':'image/x-icon'}

def datauri(rel):
    p = os.path.join(ROOT, rel)
    b = open(p,'rb').read()
    return f'data:{MIME[os.path.splitext(p)[1].lower()]};base64,' + base64.b64encode(b).decode()

html = open(f'{ROOT}/index.html', encoding='utf-8').read()
css  = open(f'{ROOT}/css/main.css', encoding='utf-8').read()

# 1. Шрифты внутрь стилей. В исходнике каждый файл указан дважды — как
#    woff2-variations и как woff2 для браузеров постарше. Внутри документа
#    второй указатель означал бы вторую копию base64 — четверть мегабайта
#    впустую. Поэтому пара схлопывается в одну запись с format('woff2'):
#    это единственное написание, которое понимают все браузеры, умеющие
#    woff2, переменные шрифты в том числе.
css, ndup = re.subn(r"url\('fonts/([^']+)'\) format\('woff2-variations'\),\s*\n\s*url\('fonts/\1'\) format\('woff2'\)",
                    r"url('fonts/\1') format('woff2')", css)
css, nfont = re.subn(r"url\('fonts/([^']+)'\)", lambda m: f"url({datauri('css/fonts/'+m.group(1))})", css)

# 2. Предзагрузка шрифтов больше не нужна: файлов нет, есть data-ссылки.
html, npre = re.subn(r'\n<link rel="preload" as="font"[^>]*>', '', html)

# 3. Стили внутрь документа.
old = '<link rel="stylesheet" href="css/main.css">'
assert html.count(old) == 1
html = html.replace(old, '<style>\n' + css + '\n</style>')

# 4. srcset в один файл не переносится: data-ссылка содержит запятую,
#    а srcset по запятой и разбирается. Оставляем только src/data-src.
html, nss = re.subn(r'\s*(?:data-)?srcset="[^"]*"', '', html)
html, nsz = re.subn(r'\s*sizes="[^"]*"', '', html)

# 5. Мобильные варианты тоже убираем. В одном файле они не экономят ничего —
#    картинки уже внутри документа, сеть не задействована, — зато каждая
#    добавила бы свою копию base64. Остаётся полное качество на любом экране.
html, nmob = re.subn(r'\s*data-src-m="[^"]*"', '', html)

# 6. Скрипты внутрь документа, в том же порядке: встроенные выполняются
#    по месту, а место у них перед </body> — ровно как было с defer.
def inline_script(m):
    src = m.group(1)
    code = open(os.path.join(ROOT, src), encoding='utf-8').read()
    assert '</script' not in code.lower(), src
    return '<script>\n' + code + '\n</script>'
html, njs = re.subn(r'<script src="([^"]+)"[^>]*></script>', inline_script, html)

# 7. Кадры внутрь документа.
seen = {}
def img(m):
    rel = m.group(1)
    if rel not in seen: seen[rel] = datauri(rel)
    return '"' + seen[rel] + '"'
html, nimg = re.subn(r'"(assets/[A-Za-z0-9._-]+)"', img, html)

left = re.findall(r'(?:src|href)="(?!data:|#|mailto:|tel:)([^"]+)"', html)
open(OUT, 'w', encoding='utf-8').write(html)
print(f'шрифтов {nfont} (дублей убрано {ndup}), предзагрузок убрано {npre}, скриптов {njs}, кадров {nimg} ({len(seen)} файлов)')
print(f'srcset убрано {nss}, sizes убрано {nsz}, мобильных вариантов убрано {nmob}')
print('внешних ссылок осталось:', sorted(set(left)) or 'ни одной')
print(f'{OUT}: {os.path.getsize(OUT)//1024} КБ')
