/* Индикатор прокрутки как у lusion.co: дорожка 20vh посередине справа.
   Длина ползунка = доля видимой части страницы, позиция = прогресс.
   Показывается при прокрутке и гаснет через секунду; его можно тянуть мышью. */
(() => {
  'use strict';
  const DARK = '#hero, .dark, #cards, #end-section, .marquee-wrap';
  const el = document.createElement('div');
  el.className = 'sbar'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="sbar__bar"></div>';
  document.body.appendChild(el);
  const bar = el.firstChild;
  let hideT = 0, queued = false, trackH = 0, barH = 0;

  const max = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
  function layout() {
    trackH = el.clientHeight;
    barH = Math.max(18, trackH * Math.min(1, innerHeight / document.documentElement.scrollHeight));
    bar.style.height = barH + 'px';
    update();
  }
  function update() {
    queued = false;
    const p = Math.min(1, Math.max(0, scrollY / max()));
    bar.style.transform = `translate3d(0, ${(p * (trackH - barH)).toFixed(2)}px, 0)`;
    const r = el.getBoundingClientRect();
    const under = document.elementsFromPoint(r.left - 4, r.top + r.height / 2).find(n => n !== el && !el.contains(n));
    el.classList.toggle('is-dark', !!(under && under.closest(DARK)));
  }
  function show() {
    el.classList.add('is-on');
    clearTimeout(hideT);
    hideT = setTimeout(() => el.classList.remove('is-on'), 1000);
  }
  addEventListener('scroll', () => { show(); if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', layout);
  new ResizeObserver(layout).observe(document.body);

  // перетаскивание: ползунок ходит по дорожке, страница за ним
  let dragY = 0, dragS = 0;
  el.addEventListener('pointerdown', (e) => {
    const r = el.getBoundingClientRect();
    const barTop = r.top + (scrollY / max()) * (trackH - barH);
    if (e.clientY < barTop || e.clientY > barTop + barH) {
      // клик по дорожке: прыжок туда
      const p = (e.clientY - r.top - barH / 2) / (trackH - barH);
      scrollTo({ top: Math.min(1, Math.max(0, p)) * max(), behavior: 'smooth' });
    }
    dragY = e.clientY; dragS = scrollY;
    el.classList.add('is-drag'); el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!el.classList.contains('is-drag')) return;
    const dy = e.clientY - dragY;
    scrollTo(0, dragS + dy / Math.max(1, trackH - barH) * max());
  });
  const end = () => el.classList.remove('is-drag');
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  layout();
})();
