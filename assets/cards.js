/* ============================================================
   pilotarbuza.com — карты «С чем работаю»
   Десктоп: секция липкая, скролл ведет сцену.
     0.00–0.20  колода поднимается снизу под заголовком
     0.18–0.36  заголовок уходит вверх, колода раскрывается веером
     0.36–0.54  веер расходится в ровный ряд
     0.48–0.92  карты по очереди переворачиваются лицом
   Лента-трубка прорисовывается за картами. Положение сглаживается по времени
   (экспонента от dt), поэтому шаги колеса мыши не дергают сцену.
   Телефон и reduced motion: карты лентой, переворот по нажатию.
   ============================================================ */
(() => {
  'use strict';
  const section = document.getElementById('cards');
  if (!section) return;
  const cards = Array.from(section.querySelectorAll('.pc'));
  const inners = cards.map(c => c.querySelector('.pc__inner'));
  const heading = section.querySelector('.cards__h');
  const tubes = Array.from(section.querySelectorAll('.cards__ribbon .rb'));
  const tubeGroup = section.querySelector('.cards__ribbon-g');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desktop = matchMedia('(min-width: 901px)');

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);   // easeInOutCubic
  const out = t => 1 - Math.pow(1 - t, 3);                                         // easeOutCubic
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- телефон: переворот по нажатию ---------- */
  const setFlip = (i, on) => { cards[i].classList.toggle('is-flipped', on); inners[i].setAttribute('aria-pressed', on ? 'true' : 'false'); };
  inners.forEach((b, i) => b.addEventListener('click', () => {
    if (desktop.matches && !reduce) return;
    setFlip(i, !cards[i].classList.contains('is-flipped'));
  }));
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting || (desktop.matches && !reduce)) return;
    o.disconnect();
    cards.forEach((_, i) => setTimeout(() => setFlip(i, true), reduce ? 0 : 300 + i * 220));
  }, { threshold: .45 }).observe(section);

  /* ---------- десктоп: сцена по скроллу ---------- */
  const lens = tubes.map(t => t.getTotalLength());
  tubes.forEach((t, i) => { t.style.strokeDasharray = lens[i]; });

  let cw = 300;
  function measure() {
    const vw = innerWidth, vh = innerHeight;
    const pad = Math.max(40, vw * .05), gap = Math.max(18, vw * .022);
    cw = Math.min((vw - pad * 2 - gap * 3) / 4, (vh * .64) / 1.4, 420);
    section.style.setProperty('--cw', cw + 'px');
    return gap;
  }
  let gap = measure();

  function layout(p) {
    const vh = innerHeight, n = cards.length, mid = (n - 1) / 2;
    const rise = out(seg(p, 0, .2));
    const fan = ease(seg(p, .18, .36));
    const spread = ease(seg(p, .36, .54));
    const away = ease(seg(p, .16, .38));

    if (heading) {
      heading.style.transform = `translate3d(0, ${-away * vh * .62}px, 0)`;
      heading.style.opacity = String(1 - away * .9);
    }

    cards.forEach((card, i) => {
      const k = i - mid;
      const flip = ease(seg(p, .48 + i * .075, .64 + i * .075));

      // колода: карты почти друг на друге, чуть сдвинуты, едут снизу
      const deckX = k * cw * .06, deckY = vh * .62 * (1 - rise) + vh * .2 * (1 - fan) * (1 - spread);
      const deckR = k * 2;
      // веер: дуга, крайние ниже и сильнее повернуты
      const fanX = k * cw * .62, fanY = Math.abs(k) * Math.abs(k) * cw * .05;
      const fanR = k * 7.5;
      // ряд
      const rowX = k * (cw + gap);

      const x = lerp(lerp(deckX, fanX, fan), rowX, spread);
      const y = lerp(deckY + lerp(0, fanY, fan), 0, spread);
      const rz = lerp(lerp(deckR, fanR, fan), 0, spread);

      const lift = Math.sin(flip * Math.PI);
      const ry = flip * 180 + k * 8 * lift;
      const rx = -12 * lift;
      const z = lift * cw * .55;
      const s = 1 + lift * .04;

      card.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateZ(${rz.toFixed(3)}deg) scale(${s.toFixed(4)})`;
      card.style.zIndex = String(10 + i + (lift > .05 ? 40 : 0));
      inners[i].style.transform = `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg)`;
      const on = flip > .5;
      if (card._on !== on) { card._on = on; inners[i].setAttribute('aria-pressed', on ? 'true' : 'false'); }
    });

    const draw = ease(seg(p, .04, .72));
    tubes.forEach((t, i) => { t.style.strokeDashoffset = (lens[i] * (1 - draw)).toFixed(1); });
    if (tubeGroup) tubeGroup.style.transform = `translate3d(${(-p * 60).toFixed(1)}px, ${(p * -40).toFixed(1)}px, 0)`;
  }

  function reset() {
    cards.forEach((c, i) => { c.style.transform = ''; c.style.zIndex = ''; inners[i].style.transform = ''; });
    if (heading) { heading.style.transform = ''; heading.style.opacity = ''; }
    if (tubeGroup) tubeGroup.style.transform = '';
    tubes.forEach(t => { t.style.strokeDashoffset = 0; });
  }

  const progress = () => {
    const r = section.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, section.offsetHeight - innerHeight));
  };

  let raf = 0, cur = 0, last = 0, onScreen = false;
  const live = () => onScreen && desktop.matches && !reduce;
  function tick(now) {
    raf = 0;
    if (!live()) return;
    const dt = last ? Math.min(.05, (now - last) / 1000) : .016;
    last = now;
    const target = progress();
    cur += (target - cur) * (1 - Math.exp(-dt * 7));   // мягкое догоняние, одинаковое при любой частоте кадров
    if (Math.abs(target - cur) < .0002) cur = target;
    layout(cur);
    if (cur !== target) raf = requestAnimationFrame(tick); else last = 0;
  }
  const wake = () => { if (!raf && live()) raf = requestAnimationFrame(tick); };

  function mode() {
    const scroll = desktop.matches && !reduce;
    section.classList.toggle('cards--scroll', scroll);
    if (scroll) { gap = measure(); cur = progress(); layout(cur); } else reset();
  }

  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) { cur = progress(); layout(cur); } wake(); }, { rootMargin: '200px' }).observe(section);
  addEventListener('scroll', wake, { passive: true });
  addEventListener('resize', () => { if (live()) { gap = measure(); layout(cur); } }, { passive: true });
  desktop.addEventListener('change', mode);
  mode();
})();
