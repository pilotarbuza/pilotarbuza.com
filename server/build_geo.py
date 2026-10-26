#!/usr/bin/env python3
"""Границы стран для «Стран» в личном приложении. Запускается руками, когда нужно обновить данные:

    python3 server/build_geo.py ne_50m_admin_0_countries.geojson ne_110m_admin_0_countries.geojson [ne_10m_populated_places.geojson]

Исходники — Natural Earth (public domain): github.com/nvkelso/natural-earth-vector/tree/master/geojson.
Пишет два файла:
  server/geo/countries.json — контуры 1:50m для определения страны по координатам (на сервере, в браузер не уходит);
  assets/me/world.js        — контуры 1:110m в проекции Миллера для карты и названия стран по-русски;
  server/geo/cities.json    — города (Natural Earth populated places 1:10m, ~7300): широта, долгота, имя по-русски и
                              по-английски, страна, население — чтобы по координатам отметок находить ближайший город.
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
# у части стран в Natural Earth нет ISO-кода — подставляем ближайший по смыслу
FIX = {'Somaliland': 'SO', 'N. Cyprus': 'CY', 'Siachen Glacier': 'IN'}
NAME_FIX = {'XK': 'Косово', 'TR': 'Турция', 'CY': 'Кипр', 'SO': 'Сомали', 'US': 'США', 'GB': 'Великобритания', 'CZ': 'Чехия'}


def code(p):
    c = p.get('ISO_A2_EH') or '-99'
    return FIX.get(p['NAME'], c) if c == '-99' else c


def polys(geom):
    return [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']


def build_lookup(src, dst):
    out = []
    for f in json.load(open(src, encoding='utf-8'))['features']:
        c = code(f['properties'])
        if c == '-99':
            continue
        for poly in polys(f['geometry']):
            rings = [[[round(x, 3), round(y, 3)] for x, y in ring] for ring in poly]
            xs, ys = [p[0] for p in rings[0]], [p[1] for p in rings[0]]
            out.append({'c': c, 'b': [min(xs), min(ys), max(xs), max(ys)], 'r': rings})
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    print(dst, len(out), 'polygons', os.path.getsize(dst) // 1024, 'KB')


def build_cities(src, dst):
    out = []
    for f in json.load(open(src, encoding='utf-8'))['features']:
        p = f['properties']
        lon, lat = f['geometry']['coordinates'][:2]
        iso = p.get('ISO_A2') if p.get('ISO_A2') not in (None, '-99') else ''
        en = p.get('NAME_EN') or p['NAME']
        out.append([round(lat, 4), round(lon, 4), p.get('NAME_RU') or p['NAME'], en, iso, int(p.get('POP_MAX') or 0)])
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(dst, len(out), 'cities', os.path.getsize(dst) // 1024, 'KB')


def miller(lon, lat):
    lat = max(-80, min(84, lat))
    y = 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(lat)))
    return (lon + 180) / 360 * 1000, 500 - y * 1000 / (2 * math.pi)


def build_map(src50, src110, dst):
    names, shapes, labels = {}, {}, {}
    for f in json.load(open(src50, encoding='utf-8'))['features']:
        p = f['properties']
        c = code(p)
        if c != '-99' and (c not in names or p.get('HOMEPART') == 1):
            names[c] = [NAME_FIX.get(c) or p['NAME_RU'] or p['NAME'], p['NAME_EN'] or p['NAME'], p['NAME_TR'] or p['NAME']]
            labels[c] = [round(v, 1) for v in miller(p['LABEL_X'], p['LABEL_Y'])]
    for f in json.load(open(src110, encoding='utf-8'))['features']:
        c = code(f['properties'])
        if c in ('-99', 'AQ'):  # Антарктиду на карте не рисуем
            continue
        d = []
        for poly in polys(f['geometry']):
            for ring in poly:
                pts, last = [], None
                for lon, lat in ring:
                    x, y = miller(lon, lat)
                    pt = (round(x, 1), round(y, 1))
                    if pt != last:
                        pts.append(pt)
                        last = pt
                if len(pts) > 2:
                    d.append('M' + 'L'.join('%g %g' % pt for pt in pts) + 'Z')
        shapes[c] = shapes.get(c, '') + ''.join(d)
    # маленькие страны (Андорра, Мальта, Сингапур…) на карте 1:110m не видны — для них точка
    dots = {c: xy for c, xy in labels.items() if c not in shapes and c != 'AQ'}
    top = miller(0, 84)[1]
    js = ('/* Сгенерировано server/build_geo.py из Natural Earth (public domain). Руками не править. */\n'
          'window.WORLD = {\n  view: [0, %g, 1000, %g],\n  names: %s,\n  dots: %s,\n  shapes: %s\n};\n') % (
        round(top, 1), round(miller(0, -60)[1] - top, 1),
        json.dumps(names, ensure_ascii=False, sort_keys=True, separators=(',', ':')),
        json.dumps(dots, sort_keys=True, separators=(',', ':')),
        json.dumps(shapes, sort_keys=True, separators=(',', ':')))
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(js)
    print(dst, len(shapes), 'shapes', len(names), 'names', os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    build_lookup(sys.argv[1], os.path.join(HERE, 'geo', 'countries.json'))
    build_map(sys.argv[1], sys.argv[2], os.path.join(HERE, '..', 'assets', 'me', 'world.js'))
    if len(sys.argv) == 4:
        build_cities(sys.argv[3], os.path.join(HERE, 'geo', 'cities.json'))
