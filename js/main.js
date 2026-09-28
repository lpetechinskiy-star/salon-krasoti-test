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
      img.src = img.dataset.src;
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
    var last = window.scrollY, ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        if (!document.body.classList.contains('is-locked')) {
          hdr.classList.toggle('is-hidden', y > last && y > 240);
        }
        last = y;
        ticking = false;
      });
    }, { passive: true });
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
          ? { trigger: sig, start: 'top top', end: '+=115%', scrub: 0.9, pin: panel, anticipatePin: 1 }
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
    if (!box || !list || !fine.matches || reduced.matches || !hasGSAP) return;
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

    function apply(v) {
      clip.style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)';
      handle.style.left = v + '%';
      range.setAttribute('aria-valuetext', 'Показано ' + v + '% кадра «до»');
    }
    apply(+range.value);
    range.addEventListener('input', function () { apply(+this.value); });
    range.addEventListener('focus', function () { stage && stage.classList.add('is-focus'); });
    range.addEventListener('blur', function () { stage && stage.classList.remove('is-focus'); });

    if (!stage) return;
    var dragging = false;
    function fromPointer(e) {
      var r = stage.getBoundingClientRect();
      var v = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
      range.value = v;
      apply(v);
    }
    stage.addEventListener('pointerdown', function (e) {
      dragging = true;
      stage.setPointerCapture(e.pointerId);
      fromPointer(e);
    });
    stage.addEventListener('pointermove', function (e) { if (dragging) fromPointer(e); });
    function stopDrag(e) {
      dragging = false;
      if (e && stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    }
    stage.addEventListener('pointerup', stopDrag);
    stage.addEventListener('pointercancel', stopDrag);
  }

  /* -----------------------------------------------------------------
     10. Отзывы — автопролистывание с явным управлением
     ----------------------------------------------------------------- */
  function initTestimonials() {
    var sec = $('[data-carousel]');
    if (!sec) return;
    var items = $$('.tst__item', sec);
    var count = $('[data-tst="count"]', sec);
    var toggle = $('[data-tst="toggle"]', sec);
    if (!items.length) return;

    var i = 0, timer = null;
    var wantPlay = !reduced.matches;   /* намерение пользователя */
    var hovered = false, focused = false;
    var pad = function (n) { return String(n).padStart(2, '0'); };

    function render(dir) {
      items.forEach(function (el, n) {
        el.hidden = n !== i;
        el.classList.toggle('is-active', n === i);
      });
      if (count) count.textContent = pad(i + 1) + ' / ' + pad(items.length);
      if (hasGSAP && !reduced.matches) {
        gsap.fromTo(items[i], { opacity: 0, y: dir === -1 ? -18 : 18 },
          { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', overwrite: true });
      }
    }
    function go(step) { i = (i + step + items.length) % items.length; render(step); }

    function sync() {
      var should = wantPlay && !hovered && !focused && !reduced.matches;
      if (should && !timer) timer = setInterval(function () { go(1); }, 7000);
      if (!should && timer) { clearInterval(timer); timer = null; }
      if (toggle) {
        toggle.classList.toggle('is-paused', !wantPlay);
        toggle.setAttribute('aria-label', wantPlay ? 'Остановить автопролистывание' : 'Запустить автопролистывание');
      }
    }

    sec.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tst]');
      if (!b) return;
      if (b.dataset.tst === 'next') { wantPlay = false; go(1); }
      else if (b.dataset.tst === 'prev') { wantPlay = false; go(-1); }
      else if (b.dataset.tst === 'toggle') { wantPlay = !wantPlay; focused = false; }
      sync();
    });

    sec.addEventListener('mouseenter', function () { hovered = true; sync(); });
    sec.addEventListener('mouseleave', function () { hovered = false; sync(); });
    sec.addEventListener('focusin', function () { focused = true; sync(); });
    sec.addEventListener('focusout', function (e) {
      if (!sec.contains(e.relatedTarget)) { focused = false; sync(); }
    });
    reduced.addEventListener('change', function () { wantPlay = false; sync(); });

    render(1);
    sync();
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
    var resetBtn = document.getElementById('reset-form');
    var cur = 0;

    var dateEl = document.getElementById('date');
    if (dateEl) dateEl.min = new Date().toISOString().slice(0, 10);

    var RULES = {
      1: [{ name: 'service', err: 'err-service', label: 'Услуга', test: function () { return !!val('service'); } }],
      2: [{ name: 'master', err: 'err-master', label: 'Мастер', test: function () { return !!val('master'); } }],
      3: [
        { name: 'date', err: 'err-date', label: 'Дата', test: function () { return !!val('date'); } },
        { name: 'time', err: 'err-time', label: 'Время', test: function () { return !!val('time'); } }
      ],
      4: [
        { name: 'name', err: 'err-name', label: 'Имя', test: function () { return val('name').trim().length > 1; } },
        { name: 'phone', err: 'err-phone', label: 'Телефон', test: function () { return (val('phone').match(/\d/g) || []).length >= 10; } }
      ]
    };

    function setErr(rule, on) {
      var p = document.getElementById(rule.err);
      if (p) p.hidden = !on;
      var f = field(rule.name);
      if (f && f.tagName === 'INPUT' && f.type !== 'radio') f.setAttribute('aria-invalid', on ? 'true' : 'false');
      else if (f && f.tagName === 'TEXTAREA') f.setAttribute('aria-invalid', on ? 'true' : 'false');
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

    resetBtn.addEventListener('click', function () {
      form.reset();
      done.hidden = true;
      if (stepsBar) stepsBar.hidden = false;
      if (navBar) navBar.hidden = false;
      Object.keys(RULES).forEach(function (k) { RULES[k].forEach(function (r) { setErr(r, false); }); });
      show(0, true);
    });

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
    initBooking();
    initMotion();
    initCursor();
    initServicePreview();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
