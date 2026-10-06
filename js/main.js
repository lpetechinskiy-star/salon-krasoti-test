/* =====================================================================
   ÉLANE — интерфейсная логика
   Ничего из этого не обязательно для чтения страницы: без JS или без
   GSAP контент остаётся видимым и управляемым с клавиатуры.
   ===================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(hover:hover) and (pointer:fine)');
  var hasGSAP = typeof window.gsap !== 'undefined';
  var hasST = hasGSAP && typeof window.ScrollTrigger !== 'undefined';
  var uid = 0;
  var bookingReset = null;     /* заполняет initBooking, вызывает окно при закрытии */
  var bookingPrefill = null;   /* подставляет мастера и услугу из карточки */
  var bookingStepOne = null;   /* вернуться к выбору услуги */

  if (hasST) gsap.registerPlugin(ScrollTrigger);

  /* ---------- утилиты ---------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function localDate(iso) {
    if (!iso) return null;
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function ruDate(iso) {
    var d = localDate(iso);
    return d ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';
  }

  /* -----------------------------------------------------------------
     0. Страховка: GSAP не загрузился — показать контент своими силами
     ----------------------------------------------------------------- */
  function revealAllStatic() {
    var els = $$('[data-reveal]');
    if (!('IntersectionObserver' in window) || reduced.matches) {
      els.forEach(function (el) { el.style.opacity = '1'; });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.style.transition = 'opacity .55s cubic-bezier(.16,1,.3,1)';
        e.target.style.opacity = '1';
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* -----------------------------------------------------------------
     1. Изображения: отложенная загрузка + аварийная пластина
     ----------------------------------------------------------------- */
  function initImages() {
    var imgs = $$('img[data-src]');

    function attach(img) {
      if (img.dataset.done) return;
      img.dataset.done = '1';
      img.addEventListener('load', function () { img.classList.add('is-loaded'); }, { once: true });
      img.addEventListener('error', function () {
        var frame = img.closest('.frame') || img.parentElement;
        if (frame) frame.classList.add('is-fallback');
        img.remove();
      }, { once: true });
      /* Выбор файла. srcset с дескрипторами w считает по плотности экрана и
         на 3× телефоне всегда указывает на самый большой файл: коробка 92vw
         при ширине 390 px — это 1077 физических пикселей. Третья плотность на
         фотографии глазом не читается, а файл удваивает, поэтому решаем сами.

         Считаем не по ширине экрана, а по самой коробке: сколько физических
         пикселей она просит при потолке плотности 2×. Мелкий файл берём,
         только если он это покрывает. Узкое окно на обычном мониторе тогда
         получит полный кадр, а не мыло: ширина экрана про плотность не знает. */
      var m = img.dataset.srcM, box = img.offsetWidth;
      var sp = m ? m.lastIndexOf(' ') : -1;
      var need = box * Math.min(window.devicePixelRatio || 1, 2);
      if (sp > 0 && box > 0 && parseInt(m.slice(sp + 1), 10) >= need) {
        img.src = m.slice(0, sp);
      } else {
        if (img.dataset.srcset) img.srcset = img.dataset.srcset;
        img.src = img.dataset.src;
      }
      if (img.complete && img.naturalWidth > 0) img.classList.add('is-loaded');
    }

    if (!('IntersectionObserver' in window)) { imgs.forEach(attach); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        attach(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: '600px 0px' });
    imgs.forEach(function (img) {
      if (img.getAttribute('fetchpriority') === 'high') attach(img);
      else io.observe(img);
    });
  }

  /* -----------------------------------------------------------------
     2. Курсор
     ----------------------------------------------------------------- */
  function initCursor() {
    if (!fine.matches || reduced.matches || !hasGSAP) return;
    var cur = $('.cursor');
    if (!cur) return;
    var x = gsap.quickTo(cur, 'x', { duration: 0.42, ease: 'power3' });
    var y = gsap.quickTo(cur, 'y', { duration: 0.42, ease: 'power3' });
    window.addEventListener('pointermove', function (e) { x(e.clientX); y(e.clientY); }, { passive: true });
    document.addEventListener('pointerover', function (e) {
      var t = e.target.closest && e.target.closest('a,button,label.opt,.ba__stage');
      cur.classList.toggle('is-lg', !!t);
    });
  }

  /* -----------------------------------------------------------------
     3. Шапка
     ----------------------------------------------------------------- */
  function initHeader() {
    var hdr = document.getElementById('hdr');
    if (!hdr) return;
    var hero = $('.hero');
    var fab = $('.fab');
    var last = window.scrollY, ticking = false;
    function apply() {
      var y = window.scrollY;
      if (!document.body.classList.contains('is-locked')) {
        hdr.classList.toggle('is-hidden', y > last && y > 240);
      }
      /* За пределами тёмного героя шапке нужна собственная подложка */
      var past = y > (hero ? hero.offsetHeight - 90 : 240);
      hdr.classList.toggle('is-solid', past);
      if (fab) fab.classList.toggle('is-on', past);
      last = y;
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }, { passive: true });
    apply();
  }

  /* -----------------------------------------------------------------
     4. Меню
     ----------------------------------------------------------------- */
  function initMenu() {
    var burger = document.getElementById('burger');
    var menu = document.getElementById('menu');
    if (!burger || !menu) return;
    var opener = null;
    var txt = $('.burger__txt', burger);

    /* Ловушка фокуса охватывает и кнопку закрытия в шапке.
       Порядок — как в DOM (кнопка стоит до меню), иначе Tab с последней
       ссылки уходит в страницу за пределами ловушки. */
    function focusables() {
      return [burger].concat(
        $$('a[href],button:not([disabled])', menu)
          .filter(function (el) { return el.offsetParent !== null; })
      );
    }

    function open() {
      opener = document.activeElement;
      menu.hidden = false;
      burger.setAttribute('aria-expanded', 'true');
      if (txt) txt.textContent = 'Закрыть';
      document.body.classList.add('is-locked');
      var f = focusables();
      if (f.length) f[0].focus();
      if (hasGSAP && !reduced.matches) {
        gsap.fromTo(menu, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' });
        gsap.from($$('.menu__list li, .menu__block', menu), {
          y: 26, opacity: 0, duration: 0.55, stagger: 0.045, ease: 'expo.out', delay: 0.05
        });
      }
    }

    function close(returnFocus) {
      menu.hidden = true;
      burger.setAttribute('aria-expanded', 'false');
      if (txt) txt.textContent = 'Меню';
      document.body.classList.remove('is-locked');
      if (returnFocus !== false && opener) opener.focus();
    }

    burger.addEventListener('click', function () { menu.hidden ? open() : close(); });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a[href^="#"]')) close(false);
    });

    document.addEventListener('keydown', function (e) {
      if (menu.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = focusables();
      if (!f.length) return;
      var first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    });
  }

  /* -----------------------------------------------------------------
     5. Якоря
     ----------------------------------------------------------------- */
  function initAnchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
      var had = target.hasAttribute('tabindex');
      if (!had) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      if (!had) target.addEventListener('blur', function () { target.removeAttribute('tabindex'); }, { once: true });
      if (history.replaceState) history.replaceState(null, '', id);
    });
  }

  /* -----------------------------------------------------------------
     6. Разбивка на символы (без внешних плагинов).
        Доступное имя сохраняем через aria-label на самом элементе.
     ----------------------------------------------------------------- */
  function splitChars(el) {
    var text = el.textContent.replace(/\s+/g, ' ').trim();
    el.setAttribute('aria-label', text);
    var src = el.textContent;
    el.textContent = '';
    var out = [];
    for (var i = 0; i < src.length; i++) {
      var s = document.createElement('span');
      s.setAttribute('aria-hidden', 'true');
      s.textContent = src[i] === ' ' ? ' ' : src[i];
      el.appendChild(s);
      out.push(s);
    }
    return out;
  }

  /* -----------------------------------------------------------------
     7. Анимации
     ----------------------------------------------------------------- */
  /* Моргание. Три кадра опускающегося века лежат стопкой поверх портрета;
     дробное значение k (0 — глаз открыт, 1 — закрыт) разливается по ним,
     поэтому веко идёт непрерывно, а не скачет между картинками.
     Закрывается быстрее, чем открывается, — так моргает живой глаз. */
  function initBlink(figure) {
    var frames = $$('[data-blink]', figure);
    if (frames.length < 2 || !window.gsap) return;
    var n = frames.length, state = { k: 0 }, timer = 0, tl = null, live = true;

    function render() {
      var pos = state.k * n;
      for (var i = 0; i < n; i++) {
        frames[i].style.opacity = Math.min(Math.max(pos - i, 0), 1);
      }
    }

    function blink(twice) {
      if (tl) tl.kill();
      tl = gsap.timeline({ onUpdate: render, onComplete: function () { tl = null; } })
        .to(state, { k: 1, duration: 0.12, ease: 'power2.in' })
        .to(state, { k: 0, duration: 0.22, ease: 'power1.out' }, '+=0.05');
      if (twice) {
        tl.to(state, { k: 1, duration: 0.1, ease: 'power2.in' }, '+=0.08')
          .to(state, { k: 0, duration: 0.2, ease: 'power1.out' }, '+=0.04');
      }
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (live && !document.hidden) blink(Math.random() < 0.18);
        schedule();
      }, 3400 + Math.random() * 5400);
    }

    /* Вне экрана моргать незачем — это лишние кадры на скролле */
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) { live = es[0].isIntersecting; },
        { threshold: 0 }).observe(figure);
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) return;
      if (tl) { tl.kill(); tl = null; }
      state.k = 0; render();
    });

    render();
    schedule();
  }

  /* Пряди. Копия кадра, вырезанная маской по массе волос, качается вокруг
     точки роста: у лица смещение нулевое, к кончикам — несколько пикселей.
     Два слоя идут с разным периодом, поэтому движение не зацикливается
     на глаз. Только широкий экран: там маска совпадает с кадром. */
  function initHair(figure) {
    var r = $('[data-hair="r"]', figure), l = $('[data-hair="l"]', figure);
    if (!r || !l || !window.gsap || !gsap.matchMedia) return;
    gsap.matchMedia().add('(min-width:1024px)', function () {
      var a = gsap.fromTo(r, { rotate: -0.5, skewX: 0.2 },
        { rotate: 0.5, skewX: -0.2, duration: 7.4,
          ease: 'sine.inOut', repeat: -1, yoyo: true });
      var b = gsap.fromTo(l, { rotate: 0.8, skewX: -0.3, x: 1.8 },
        { rotate: -0.8, skewX: 0.3, x: -1.8, duration: 9.3,
          ease: 'sine.inOut', repeat: -1, yoyo: true });
      b.progress(0.37);
      return function () {
        a.kill(); b.kill();
        gsap.set([r, l], { clearProps: 'transform' });
      };
    });
  }

  function initMotion() {
    if (!hasGSAP) { revealAllStatic(); return; }

    var h1 = $('.hero__h1');
    if (h1) {
      h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());
      var chars = [];
      $$('[data-split]', h1).forEach(function (ln) { chars = chars.concat(splitChars(ln)); });
      if (reduced.matches) gsap.set(chars, { opacity: 1 });
      else gsap.from(chars, { yPercent: 108, opacity: 0, duration: 1.05, ease: 'expo.out', stagger: 0.016, delay: 0.15 });
    }

    /* Портрет: три независимых слоя трансформаций, чтобы твины не спорили —
       вход берёт opacity/scale/clip, дыхание берёт y, курсор берёт x. */
    var model = $('.hero__model');
    var figure = model && $('[data-figure]', model);
    if (figure && !reduced.matches) {
      gsap.fromTo(figure,
        { opacity: 0, scale: 1.08, clipPath: 'inset(26% 0% 0% 0%)' },
        { opacity: 1, scale: 1, clipPath: 'inset(0% 0% 0% 0%)',
          duration: 1.6, ease: 'expo.out', delay: 0.2 });

      /* Едва заметное дыхание: кадр живой, но не отвлекает от текста */
      gsap.to(figure, {
        y: -12, duration: 6, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 1.7
      });

      /* Глубина от курсора — только на точном указателе */
      if (fine.matches) {
        var mx = gsap.quickTo(figure, 'x', { duration: 1.1, ease: 'power3' });
        window.addEventListener('pointermove', function (e) {
          mx((e.clientX / window.innerWidth - 0.5) * -26);
        }, { passive: true });
      }

      initBlink(figure);
      initHair(figure);
    }

    if (reduced.matches) {
      gsap.set('[data-reveal]', { opacity: 1 });
    } else {
      gsap.utils.toArray('[data-reveal]').forEach(function (el) {
        gsap.fromTo(el, { opacity: 0, y: 22 }, {
          opacity: 1, y: 0, duration: 0.7, ease: 'power2.out',
          scrollTrigger: hasST ? { trigger: el, start: 'top 88%', toggleActions: 'play none none none' } : undefined
        });
      });
    }

    if (!hasST || reduced.matches) return;

    /* Параллакс — только декоративные слои */
    gsap.utils.toArray('[data-parallax]').forEach(function (el) {
      gsap.to(el, {
        yPercent: parseFloat(el.dataset.parallax) || -8, ease: 'none',
        scrollTrigger: { trigger: el.parentElement || el, start: 'top bottom', end: 'bottom top', scrub: 0.6 }
      });
    });

    /* Раскрытие кадров маской */
    gsap.utils.toArray('.frame').forEach(function (f) {
      gsap.fromTo(f, { clipPath: 'inset(0% 0% 100% 0%)' }, {
        clipPath: 'inset(0% 0% 0% 0%)', duration: 1.15, ease: 'expo.out',
        scrollTrigger: { trigger: f, start: 'top 92%', toggleActions: 'play none none none' }
      });
    });

    /* Герой уходит вглубь */
    gsap.to('.hero__type', {
      yPercent: -14, opacity: 0.25, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.8 }
    });
    /* Портрет уходит медленнее текста — лёгкая глубина без параллакса на буквах */
    gsap.to('.hero__model', {
      yPercent: 7, opacity: 0.35, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.9 }
    });

    /* ГЛАДЬ — закрепление и раскадровка, только десктоп */
    gsap.matchMedia().add('(min-width:1024px) and (prefers-reduced-motion: no-preference)', function () {
      var sig = $('.sig'), word = $('[data-sig-word]'), panel = $('.sig__pin');
      if (!sig || !word || !panel) return;
      var letters = splitChars(word);
      /* Закреплять можно только панель, которая целиком влезает в экран:
         иначе её низ становится недостижимым при прокрутке. */
      var canPin = panel.offsetHeight <= window.innerHeight;
      var tl = gsap.timeline({
        scrollTrigger: canPin
          ? { trigger: sig, start: 'top top', end: '+=65%', scrub: 0.9, pin: panel, anticipatePin: 1 }
          : { trigger: sig, start: 'top 80%', end: 'bottom 60%', scrub: 0.9 }
      });
      tl.from(letters, { yPercent: 118, opacity: 0, stagger: 0.07, ease: 'expo.out' })
        .from('[data-sig-el]', { y: 34, opacity: 0, stagger: 0.09, ease: 'power2.out' }, '-=0.35')
        .to('[data-sig-img] img', { scale: 1.07, ease: 'none' }, 0);
      return function () { tl.scrollTrigger && tl.scrollTrigger.kill(); tl.kill(); };
    });

    gsap.from('.svc__row', {
      opacity: 0, y: 26, duration: 0.6, stagger: 0.05, ease: 'power2.out',
      scrollTrigger: { trigger: '.svc__list', start: 'top 82%' }
    });

    gsap.utils.toArray('.price__list').forEach(function (list) {
      gsap.from(list.children, {
        opacity: 0, y: 14, duration: 0.45, stagger: 0.035, ease: 'power1.out',
        scrollTrigger: { trigger: list, start: 'top 90%' }
      });
    });

    gsap.from('.ftr__mark span', {
      xPercent: -6, opacity: 0, duration: 1.2, ease: 'expo.out',
      scrollTrigger: { trigger: '.ftr__mark', start: 'top 92%' }
    });

    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
  }

  /* -----------------------------------------------------------------
     8. Услуги: превью за курсором
     ----------------------------------------------------------------- */
  function initServicePreview() {
    var box = $('.svc__preview');
    var list = $('.svc__list');
    if (!box || !list || reduced.matches || !hasGSAP) return;
    var img = $('img', box);
    var x = gsap.quickTo(box, 'x', { duration: 0.6, ease: 'power3' });
    var y = gsap.quickTo(box, 'y', { duration: 0.6, ease: 'power3' });
    var open = false, bw = 0, bh = 0, px = -1, py = -1;
    var HDR = 88;   /* высота фиксированной шапки */

    /* Держим превью внутри вьюпорта: иначе оно уезжает под шапку
       и за нижний край на строках в начале и конце списка. */
    function place(cx, cy, instant) {
      var maxX = window.innerWidth - bw - 16;
      var maxY = window.innerHeight - bh - 16;
      var tx = cx + 28;
      if (tx > maxX) tx = cx - bw - 28;
      tx = Math.max(16, Math.min(tx, maxX));
      var ty = Math.max(HDR, Math.min(cy - bh / 2, maxY));
      if (instant) gsap.set(box, { x: tx, y: ty }); else { x(tx); y(ty); }
    }

    /* Касание: карточка встаёт по центру экрана под строкой, а если
       места снизу нет — над ней. Курсора тут нет, цепляться не за что. */
    function placeAt(row) {
      var r = row.getBoundingClientRect();
      var tx = Math.max(16, (window.innerWidth - bw) / 2);
      var ty = r.bottom + 12;
      if (ty + bh > window.innerHeight - 16) ty = r.top - bh - 12;
      ty = Math.max(HDR, Math.min(ty, window.innerHeight - bh - 16));
      gsap.set(box, { x: tx, y: ty });
    }

    function show(row, cx, cy) {
      var src = row.dataset.img;
      if (!src) return;
      if (img.dataset.cur !== src) { img.dataset.cur = src; img.src = src; }
      bw = box.offsetWidth; bh = box.offsetHeight;
      place(cx, cy, !open);            /* первый показ — сразу у курсора, без проезда через угол */
      if (open) return;
      open = true;
      gsap.to(box, { opacity: 1, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
      gsap.fromTo(box, { clipPath: 'inset(100% 0% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.55, ease: 'expo.out' });
    }

    function hide() {
      if (!open) return;
      open = false;
      gsap.to(box, { opacity: 0, duration: 0.25, ease: 'power2.in', overwrite: 'auto' });
    }

    /* Без курсора показываем кадр по нажатию. Первое касание строки
       открывает кадр и гасит переход, второе — уводит в прайс, как и
       задумано ссылкой. Обработчик висит на списке и всплывает раньше
       делегата якорей на document, поэтому stopPropagation его и глушит. */
    if (!fine.matches) {
      var tapped = null;
      function drop() {
        if (tapped) tapped.classList.remove('is-shown');
        tapped = null;
        hide();
      }
      list.addEventListener('click', function (e) {
        var row = e.target.closest ? e.target.closest('.svc__row') : null;
        if (!row || !row.dataset.img) return;
        if (row === tapped) { drop(); return; }    /* второе касание — в прайс */
        e.preventDefault();
        e.stopPropagation();
        if (tapped) tapped.classList.remove('is-shown');
        tapped = row;
        row.classList.add('is-shown');
        bw = box.offsetWidth; bh = box.offsetHeight;
        show(row, 0, 0);
        placeAt(row);
      });
      /* Касание мимо списка и прокрутка убирают кадр */
      document.addEventListener('click', function (e) {
        if (!open) return;
        if (!e.target.closest || !e.target.closest('.svc__row')) drop();
      });
      window.addEventListener('scroll', function () {
        if (open) drop();
      }, { passive: true });
      return;
    }

    /* Один обработчик на весь список вместо подписки на каждую строку:
       состояние всегда выводится из реального положения курсора. */
    list.addEventListener('pointermove', function (e) {
      px = e.clientX; py = e.clientY;
      var row = e.target.closest ? e.target.closest('.svc__row') : null;
      if (row) show(row, px, py); else hide();
    }, { passive: true });
    list.addEventListener('pointerleave', hide);

    /* После прокрутки перепроверяем, что под курсором действительно строка:
       события ухода при скролле приходят не всегда. */
    window.addEventListener('scroll', function () {
      if (!open) return;
      if (px < 0) { hide(); return; }
      var el = document.elementFromPoint(px, py);
      var row = el && el.closest ? el.closest('.svc__row') : null;
      if (row) show(row, px, py); else hide();
    }, { passive: true });

    /* Клавиатура: превью привязано к строке, а не к курсору */
    $$('.svc__row').forEach(function (row) {
      row.addEventListener('focusin', function () {
        var r = row.getBoundingClientRect();
        bw = box.offsetWidth; bh = box.offsetHeight;
        show(row, Math.min(r.right - 80, window.innerWidth - 40), r.top + r.height / 2);
      });
      row.addEventListener('focusout', hide);
    });
  }

  /* -----------------------------------------------------------------
     9. До / После — тянуть мышью, стрелками или Home/End
     ----------------------------------------------------------------- */
  function initBeforeAfter() {
    var range = document.getElementById('ba-range');
    var clip = document.getElementById('ba-clip');
    var handle = document.getElementById('ba-handle');
    if (!range || !clip || !handle) return;
    var stage = range.closest('.ba__stage');

    /* Рисуем дробным процентом: шаг в целый процент — это 5–6 px на широкой
       сцене, и граница шла заметными ступенями. Целое число остаётся только
       в самом range и в подписи для скринридера. */
    function paint(v) {
      clip.style.clipPath = 'inset(0 ' + (100 - v).toFixed(2) + '% 0 0)';
      handle.style.left = v.toFixed(2) + '%';
    }
    var view = { v: +range.value };
    var ease = null;
    if (hasGSAP && !reduced.matches) {
      ease = gsap.quickTo(view, 'v', { duration: 0.24, ease: 'power3', onUpdate: function () { paint(view.v); } });
    }
    function apply(v, instant) {
      range.setAttribute('aria-valuetext', 'Показано ' + Math.round(v) + '% кадра «до»');
      if (ease && !instant) { ease(v); return; }
      view.v = v; paint(v);
    }
    apply(+range.value, true);
    range.addEventListener('input', function () { apply(+this.value); });
    range.addEventListener('focus', function () { stage && stage.classList.add('is-focus'); });
    range.addEventListener('blur', function () { stage && stage.classList.remove('is-focus'); });

    if (!stage) return;
    var dragging = false, armed = false, sx = 0, sy = 0, pid = null;

    function fromPointer(e) {
      var r = stage.getBoundingClientRect();
      var v = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
      range.value = Math.round(v);
      apply(v);
    }

    /* Мышь тянет сразу; палец — только после явно горизонтального движения,
       иначе страница переставала прокручиваться вертикально на телефоне. */
    stage.addEventListener('pointerdown', function (e) {
      pid = e.pointerId; sx = e.clientX; sy = e.clientY;
      if (e.pointerType === 'mouse') {
        e.preventDefault();          /* иначе браузер начинает тащить картинку */
        dragging = true; armed = true;
        stage.setPointerCapture(pid);
        fromPointer(e);
      } else {
        dragging = false; armed = false;
      }
    });

    stage.addEventListener('pointermove', function (e) {
      if (e.pointerId !== pid) return;
      if (!armed) {
        var dx = Math.abs(e.clientX - sx), dy = Math.abs(e.clientY - sy);
        if (dx < 10 && dy < 10) return;          /* порог: ещё не решили */
        if (dy >= dx) { pid = null; return; }    /* вертикаль — отдаём странице */
        armed = true; dragging = true;
        stage.setPointerCapture(pid);
      }
      if (dragging) fromPointer(e);
    });

    function stopDrag(e) {
      if (e && pid !== null && stage.hasPointerCapture(pid)) stage.releasePointerCapture(pid);
      dragging = false; armed = false; pid = null;
    }
    stage.addEventListener('pointerup', stopDrag);
    stage.addEventListener('pointercancel', stopDrag);
    /* Короткий тап без перетаскивания — просто ставим границу в точку касания */
    stage.addEventListener('click', function (e) {
      if (e.pointerType === 'mouse') return;
      fromPointer(e);
    });
  }

  /* -----------------------------------------------------------------
     10. Отзывы — автопролистывание с кольцом прогресса
     ----------------------------------------------------------------- */
  function initTestimonials() {
    var sec = $('[data-carousel]');
    if (!sec) return;
    var items = $$('.tst__item', sec);
    var dots = $$('.tst__dot', sec);
    var count = $('[data-tst="count"]', sec);
    var toggle = $('[data-tst="toggle"]', sec);
    var ringEl = $('.tst__ring-p', sec);
    if (!items.length) return;

    var STEP = 7;                       /* секунд на отзыв */
    var i = 0, timer = null, ring = null;
    var wantPlay = !reduced.matches;    /* намерение пользователя */
    var hovered = false, focused = false;
    var pad = function (n) { return String(n).padStart(2, '0'); };

    /* repeat:-1 сам возвращает кольцо в начало на каждом круге,
       поэтому смена отзыва и сброс индикатора всегда совпадают. */
    if (hasGSAP && ringEl) {
      ring = gsap.to(ringEl, {
        strokeDashoffset: 0, duration: STEP, ease: 'none', paused: true,
        repeat: -1, onRepeat: function () { go(1); }
      });
    }
    function resetRing() { if (ring) ring.pause(0); }

    function render(dir) {
      items.forEach(function (el, n) {
        el.hidden = n !== i;
        el.classList.toggle('is-active', n === i);
      });
      dots.forEach(function (d, n) {
        d.classList.toggle('is-on', n === i);
        d.setAttribute('aria-current', n === i ? 'true' : 'false');
      });
      if (count) count.textContent = pad(i + 1) + ' / ' + pad(items.length);
      if (hasGSAP && !reduced.matches) {
        gsap.fromTo(items[i], { opacity: 0, y: dir === -1 ? -20 : 20 },
          { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out', overwrite: true });
        gsap.fromTo($$('.stars__row--on .star', items[i]),
          { scale: 0.2, opacity: 0, transformOrigin: '50% 50%' },
          { scale: 1, opacity: 1, duration: 0.45, stagger: 0.05, ease: 'back.out(2)', delay: 0.12 });
      }
    }
    function go(step) { i = (i + step + items.length) % items.length; render(step); }
    function goTo(n) { var d = n > i ? 1 : -1; i = n; render(d); }

    /* Без GSAP кольцо не крутится, но ротация и управление работают */
    function sync() {
      var should = wantPlay && !hovered && !focused && !reduced.matches;
      if (ring) {
        should ? ring.play() : ring.pause();
      } else {
        if (should && !timer) timer = setInterval(function () { go(1); }, STEP * 1000);
        if (!should && timer) { clearInterval(timer); timer = null; }
      }
      if (toggle) {
        toggle.classList.toggle('is-paused', !wantPlay);
        toggle.setAttribute('aria-label', wantPlay ? 'Остановить автопролистывание' : 'Запустить автопролистывание');
      }
    }

    sec.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tst]');
      if (!btn) return;
      var act = btn.dataset.tst;
      if (act === 'next') { wantPlay = false; go(1); }
      else if (act === 'prev') { wantPlay = false; go(-1); }
      else if (act === 'go') { wantPlay = false; goTo(+btn.dataset.i); }
      else if (act === 'toggle') { wantPlay = !wantPlay; focused = false; }
      resetRing(); sync();
    });

    sec.addEventListener('mouseenter', function () { hovered = true; sync(); });
    sec.addEventListener('mouseleave', function () { hovered = false; sync(); });
    sec.addEventListener('focusin', function () { focused = true; sync(); });
    sec.addEventListener('focusout', function (e) {
      if (!sec.contains(e.relatedTarget)) { focused = false; sync(); }
    });
    reduced.addEventListener('change', function () { wantPlay = false; resetRing(); sync(); });

    render(1);
    sync();
  }

  /* -----------------------------------------------------------------
     10b. Работы — горизонтальная лента
     ----------------------------------------------------------------- */
  /* Лента работ. Горизонталь — своя, вертикаль — всегда страницы:
     обработчики ниже не вызывают preventDefault ни на колесе, ни на
     вертикальном движении пальца, а у самой ленты нет вертикального
     переполнения. Прокрутка вверх-вниз над лентой работает как везде. */
  function initWorks() {
    var row = $('[data-works]');
    var view = $('.wk__view');
    var bar = $('.wk__bar-p');
    if (!row || !view) return;

    var cards = $$('.wk__i', row);
    var nav = $$('[data-wk]');
    var smooth = function () { return reduced.matches ? 'auto' : 'smooth'; };
    var raf = 0, vel = 0, lastX = view.scrollLeft, lastT = performance.now();

    function max() { return view.scrollWidth - view.clientWidth; }

    /* Шаг — столько карточек, сколько помещается целиком, но хотя бы одна */
    function step() {
      var c = cards[0];
      if (!c) return Math.round(view.clientWidth * 0.8);
      var cs = getComputedStyle(row);
      var gap = parseFloat(cs.columnGap || cs.gap) || 24;
      var w = c.offsetWidth + gap;
      return Math.max(1, Math.floor(view.clientWidth / w)) * w;
    }

    function paint() {
      raf = 0;
      var m = max(), left = view.scrollLeft;
      if (bar) bar.style.transform = 'translateX(' + ((m > 0 ? left / m : 0) * (100 / 0.14 - 100)) + '%)';
      nav.forEach(function (b) {
        b.disabled = b.dataset.wk === 'next' ? left >= m - 2 : left <= 2;
      });
      if (reduced.matches) return;
      /* Два слагаемых: кадр отстаёт по месту в ленте и дополнительно
         отваливается назад тем сильнее, чем быстрее ленту тянут. Оба
         сдвига живут на <img> внутри .frame с overflow:hidden, поэтому
         область прокрутки ленты они не трогают ни при каких значениях. */
      var now = performance.now();
      var dt = Math.max(16, now - lastT);
      var inst = (left - lastX) / dt * 16;           /* px за кадр */
      vel += (inst - vel) * 0.25;
      if (Math.abs(vel) < 0.05) vel = 0;
      lastX = left; lastT = now;
      var lag = Math.max(-7, Math.min(7, -vel * 0.55));
      var vr = view.getBoundingClientRect(), mid = vr.left + vr.width / 2;
      for (var i = 0; i < cards.length; i++) {
        var r = cards[i].getBoundingClientRect();
        if (r.right < vr.left - 240 || r.left > vr.right + 240) continue;
        var d = Math.max(-1, Math.min(1, (r.left + r.width / 2 - mid) / (vr.width || 1)));
        var img = cards[i].querySelector('.frame img');
        if (img) img.style.setProperty('--wk-p', (d * -6 + lag).toFixed(2) + 'px');
      }
      if (vel !== 0) schedule();                      /* докатываем до остановки */
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(paint); }

    view.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    function to(left) {
      view.scrollTo({ left: Math.max(0, Math.min(max(), left)), behavior: smooth() });
    }
    function go(dir) { to(view.scrollLeft + dir * step()); }

    nav.forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.wk === 'next' ? 1 : -1); });
    });

    /* Клавиатура: лента — один объект в табуляции.
       Стрелки вверх-вниз не трогаем, они должны листать страницу. */
    view.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') { e.preventDefault(); to(0); }
      else if (e.key === 'End') { e.preventDefault(); to(max()); }
    });

    /* Перетаскивание мышью. На тачскрине этим занимается сам браузер —
       там палец и листает ленту, и прокручивает страницу.
       Горизонталь забираем себе только когда она уверенно победила
       вертикаль: иначе лента съедала бы прокрутку страницы. */
    var drag = null;
    function swallow(e) {
      e.stopPropagation(); e.preventDefault();
      view.removeEventListener('click', swallow, true);
    }
    view.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      e.preventDefault();          /* иначе браузер утаскивает саму картинку */
      drag = { x: e.clientX, y: e.clientY, left: view.scrollLeft, id: e.pointerId, on: false };
    });
    view.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.on) {
        if (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy)) return;  /* вертикаль — не наше дело */
        drag.on = true;
        view.classList.add('is-dragging');
        try { view.setPointerCapture(drag.id); } catch (err) {}
      }
      e.preventDefault();
      view.scrollLeft = drag.left - dx;
    });
    function end(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var was = drag.on, id = drag.id;
      drag = null;
      if (!was) return;
      try { view.releasePointerCapture(id); } catch (err) {}
      view.classList.remove('is-dragging');
      view.scrollTo({ left: view.scrollLeft });   /* вернуть притяжение к карточке */
      view.addEventListener('click', swallow, true);
    }
    view.addEventListener('pointerup', end);
    view.addEventListener('pointercancel', end);
    view.addEventListener('lostpointercapture', end);

    paint();

    if (!hasST || reduced.matches) return;
    /* Выход карточек при появлении секции — только прозрачность и маска
       кадра. Любой сдвиг карточки трансформом на миг расширяет область
       прокрутки ленты: по горизонтали она от этого дёргалась, по вертикали
       у ленты появлялась скрытая прокручиваемая ось, а такая ось в части
       браузеров забирает себе колесо. Маска и opacity этого не делают. */
    /* Выход: кадры встают друг за другом снизу вверх, подпись подтягивается
       следом. Масштаб только внутрь (0.94 → 1) — наружу он расширил бы
       область прокрутки ленты, и та забрала бы себе колесо. */
    var tl = gsap.timeline({
      scrollTrigger: { trigger: '.wk', start: 'top 78%', toggleActions: 'play none none none' }
    });
    tl.from($$('.frame', row), {
      clipPath: 'inset(0% 0% 100% 0%)', scale: 0.94, duration: 1.0,
      ease: 'expo.out', stagger: 0.065
    });
    tl.from($$('.wk__cap', row), {
      opacity: 0, duration: 0.5, ease: 'power2.out', stagger: 0.065
    }, 0.18);
  }

  function initCounters() {
    var els = $$('[data-count]');
    if (!els.length) return;
    els.forEach(function (el) {
      var target = parseFloat(el.dataset.count);
      var dec = parseInt(el.dataset.dec || '0', 10);
      var from = parseFloat(el.dataset.from || '0');
      var suffix = el.dataset.suffix || '';
      /* Год — не количество: разряды в нём не разделяются */
      var group = el.dataset.group !== '0';
      var fmt = function (v) {
        return v.toLocaleString('ru-RU', {
          minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: group
        }) + suffix;
      };
      el.textContent = fmt(target);                 /* итог виден и без анимации */
      if (!hasST || reduced.matches) return;
      var o = { v: from };
      gsap.to(o, {
        v: target, duration: 1.6, ease: 'power2.out',
        onUpdate: function () { el.textContent = fmt(o.v); },
        onComplete: function () { el.textContent = fmt(target); },
        scrollTrigger: { trigger: el, start: 'top 92%', once: true }
      });
    });
  }

  /* -----------------------------------------------------------------
     10d. Магнитные кнопки
     ----------------------------------------------------------------- */
  function initMagnet() {
    if (!hasGSAP || !fine.matches || reduced.matches) return;
    $$('[data-magnet]').forEach(function (el) {
      var mx = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
      var my = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        mx((e.clientX - r.left - r.width / 2) * 0.28);
        my((e.clientY - r.top - r.height / 2) * 0.4);
      });
      el.addEventListener('pointerleave', function () { mx(0); my(0); });
    });
  }

  /* -----------------------------------------------------------------
     10e. Индикатор прокрутки
     ----------------------------------------------------------------- */
  function initProgress() {
    var bar = $('.progress__bar');
    if (!bar) return;
    var ticking = false;
    function draw() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true; requestAnimationFrame(draw);
    }, { passive: true });
    draw();
  }

  /* -----------------------------------------------------------------
     11a. Календарь записи
     Сетка по образцу WAI: роль grid, роуминг-tabindex, стрелки,
     Home/End по неделе, PageUp/PageDown по месяцу, Enter/Space — выбор.
     ----------------------------------------------------------------- */
  function initCalendar(onPick) {
    var root = document.getElementById('cal');
    var input = document.getElementById('date');
    var grid = document.getElementById('cal-grid');
    var monEl = document.getElementById('cal-mon');
    var pickEl = document.getElementById('cal-pick');
    if (!root || !input || !grid) return null;

    var MON = ['январь','февраль','март','апрель','май','июнь',
               'июль','август','сентябрь','октябрь','ноябрь','декабрь'];
    var MON_IN = ['января','февраля','марта','апреля','мая','июня',
                  'июля','августа','сентября','октября','ноября','декабря'];
    var WD = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var LIMIT = new Date(today); LIMIT.setMonth(LIMIT.getMonth() + 6);   /* горизонт записи */
    var view = new Date(today.getFullYear(), today.getMonth(), 1);
    var focused = new Date(today);
    var selected = null;

    var iso = function (d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
             '-' + String(d.getDate()).padStart(2, '0');
    };
    var same = function (a, b) { return a && b && iso(a) === iso(b); };
    var days = function (d) { return Math.round((d - today) / 86400000); };

    function render() {
      monEl.textContent = MON[view.getMonth()] + ' ' + view.getFullYear();
      grid.textContent = '';

      var first = new Date(view.getFullYear(), view.getMonth(), 1);
      var shift = (first.getDay() + 6) % 7;                 /* неделя с понедельника */
      var start = new Date(first); start.setDate(1 - shift);

      for (var w = 0; w < 6; w++) {
        var row = document.createElement('div');
        row.className = 'cal__row';
        row.setAttribute('role', 'row');
        for (var i = 0; i < 7; i++) {
          var d = new Date(start);
          d.setDate(start.getDate() + w * 7 + i);
          var cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'cal__d';
          cell.setAttribute('role', 'gridcell');
          cell.dataset.iso = iso(d);

          if (d.getMonth() !== view.getMonth()) {
            cell.classList.add('cal__d--out');
            cell.tabIndex = -1;
            cell.setAttribute('aria-hidden', 'true');
            cell.disabled = true;
          } else {
            var off = days(d);
            var blocked = off < 0 || d > LIMIT;
            cell.textContent = d.getDate();
            cell.setAttribute('aria-disabled', blocked ? 'true' : 'false');
            cell.setAttribute('aria-selected', same(d, selected) ? 'true' : 'false');
            cell.tabIndex = same(d, focused) ? 0 : -1;
            if (off === 0) cell.classList.add('cal__d--today');
            if (off >= 0 && off < 3) cell.classList.add('cal__d--soon');
            var label = d.getDate() + ' ' + MON_IN[d.getMonth()] + ', ' + WD[d.getDay()];
            if (off === 0) label += ', сегодня';
            if (off >= 0 && off < 3) label += ', администратор подтвердит отдельно';
            if (blocked) label += ', недоступно';
            cell.setAttribute('aria-label', label);
          }
          row.appendChild(cell);
        }
        grid.appendChild(row);
      }

      var prev = $('[data-cal="prev"]', root);
      var next = $('[data-cal="next"]', root);
      if (prev) prev.disabled = view <= new Date(today.getFullYear(), today.getMonth(), 1);
      if (next) next.disabled = view >= new Date(LIMIT.getFullYear(), LIMIT.getMonth(), 1);
    }

    function focusCell(keep) {
      var el = grid.querySelector('[data-iso="' + iso(focused) + '"]:not(.cal__d--out)');
      if (!el) return;
      $$('.cal__d', grid).forEach(function (c) { c.tabIndex = -1; });
      el.tabIndex = 0;
      if (!keep) el.focus({ preventScroll: true });
    }

    function moveTo(d, keepFocus) {
      if (d < new Date(today.getFullYear(), today.getMonth(), 1) || d > LIMIT) return;
      focused = d;
      if (d.getMonth() !== view.getMonth() || d.getFullYear() !== view.getFullYear()) {
        view = new Date(d.getFullYear(), d.getMonth(), 1);
        render();
      }
      focusCell(keepFocus);
    }

    function select(d) {
      if (days(d) < 0 || d > LIMIT) return;
      /* render() пересобирает сетку и уносит фокус на body, поэтому
         возвращаем его на выбранный день — но только если он и был в сетке,
         иначе выбор чипом отобрал бы фокус у самого чипа. */
      var inGrid = grid.contains(document.activeElement);
      selected = new Date(d);
      focused = new Date(d);
      input.value = iso(selected);
      var off = days(selected);
      pickEl.innerHTML = '<b>' + WD[selected.getDay()] + '</b>, ' + selected.getDate() +
        ' ' + MON_IN[selected.getMonth()] +
        (off >= 0 && off < 3 ? ' — администратор подтвердит' : '');
      render();
      focusCell(!inGrid);
      if (onPick) onPick();
    }

    root.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-cal]');
      if (nav) {
        var act = nav.dataset.cal;
        if (act === 'prev' || act === 'next') {
          view = new Date(view.getFullYear(), view.getMonth() + (act === 'next' ? 1 : -1), 1);
          var f = new Date(view); f.setDate(Math.min(focused.getDate(), 28));
          focused = f;
          render(); focusCell(true);
          return;
        }
        if (act === 'quick') {
          var q = new Date(today); q.setDate(q.getDate() + (+nav.dataset.d || 0));
          moveTo(q, true); select(q);
          return;
        }
      }
      var cell = e.target.closest('.cal__d');
      if (cell && cell.getAttribute('aria-disabled') !== 'true' && cell.dataset.iso) {
        var parts = cell.dataset.iso.split('-');
        select(new Date(+parts[0], +parts[1] - 1, +parts[2]));
      }
    });

    grid.addEventListener('keydown', function (e) {
      var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      var d = new Date(focused);
      if (step) { d.setDate(d.getDate() + step); e.preventDefault(); moveTo(d); return; }
      if (e.key === 'Home') { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); e.preventDefault(); moveTo(d); return; }
      if (e.key === 'End') { d.setDate(d.getDate() + (6 - (d.getDay() + 6) % 7)); e.preventDefault(); moveTo(d); return; }
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        d.setMonth(d.getMonth() + (e.key === 'PageDown' ? 1 : -1));
        e.preventDefault(); moveTo(d); return;
      }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(focused); }
    });

    render();
    return {
      reset: function () {
        selected = null; input.value = '';
        focused = new Date(today);
        view = new Date(today.getFullYear(), today.getMonth(), 1);
        pickEl.innerHTML = '';
        render();
      }
    };
  }

  /* -----------------------------------------------------------------
     11b. Окно записи
     <dialog> даёт родные ловушку фокуса, Esc и возврат фокуса,
     поэтому здесь остаются только блокировка прокрутки и клик по фону.
     ----------------------------------------------------------------- */
  function initBookModal() {
    var dlg = document.getElementById('book-modal');
    if (!dlg) return;
    var box = $('.modal__box', dlg);
    var supported = typeof dlg.showModal === 'function';

    function open() {
      if (!supported) { location.hash = '#contacts'; return; }
      if (dlg.open) return;
      /* Из меню записываются чаще всего — закрываем его, чтобы окно
         не легло поверх второго полноэкранного слоя. */
      var mn = document.getElementById('menu');
      var bg = document.getElementById('burger');
      if (mn && !mn.hidden && bg) bg.click();
      dlg.showModal();
      document.body.classList.add('is-locked');
      var first = $('.step:not([hidden]) .opt input, .step:not([hidden]) .fld__i', dlg) || $('.modal__x', dlg);
      if (first) first.focus({ preventScroll: true });
      if (hasGSAP && !reduced.matches) {
        gsap.fromTo(box, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.42, ease: 'expo.out' });
      }
    }
    function close() {
      if (!dlg.open) return;
      dlg.close();
      document.body.classList.remove('is-locked');
      if (bookingReset && bookingReset()) lastPre = null;   /* сбросилась только отправленная заявка */
      showPre(null);
    }

    var pre = document.getElementById('book-pre');
    var preT = pre && $('.modal__preT', pre);
    var lastPre = null;   /* что подставила карточка мастера */

    var headEl = $('[data-book-h]', dlg);

    function showPre(info) {
      /* Заголовок считает оставшиеся шаги: после подстановки их два */
      if (headEl) headEl.textContent = info ? 'Осталось два шага' : 'Четыре шага';
      if (!pre) return;
      if (!info) { pre.hidden = true; return; }
      preT.innerHTML = 'Мастер <b>' + info.master + '</b> · услуга <b>' +
        info.service.replace('&', '&amp;') + '</b>';
      pre.hidden = false;
    }

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-book]');
      if (trigger) {
        e.preventDefault();
        var m = trigger.dataset.master, sv = trigger.dataset.service;
        if (m && sv && bookingPrefill) lastPre = bookingPrefill(m, sv);
        open();
        showPre(lastPre);     /* обычная кнопка не теряет подстановку из карточки */
        return;
      }
      if (e.target.closest('[data-book-edit]')) {
        lastPre = null;
        if (bookingStepOne) bookingStepOne();
        showPre(null);
        return;
      }
      if (e.target.closest('[data-book-close]')) { close(); }
    });
    /* Клик по затемнению. Сравниваем цель именно с самим <dialog>:
       .modal — флекс-контейнер, и всё вокруг карточки принадлежит ему.
       Проверка box.contains(e.target) здесь не годится — календарь
       при выборе дня пересобирает сетку, нажатая кнопка к моменту
       всплытия события уже вне DOM, и окно закрывалось само. */
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) close();
    });
    dlg.addEventListener('close', function () {
      document.body.classList.remove('is-locked');
      if (bookingReset && bookingReset()) lastPre = null;   /* сбросилась только отправленная заявка */
      showPre(null);
    });
  }

  /* -----------------------------------------------------------------
     11. Запись — пошаговая форма
     ----------------------------------------------------------------- */
  function initBooking() {
    var form = document.getElementById('book-form');
    if (!form) return;

    /* form.name/form.method и т.п. перекрываются свойствами HTMLFormElement,
       поэтому к полям обращаемся только через form.elements. */
    var F = form.elements;
    function field(name) { var f = F[name]; return f && f.length !== undefined && f.tagName === undefined ? f[0] : f; }
    function val(name) { var f = F[name]; return f ? (f.value || '') : ''; }

    var steps = $$('.step', form);
    var chips = $$('.steps__i', form);
    var stepsBar = $('.steps', form);
    var navBar = $('.book__nav', form);
    var live = document.getElementById('step-live');
    var prevBtn = document.getElementById('prev-step');
    var nextBtn = document.getElementById('next-step');
    var subBtn = document.getElementById('submit-step');
    var errSum = document.getElementById('err-sum');
    var errList = document.getElementById('err-sum-list');
    var summary = document.getElementById('summary');
    var done = document.getElementById('done');
    var doneP = document.getElementById('done-p');
    var cur = 0;

    /* Календарь пишет ISO-дату в скрытое поле, логика шагов не меняется */
    var cal = initCalendar(function () {
      (RULES[cur + 1] || []).forEach(function (r) { if (r.name === 'date') setErr(r, !r.test()); });
      clearResolved();
    });

    var RULES = {
      1: [{ name: 'service', err: 'err-service', label: 'Услуга', test: function () { return !!val('service'); } }],
      2: [{ name: 'master', err: 'err-master', label: 'Мастер', test: function () { return !!val('master'); } }],
      3: [
        { name: 'date', err: 'err-date', label: 'Дата', test: function () { return !!val('date'); } },
        { name: 'time', err: 'err-time', label: 'Время', test: function () { return !!val('time'); } }
      ],
      4: [
        { name: 'name', err: 'err-name', label: 'Имя', test: function () { return val('name').trim().length > 1; } },
        { name: 'phone', err: 'err-phone', label: 'Телефон', test: function () { return (val('phone').match(/\d/g) || []).length >= 10; } },
        { name: 'agree', err: 'err-agree', label: 'Согласие на обработку данных',
          test: function () { var f = F['agree']; return !!(f && f.checked); } }
      ]
    };

    function setErr(rule, on) {
      var p = document.getElementById(rule.err);
      if (p) p.hidden = !on;
      var f = field(rule.name);
      if (f && (f.tagName === 'TEXTAREA' || (f.tagName === 'INPUT' && f.type !== 'radio'))) {
        f.setAttribute('aria-invalid', on ? 'true' : 'false');
      }
    }

    function validate(stepNo, moveFocus) {
      var bad = (RULES[stepNo] || []).filter(function (r) {
        var ok = r.test();
        setErr(r, !ok);
        return !ok;
      });
      if (!bad.length) { errSum.hidden = true; return true; }

      if (bad.length > 1) {
        /* Сводка ошибок сверху + сохранение ошибок у полей */
        errList.innerHTML = '';
        bad.forEach(function (r) {
          var f = field(r.name);
          if (f && !f.id) f.id = 'fld-' + (++uid);
          var li = document.createElement('li');
          var a = document.createElement('a');
          a.href = f ? '#' + f.id : '#';
          a.textContent = r.label + ' — не заполнено';
          a.addEventListener('click', function (ev) { ev.preventDefault(); if (f) f.focus(); });
          li.appendChild(a);
          errList.appendChild(li);
        });
        errSum.hidden = false;
        if (moveFocus !== false) errSum.focus();
      } else {
        errSum.hidden = true;
        var one = field(bad[0].name);
        if (one && moveFocus !== false) one.focus();
      }
      return false;
    }

    function renderSummary() {
      if (!summary) return;
      var rows = [['Услуга', val('service')], ['Мастер', val('master')],
                  ['Дата', ruDate(val('date'))], ['Время', val('time')]]
        .filter(function (r) { return r[1]; });
      summary.innerHTML = rows.map(function (r) {
        return '<div><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></div>';
      }).join('');
    }

    function show(n, moveFocus) {
      cur = n;
      steps.forEach(function (s, idx) { s.hidden = idx !== n; });
      chips.forEach(function (c, idx) {
        c.classList.toggle('is-on', idx === n);
        c.classList.toggle('is-done', idx < n);
      });
      prevBtn.hidden = n === 0;
      nextBtn.hidden = n === steps.length - 1;
      subBtn.hidden = n !== steps.length - 1;
      if (live) live.textContent = 'Шаг ' + (n + 1) + ' из ' + steps.length +
        (chips[n] ? ': ' + chips[n].textContent.replace(/^\d+/, '').trim() : '');
      if (n === steps.length - 1) renderSummary();
      if (moveFocus) {
        var lg = $('.step__lg', steps[n]);
        if (lg) { lg.setAttribute('tabindex', '-1'); lg.focus({ preventScroll: true }); }
      }
      if (hasGSAP && !reduced.matches) {
        gsap.fromTo(steps[n], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.42, ease: 'power2.out' });
      }
    }

    nextBtn.addEventListener('click', function () {
      if (!validate(cur + 1)) return;
      show(Math.min(cur + 1, steps.length - 1), true);
    });
    prevBtn.addEventListener('click', function () { show(Math.max(cur - 1, 0), true); });

    /* Проверка на уходе из поля, а не на каждом символе */
    form.addEventListener('blur', function (e) {
      (RULES[cur + 1] || []).forEach(function (r) {
        if (field(r.name) === e.target && e.target.value !== '') setErr(r, !r.test());
      });
    }, true);

    form.addEventListener('change', function (e) {
      (RULES[cur + 1] || []).forEach(function (r) { if (r.name === e.target.name) setErr(r, !r.test()); });
      clearResolved();
    });

    /* Показываем ошибку на blur, но гасим её сразу, как поле стало верным.
       Иначе сообщение исчезает в момент нажатия кнопки, вся форма
       подпрыгивает вверх, и нажатие уходит в пустоту. */
    form.addEventListener('input', function (e) {
      (RULES[cur + 1] || []).forEach(function (r) {
        if (r.name !== e.target.name) return;
        var p = document.getElementById(r.err);
        if (p && !p.hidden && r.test()) setErr(r, false);
      });
      clearResolved();
    });

    function clearResolved() {
      if (errSum.hidden) return;
      var stillBad = (RULES[cur + 1] || []).some(function (r) { return !r.test(); });
      if (!stillBad) errSum.hidden = true;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate(steps.length)) return;

      var data = {
        service: val('service'), master: val('master'), date: val('date'), time: val('time'),
        name: val('name').trim(), phone: val('phone').trim(), note: val('note').trim()
      };
      /* Демо-режим: реальной отправки нет. Точка подключения CRM — здесь. */
      console.info('[ELANE] Заявка (демо, не отправлена):', data);

      steps.forEach(function (s) { s.hidden = true; });
      if (stepsBar) stepsBar.hidden = true;
      if (navBar) navBar.hidden = true;
      errSum.hidden = true;
      done.hidden = false;
      doneP.textContent = data.name + ', ждём вас ' + ruDate(data.date) + ' в ' + data.time +
        '. Администратор перезвонит на ' + data.phone + ' в течение 20 минут и подтвердит слот.';
      done.focus();
      if (hasGSAP && !reduced.matches) {
        gsap.from(done.children, { y: 22, opacity: 0, duration: 0.6, stagger: 0.07, ease: 'expo.out' });
      }
    });

    /* Кнопки «отправить ещё одну» нет: экран подтверждения — это конец
       разговора. Сбрасываем форму при закрытии окна, но только если
       заявка уже отправлена, чтобы не терять недозаполненный шаг. */
    bookingReset = function (force) {
      if (done.hidden && !force) return false;
      form.reset();
      if (cal) cal.reset();
      done.hidden = true;
      if (stepsBar) stepsBar.hidden = false;
      if (navBar) navBar.hidden = false;
      Object.keys(RULES).forEach(function (k) { RULES[k].forEach(function (r) { setErr(r, false); }); });
      show(0, false);
    };

    /* Клик по стрелке на карточке мастера: подставляем услугу его
       направления и самого мастера, дальше сразу шаг с датой. */
    bookingPrefill = function (master, service) {
      bookingReset(true);
      var ok1 = false, ok2 = false;
      if (service) {
        var rs = F['service'];
        for (var i = 0; rs && i < rs.length; i++) {
          if (rs[i].value === service) { rs[i].checked = true; ok1 = true; break; }
        }
      }
      if (master) {
        var rm = F['master'];
        for (var j = 0; rm && j < rm.length; j++) {
          if (rm[j].value === master) { rm[j].checked = true; ok2 = true; break; }
        }
      }
      (RULES[1] || []).concat(RULES[2] || []).forEach(function (r) { setErr(r, false); });
      show(ok1 && ok2 ? 2 : 0, false);
      return ok1 && ok2 ? { master: master, service: service } : null;
    };

    bookingStepOne = function () { show(0, true); };

    show(0, false);
  }

  /* ---------- запуск ---------- */
  function boot() {
    root.classList.add('is-ready');
    initImages();
    initHeader();
    initMenu();
    initAnchors();
    initBeforeAfter();
    initTestimonials();
    initWorks();
    initCounters();
    initProgress();
    initBooking();
    initBookModal();
    initMotion();
    initCursor();
    initServicePreview();
    initMagnet();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
