#!/usr/bin/env python3
"""Собирает страницы принтов shop/<id>/index.html из шапки и подвала shop/index.html.

Запускать из корня репозитория после правок шапки магазина или списка принтов:
    python3 server/product_pages.py
Список принтов должен совпадать с assets/shop.js и server/orders.py.
"""
import html, io, os, re

PRINTS = [  # id, название, расцветка по умолчанию, описание для поисковиков и превью ссылки
    ('buttons', 'JUST press BUTTONS', 'sky_on_cloud', 'The overhead panel, drawn by hand. The whole job in three words.'),
    ('flap', 'CERTIFIED FLAP OPERATOR', 'cloud_on_bordo', 'For those whose entire job is one lever. Captain approved.'),
    ('autopilot', 'CERTIFIED AUTOPILOT SUPERVISOR', 'high_on_night', 'Set it and forget it. Feels like flying.'),
    ('holding', "I'M NOT LOST, I'M HOLDING", 'white_on_sky', 'A holding pattern, lap 38. Totally under control.'),
    ('1500', '1500 FLIGHT HOURS / 0 SLEEP', 'bordo_on_cloud', 'A logbook up to the ATPL: 1500 hours in, sleep still pending.'),
]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MAIN = '''  <main class="pp">
    <a class="pp__back" href="/shop/" data-i18n="pp.back">← All prints</a>
    <div class="pp__grid">
      <div class="pp__stage"><img id="pp-img" src="/assets/img/shop/{id}-{cw}.webp" width="900" height="840" alt="{name} — pilot_arbuza T-shirt"></div>
      <div class="pp__info">
        <span class="pp__n doto">0{n} / 0{total} · <span data-i18n="sp.badge">Preorder</span></span>
        <h1>{name}</h1>
        <p class="pp__d" data-i18n="pr.{id}">{desc}</p>
        <div class="sp-card__cw"><small id="pp-cw"></small><div class="sw" id="pp-sw" role="group"></div></div>
        <ul class="pp__facts">
          <li data-i18n="pp.f1">One-colour print on the back</li>
          <li><span data-i18n="pp.f2">Sizes XS–XXL</span> · <button type="button" class="lnk" data-sizes data-i18n="sz.open">Size guide</button></li>
          <li data-i18n="pp.f3">Nothing to pay now — I’ll message you to confirm the order</li>
        </ul>
        <div class="pp__btns">
          <button type="button" class="btn btn--primary" id="pp-pre" data-i18n="sp.pre">Preorder</button>
          <a class="btn btn--ghost" id="pp-tg" href="https://t.me/pilot_arbuza" target="_blank" rel="noopener">Telegram</a>
          <button type="button" class="btn btn--ghost" id="pp-share" data-i18n="pp.share">Copy link</button>
        </div>
      </div>
    </div>
    <section class="pp__more">
      <h2 data-i18n="pp.more">Other prints</h2>
      <div class="pp__row" id="pp-more"></div>
    </section>
  </main>
'''


def main():
    base = io.open(os.path.join(ROOT, 'shop', 'index.html'), encoding='utf-8').read()
    head, rest = base.split('  <main>', 1)
    tail = rest.split('  </main>\n', 1)[1]
    for n, (pid, name, cw, desc) in enumerate(PRINTS, 1):
        e = html.escape
        h = head
        h = re.sub(r'<title[^>]*>.*?</title>', '<title>%s — pilot_arbuza</title>' % e(name), h)
        h = re.sub(r'<meta name="description"[^>]*>', '<meta name="description" content="%s pilot_arbuza T-shirt, five colourways. Preorders are open.">' % e(desc), h)
        h = re.sub(r'(<meta property="og:title" content=")[^"]*', r'\g<1>%s — pilot_arbuza T-shirt' % e(name).replace('\\', r'\\'), h)
        h = re.sub(r'(<meta property="og:description" content=")[^"]*', r'\g<1>%s' % e(desc), h)
        h = h.replace('https://pilotarbuza.com/shop/"', 'https://pilotarbuza.com/shop/%s/"' % pid)
        h = h.replace('/assets/img/shop/og.jpg', '/assets/img/shop/og-%s.jpg' % pid)
        h = h.replace('<body>', '<body data-print="%s">' % pid)
        h = h.replace('<header class="top" id="top">', '<header class="top top--light" id="top">')
        h = h.replace('<a href="/shop/" aria-current="page"', '<a href="/shop/"').replace('href="#catalog"', 'href="/shop/#catalog"')
        page = h + MAIN.format(id=pid, cw=cw, name=e(name), desc=e(desc), n=n, total=len(PRINTS)) + tail
        out = os.path.join(ROOT, 'shop', pid)
        os.makedirs(out, exist_ok=True)
        io.open(os.path.join(out, 'index.html'), 'w', encoding='utf-8', newline='\n').write(page)
        print('shop/%s/index.html' % pid)


if __name__ == '__main__':
    main()
