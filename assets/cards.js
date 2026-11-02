/* ============================================================
   pilotarbuza.com — карты «С чем работаю»
   Десктоп: секция липкая, скролл ведет сцену. Рубашки въезжают снизу веером,
   расходятся в ряд и по очереди переворачиваются, за ними прорисовывается лента.
   Телефон и reduced motion: карты в ленте, переворот по нажатию
   (и сам один раз, когда лента появляется на экране).
   ============================================================ */
(() => {
  'use strict';
  const section = document.getElementById('cards');
  if (!section) return;
  const cards = Array.from(section.querySelectorAll('.pc'));
  const inners = cards.map(c => c.querySelector('.pc__inner'));
  const ribbon = document.getElementById('cards-ribbon-path');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desktop = matchMedia('(min-width: 901px)');

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- телефон: переворот по нажатию ---------- */
  const setFlip = (i, on) => { cards[i].classList.toggle('is-flipped', on); inners[i].setAttribute('aria-pressed', on ? 'true' : 'false'); };
  inners.forEach((b, i) => b.addEventListener('click', () => {
    if (desktop.matches && !reduce) return;          // на десктопе переворачивает скролл
    setFlip(i, !cards[i].classList.contains('is-flipped'));
  }));
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting || (desktop.matches && !reduce)) return;
    o.disconnect();
    cards.forEach((_, i) => setTimeout(() => setFlip(i, true), reduce ? 0 : 300 + i * 220));
  }, { threshold: .45 }).observe(section);

  /* ---------- десктоп: сцена по скроллу ---------- */
  let ribbonLen = 0;
  if (ribbon) { ribbonLen = ribbon.getTotalLength(); ribbon.style.strokeDasharray = ribbonLen; }

  function layout(p) {
    const vw = innerWidth, vh = innerHeight;
    const cw = Math.min(vw * .205, vh * .52, 340);
    section.style.setProperty('--cw', cw + 'px');
    const gap = cw * .12, n = cards.length, mid = (n - 1) / 2;

    cards.forEach((card, i) => {
      const k = i - mid;
      // 1. въезд снизу веером, с небольшим сдвигом по времени
      const enter = ease(seg(p, .02 + i * .025, .24 + i * .025));
      // 2. веер расходится в ровный ряд
      const spread = ease(seg(p, .3, .52));
      // 3. переворот по очереди
      const flip = ease(seg(p, .42 + i * .085, .6 + i * .085));

      const fanX = k * cw * .74, rowX = k * (cw + gap);
      const x = lerp(fanX, rowX, spread);
      const y = lerp(vh * .85 + Math.abs(k) * 40, Math.abs(k) * cw * .07, enter) * (1 - spread) + 0;
      const rz = lerp(k * 16, k * 7, enter) * (1 - spread);
      const lift = Math.sin(flip * Math.PI);           // в середине переворота карта приподнимается
      const ry = flip * 180 + k * 6 * lift;
      const rx = -10 * lift;
      const z = lift * cw * .45 - Math.abs(k) * 4;

      card.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateZ(${rz}deg)`;
      card.style.zIndex = String(10 + (flip > .5 ? 20 : 0) + i);
      inners[i].style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
      const on = flip > .5;
      if (card._on !== on) { card._on = on; inners[i].setAttribute('aria-pressed', on ? 'true' : 'false'); }
    });

    if (ribbon) ribbon.style.strokeDashoffset = ribbonLen * (1 - ease(seg(p, .06, .7)));
  }

  function reset() {
    cards.forEach((c, i) => { c.style.transform = ''; c.style.zIndex = ''; inners[i].style.transform = ''; });
    section.style.removeProperty('--cw');
    if (ribbon) ribbon.style.strokeDashoffset = 0;
  }

  let raf = 0, cur = 0, onScreen = false;
  const progress = () => {
    const r = section.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, section.offsetHeight - innerHeight));
  };
  function tick() {
    raf = 0;
    if (!onScreen || !desktop.matches || reduce) return;
    const target = progress();
    cur += (target - cur) * .14;
    if (Math.abs(target - cur) < .0005) cur = target;
    layout(cur);
    if (cur !== target) raf = requestAnimationFrame(tick);
  }
  const wake = () => { if (!raf && onScreen && desktop.matches && !reduce) raf = requestAnimationFrame(tick); };

  function mode() {
    const scroll = desktop.matches && !reduce;
    section.classList.toggle('cards--scroll', scroll);
    if (scroll) { cur = progress(); layout(cur); } else reset();
  }

  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; wake(); }, { rootMargin: '200px' }).observe(section);
  addEventListener('scroll', wake, { passive: true });
  addEventListener('resize', () => { if (desktop.matches && !reduce) layout(cur); }, { passive: true });
  desktop.addEventListener('change', mode);
  mode();
})();
