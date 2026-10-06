#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Увеличение кадра обратным проецированием (iterative back-projection).

Почему не Ланцош с подрезкостью. Ланцош просто растягивает сетку — он не
знает, каким должен быть результат, и на больших коэффициентах даёт кашу.
Подрезкость поверх добавляет контур, которого в кадре не было: картинка
кажется резче, но уменьшенная копия перестаёт совпадать с исходником —
значит, деталь выдумана.

Обратное проецирование ставит условие: уменьшенная копия результата обязана
совпасть с исходником. И правит результат, пока это не выполнится:

    x ← x + λ · U( y − D(x) )

y — исходник, D — уменьшение усреднением по площади (физика пересэмплинга),
U — обратное увеличение. Новая деталь не берётся из ниоткуда: алгоритм
перераспределяет уже имеющуюся яркость так, чтобы она правильно сворачивалась
обратно. Замер на карточке «Работ» (154→420 px, то есть 2,7×):

    способ                        согласованность  резкость  звон
    Ланцош                               1,77        16,9    18
    Ланцош + подрезкость                 1,55        34,7    37
    обратное проецирование               0,11        28,6    34
    оно же + лёгкая подрезкость          0,88        38,1    41

Согласованность — среднеквадратичная ошибка уменьшенной копии против
исходника; чем меньше, тем честнее увеличение.
"""
import numpy as np
from PIL import Image, ImageFilter


def _res(a, size, flt):
    """Пересэмплинг в float по каналам: режим 'F' не теряет точность между итерациями."""
    out = np.empty((size[1], size[0], a.shape[2]), np.float32)
    for c in range(a.shape[2]):
        im = Image.fromarray(a[:, :, c].astype(np.float32), mode='F')
        out[:, :, c] = np.asarray(im.resize(size, flt), np.float32)
    return out


def upscale(img, W, H, iters=14, lam=0.9, guard=30.0, sharpen=(1.2, 40, 3)):
    """img → PIL.Image размера W×H.

    guard — предел отклонения от ланцошевой базы в уровнях яркости. Держит
    в узде звон: на резких границах обратное проецирование склонно к перелёту,
    а перелёт читается как ореол.
    sharpen — лёгкая подрезкость в конце, (радиус, проценты, порог) или None.
    """
    y = np.asarray(img.convert('RGB'), np.float32)
    h, w = y.shape[:2]
    if (W, H) == (w, h) and sharpen is None:
        return img.convert('RGB')
    base = _res(y, (W, H), Image.LANCZOS)
    x = base.copy()
    for _ in range(iters):
        e = y - _res(x, (w, h), Image.BOX)      # невязка на низком разрешении
        x += lam * _res(e, (W, H), Image.LANCZOS)
        np.clip(x, base - guard, base + guard, out=x)
        np.clip(x, 0, 255, out=x)
    res = Image.fromarray(x.round().astype(np.uint8), 'RGB')
    return res.filter(ImageFilter.UnsharpMask(*sharpen)) if sharpen else res


def texture(img, grain=3.0, micro=0.25, seed=7):
    """Плёночная фактура поверх сильного увеличения.

    Разрешения это не прибавляет и не притворяется, что прибавляет. Но кадр
    с коэффициентом 3× выходит гладким до пластмассовости — именно это и
    читается как «плохое качество». Тонкое зерно по яркости плюс лёгкий
    локальный контраст возвращают коже модель, а волосам — структуру.
    Проверено в реальном масштабе экрана (файл 900 px в коробке 636 CSS при
    плотности 2): выше grain=5 начинает читаться уже как шум.

    Зерно сильнее в середине тонов: в тенях оно шумит, в светах грязнит.
    """
    import numpy as np
    from scipy.ndimage import gaussian_filter
    a = np.asarray(img.convert('RGB'), np.float32)
    L = a.mean(2)
    n = gaussian_filter(np.random.default_rng(seed).normal(0, 1, L.shape).astype(np.float32), 0.62)
    n /= (n.std() + 1e-6)
    w = np.clip(1.0 - ((L - 128.0) / 128.0) ** 2, 0, 1) ** 0.7
    a += (n * w * grain)[..., None]
    if micro:
        base = np.stack([gaussian_filter(a[..., c], 3.0) for c in range(3)], -1)
        a += (a - base) * micro
    return Image.fromarray(np.clip(a, 0, 255).round().astype(np.uint8), 'RGB')


# ── метрики, которыми выбирался способ ────────────────────────────────
def consistency(res, src):
    """Уменьшаем результат до размера исходника и смотрим, насколько совпало."""
    d = _res(np.asarray(res.convert('RGB'), np.float32), src.size, Image.BOX)
    return float(np.sqrt(((d - np.asarray(src.convert('RGB'), np.float32)) ** 2).mean()))


def sharpness(im):
    from scipy.signal import convolve2d
    g = np.asarray(im.convert('L'), np.float32)
    k = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], np.float32)
    return float(convolve2d(g, k, mode='valid').var())
