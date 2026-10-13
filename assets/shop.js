/* pilotarbuza.com/shop — каталог мерча. Тексты в assets/i18n.js (ключи sp.*, cw.*, pr.*). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const t = k => (window.t ? window.t(k) : k);

  // Принты: id совпадает с именем файла assets/img/shop/<id>-<расцветка>.webp.
  // price — строка вроде '1 200 ₺'; пока пусто, показывается «цена по запросу».
  const PRINTS = [
    { id: 'buttons', name: 'JUST press BUTTONS', cw: 'sky_on_cloud', price: '' },
    { id: 'flap', name: 'CERTIFIED FLAP OPERATOR', cw: 'cloud_on_bordo', price: '' },
    { id: 'autopilot', name: 'CERTIFIED AUTOPILOT SUPERVISOR', cw: 'high_on_night', price: '' },
    { id: 'holding', name: "I'M NOT LOST, I'M HOLDING", cw: 'white_on_sky', price: '' },
    { id: '1500', name: '1500 FLIGHT HOURS / 0 SLEEP', cw: 'bordo_on_cloud', price: '' },
  ];
  // Расцветки: [цвет принта, цвет футболки] из брендбука 2.1.
  const CW = {
    sky_on_cloud: ['#4A5AD6', '#F3EFE6'], bordo_on_cloud: ['#7B2233', '#F3EFE6'], cloud_on_bordo: ['#F3EFE6', '#7B2233'],
    high_on_night: ['#C9D2F4', '#2B2F45'], white_on_sky: ['#FFFFFF', '#4A5AD6'],
  };
  const TG = 'https://t.me/pilot_arbuza', WA = 'https://wa.me/905366091202';
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const src = (p, cw) => `/assets/img/shop/${p.id}-${cw}.webp`;

  /* ---------- часы, год, шапка, меню ---------- */
  const tick = () => {
    let v = '--:--';
    try { v = new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }); } catch (e) {}
    $$('.clock').forEach(el => { el.textContent = v; });
  };
  tick(); setInterval(tick, 15000);
  const y = $('#year'); if (y) y.textContent = new Date().getFullYear();
  const top = $('#top'), hero = $('#hero');
  if (top && hero) new IntersectionObserver(([e]) => top.classList.toggle('top--light', !e.isIntersecting), { rootMargin: '-64px 0px 0px 0px', threshold: 0 }).observe(hero);
  const burger = $('#burger'), menu = $('#menu');
  if (burger && menu) {
    const set = open => { menu.classList.toggle('menu--open', open); burger.setAttribute('aria-expanded', open); document.body.style.overflow = open ? 'hidden' : ''; };
    burger.addEventListener('click', () => set(!menu.classList.contains('menu--open')));
    $$('a', menu).forEach(a => a.addEventListener('click', () => set(false)));
  }

  /* ---------- каталог ---------- */
  const grid = $('#catalog');
  if (!grid) return;
  const how = $('.sp-how', grid);
  PRINTS.forEach((p, i) => {
    const el = document.createElement('article');
    el.className = 'sp-card card'; el.id = p.id;
    el.innerHTML = `
      <div class="sp-card__stage"><img src="${src(p, p.cw)}" width="900" height="840" alt="" ${i > 2 ? 'loading="lazy"' : ''}><span class="sp-card__n doto">0${i + 1} / 0${PRINTS.length}</span></div>
      <h2>${esc(p.name)}</h2>
      <p class="sp-card__d"></p>
      <div class="sp-card__cw"><small></small><div class="sw" role="group">${Object.keys(CW).map(k => `<button type="button" data-cw="${k}" style="--tee:${CW[k][1]};--ink-c:${CW[k][0]}"></button>`).join('')}</div></div>
      <div class="sp-card__buy"><span class="sp-card__price"></span><div class="sp-card__btns"><a class="btn btn--primary sp-tg" target="_blank" rel="noopener"></a><a class="btn btn--ghost sp-wa" target="_blank" rel="noopener"></a></div></div>`;
    grid.insertBefore(el, how);
    p.el = el;
    const img = $('img', el);
    $$('.sw button', el).forEach(b => b.addEventListener('click', () => {
      if (p.cw === b.dataset.cw) return;
      p.cw = b.dataset.cw;
      img.classList.add('swap');
      const next = new Image();
      next.onload = next.onerror = () => { img.src = next.src; img.classList.remove('swap'); };
      next.src = src(p, p.cw);
      paint(p);
    }));
    paint(p);
  });

  function paint(p) {
    const el = p.el, cw = t('cw.' + p.cw);
    const msg = encodeURIComponent(t('sp.msg').replace('{p}', p.name).replace('{c}', cw));
    $('img', el).alt = `${p.name} — ${cw}`;
    $('.sp-card__d', el).textContent = t('pr.' + p.id);
    $('.sp-card__cw small', el).innerHTML = `${t('sp.color')}: <b>${esc(cw)}</b>`;
    $('.sw', el).setAttribute('aria-label', t('sp.color'));
    $$('.sw button', el).forEach(b => { b.setAttribute('aria-pressed', b.dataset.cw === p.cw); b.setAttribute('aria-label', t('cw.' + b.dataset.cw)); b.title = t('cw.' + b.dataset.cw); });
    $('.sp-card__price', el).textContent = p.price || t('sp.price');
    const tg = $('.sp-tg', el), wa = $('.sp-wa', el);
    tg.textContent = t('sp.tg'); tg.href = `${TG}?text=${msg}`;
    wa.textContent = t('sp.wa'); wa.href = `${WA}?text=${msg}`;
  }
  document.addEventListener('langchange', () => PRINTS.forEach(paint));
  PRINTS.forEach(paint);

  // якорь вида /shop/#holding: карточки появляются после загрузки, доскролливаем вручную
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) { const go = () => target.scrollIntoView({ behavior: 'instant', block: 'start' }); go(); addEventListener('load', go, { once: true }); }
})();
