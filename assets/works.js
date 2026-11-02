/* Витрина проектов: появление по скроллу, лёгкий параллакс обложки за курсором,
   анимации обложек идут только пока карточка на экране. */
(() => {
  'use strict';
  const head = document.querySelector('.wk-head');
  const items = Array.from(document.querySelectorAll('.wk'));
  if (!head && !items.length) return;
  const reveal = new IntersectionObserver((es) => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); reveal.unobserve(e.target); }
  }), { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  if (head) reveal.observe(head);
  items.forEach(el => reveal.observe(el));

  const live = new IntersectionObserver((es) => es.forEach(e => e.target.classList.toggle('is-live', e.isIntersecting)), { threshold: 0 });
  items.forEach(el => live.observe(el));

  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  items.forEach(el => {
    const img = el.querySelector('.wk__img');
    let raf = 0, tx = 0, ty = 0, x = 0, y = 0;
    const tick = () => {
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      el.style.setProperty('--px', x.toFixed(2) + 'px');
      el.style.setProperty('--py', y.toFixed(2) + 'px');
      raf = (Math.abs(tx - x) > 0.05 || Math.abs(ty - y) > 0.05) ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    img.addEventListener('pointermove', (e) => {
      const r = img.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * -18;
      ty = ((e.clientY - r.top) / r.height - 0.5) * -12;
      kick();
    });
    img.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
  });
})();
