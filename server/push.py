"""pilotarbuza.com — уведомления на телефон для плана (Web Push).

Подписки, настройки и журнал отправок лежат в той же базе. Ключи VAPID создаются при первом запуске
и хранятся там же. Поток-планировщик раз в полминуты проверяет время (Турция, UTC+3) и шлёт:
  * утреннюю сводку: просроченное, сроки сегодня, ворота и дедлайны на неделю вперёд, шаги по контактам;
  * вечернее напоминание, если на завтра есть срок.
Пустую сводку не шлёт. Опоздавшую больше чем на 3 часа (сервер был выключен) — тоже.
"""
import json, sys, threading, time
from datetime import date, datetime, timedelta, timezone

import webpush

TZ = timezone(timedelta(hours=3))  # Турция, без перехода на летнее время
SUBJECT = 'https://pilotarbuza.com'
DEFAULTS = {'digest_on': True, 'digest_time': '08:30', 'evening_on': True, 'evening_time': '20:00',
            # университет (перенесено из бота Энн): утром пары на сегодня, перед первой парой, вечером на завтра
            'uni_morning_on': True, 'uni_morning_time': '07:40', 'uni_before_on': True, 'uni_before_min': 15,
            'uni_evening_on': True, 'uni_evening_time': '21:00', 'uni_paused': False}
UNI_URL = '/admin/plan/#uni'
SLOTS = {
    1: ('08:30', '09:15'), 2: ('09:25', '10:10'), 3: ('10:20', '11:05'), 4: ('11:15', '12:00'),
    5: ('12:10', '12:55'), 6: ('13:25', '14:10'), 7: ('14:20', '15:05'), 8: ('15:15', '16:00'),
    9: ('16:10', '16:55'), 10: ('17:00', '17:45'), 11: ('17:50', '18:35'), 12: ('18:40', '19:25'),
    13: ('19:30', '20:15'), 14: ('20:20', '21:05'), 15: ('21:10', '21:55'),
}
APP_URL = '/admin/plan/#today'
HOOKS = []  # другие разделы со своими напоминаниями: fn(con, now, settings) -> [(ключ журнала, сообщение)]


def init(con):
    con.execute('CREATE TABLE IF NOT EXISTS push_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, ua TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL)')
    con.execute('CREATE TABLE IF NOT EXISTS push_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    con.execute('CREATE TABLE IF NOT EXISTS push_log (key TEXT PRIMARY KEY, at TEXT NOT NULL)')
    if not _get(con, 'vapid_private'):
        priv, pub = webpush.new_keypair()
        _put(con, 'vapid_private', webpush.b64u(priv))
        _put(con, 'vapid_public', webpush.b64u(pub))


def _get(con, key):
    r = con.execute('SELECT value FROM push_kv WHERE key=?', [key]).fetchone()
    return json.loads(r[0]) if r else None


def _put(con, key, value):
    con.execute('INSERT INTO push_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, json.dumps(value)])


def settings(con):
    out = dict(DEFAULTS)
    for k in DEFAULTS:
        v = _get(con, k)
        if v is not None:
            out[k] = v
    return out


def update_settings(con, data):
    bad = []
    for k, v in data.items():
        if k not in DEFAULTS:
            continue
        if (k.endswith('_on') or k == 'uni_paused') and isinstance(v, bool):
            _put(con, k, v)
        elif k == 'uni_before_min' and isinstance(v, int) and not isinstance(v, bool) and 5 <= v <= 120:
            _put(con, k, v)
        elif k.endswith('_time') and isinstance(v, str) and len(v) == 5 and v[2] == ':' and v[:2].isdigit() and v[3:].isdigit() and int(v[:2]) < 24 and int(v[3:]) < 60:
            _put(con, k, v)
        else:
            bad.append(k)
    return bad


def info(con):
    subs = [dict(id=r['id'], ua=r['ua'], created_at=r['created_at'], host=r['endpoint'].split('/')[2]) for r in con.execute('SELECT * FROM push_subs ORDER BY id')]
    return {'public_key': _get(con, 'vapid_public'), 'settings': settings(con), 'subscriptions': subs}


def subscribe(con, data):
    keys = data.get('keys') if isinstance(data.get('keys'), dict) else {}
    endpoint, p256dh, auth = data.get('endpoint'), keys.get('p256dh'), keys.get('auth')
    if not (isinstance(endpoint, str) and webpush.endpoint_ok(endpoint) and len(endpoint) < 1000):
        return 'endpoint'
    try:
        webpush._point(webpush.unb64u(p256dh))
        if len(webpush.unb64u(auth)) < 8:
            raise ValueError
    except (ValueError, TypeError, AttributeError):
        return 'keys'
    ua = data.get('ua') if isinstance(data.get('ua'), str) else ''
    con.execute('INSERT INTO push_subs (endpoint, p256dh, auth, ua, created_at) VALUES (?,?,?,?,?) '
                'ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, ua=excluded.ua',
                [endpoint, p256dh, auth, ua[:120], datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')])
    return None


def unsubscribe(con, endpoint=None, sub_id=None):
    if sub_id:
        return con.execute('DELETE FROM push_subs WHERE id=?', [sub_id]).rowcount
    return con.execute('DELETE FROM push_subs WHERE endpoint=?', [endpoint]).rowcount


def send_all(db, message):
    """Отправить всем подпискам; мёртвые подписки удалить. Возвращает {'sent', 'removed', 'failed'}."""
    with db() as con:
        subs = [dict(r) for r in con.execute('SELECT * FROM push_subs')]
        priv, pub = webpush.unb64u(_get(con, 'vapid_private')), webpush.unb64u(_get(con, 'vapid_public'))
    res = {'sent': 0, 'removed': 0, 'failed': 0}
    for s in subs:
        code = webpush.send(s, message, priv, pub, SUBJECT)
        if 200 <= code < 300:
            res['sent'] += 1
        elif code in (404, 410):
            with db() as con:
                unsubscribe(con, s['endpoint'])
            res['removed'] += 1
        else:
            res['failed'] += 1
            print('push failed: %s %s' % (code, s['endpoint'].split('/')[2]), file=sys.stderr)
    return res


# ---------------- что сказать ----------------
RU_MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']


def _d(s):
    return date.fromisoformat(s)


def _human(d):
    return '%d %s' % (d.day, RU_MON[d.month - 1])


def _plural(n, one, few, many):
    a, b = abs(n) % 100, abs(n) % 10
    return many if 10 < a < 20 else few if 1 < b < 5 else one if b == 1 else many


def _short(text, n=56):
    return text if len(text) <= n else text[:n - 1].rstrip(' ,;:—') + '…'


def _name(t):
    title = t.get('title', '')
    code = t.get('code') or ''
    return _short(title if not code or title.startswith(code) else '%s %s' % (code, title))


def build(records, today, kind):
    """Текст уведомления на сегодня (kind='digest') или вечер накануне (kind='evening'); None — сказать нечего."""
    tasks = [t for t in records['tasks'] if t.get('kind') != 'phase' and t.get('status') != 'done' and t.get('end')]
    tomorrow = today + timedelta(days=1)
    lines = []
    if kind == 'evening':
        due = [t for t in tasks if _d(t['end']) == tomorrow]
        dl = [c for c in records['calendar'] if c.get('kind') == 'deadline' and _d(c['start']) == tomorrow]
        steps = [c for c in records['contacts'] if c.get('next_date') and c.get('status') != 'closed' and _d(c['next_date']) == tomorrow]
        lines += ['• %s' % _name(t) for t in due] + ['• %s' % c['title'] for c in dl] + ['• %s: %s' % (c['name'], _short(c.get('next_step') or 'следующий шаг', 48)) for c in steps]
        if not lines:
            return None
        n = len(lines)
        return {'title': 'Завтра срок: %d %s' % (n, _plural(n, 'пункт', 'пункта', 'пунктов')), 'body': _cut(lines), 'url': APP_URL, 'tag': 'evening-%s' % today}
    late = sorted([t for t in tasks if _d(t['end']) < today], key=lambda t: t['end'])
    due = [t for t in tasks if _d(t['end']) == today]
    start = [t for t in tasks if t.get('start') and _d(t['start']) == today and _d(t['end']) != today]
    gates = [t for t in tasks if t.get('kind') == 'milestone' and (_d(t['end']) - today).days in (1, 3, 7)]
    dls = [c for c in records['calendar'] if c.get('kind') == 'deadline' and (_d(c['start']) - today).days in (0, 1, 3, 7)]
    steps = [c for c in records['contacts'] if c.get('next_date') and c.get('status') != 'closed' and _d(c['next_date']) <= today]
    lines += ['• Срок сегодня: %s' % _name(t) for t in due]
    lines += ['• Начать: %s' % _name(t) for t in start]
    lines += ['• %s — через %d %s, %s' % (t.get('code') or t['title'], (_d(t['end']) - today).days, _plural((_d(t['end']) - today).days, 'день', 'дня', 'дней'), _human(_d(t['end']))) for t in gates]
    lines += ['• %s — %s' % (c['title'], 'сегодня' if _d(c['start']) == today else _human(_d(c['start']))) for c in dls]
    lines += ['• %s: %s' % (c['name'], _short(c.get('next_step') or 'следующий шаг', 48)) for c in steps]
    if late:
        lines.insert(0, '• Просрочено: %s' % (_name(late[0]) if len(late) == 1 else '%d %s, первая — %s' % (len(late), _plural(len(late), 'задача', 'задачи', 'задач'), _name(late[0]))))
    if not lines:
        return None
    parts = []
    if due:
        parts.append('%d %s со сроком сегодня' % (len(due), _plural(len(due), 'задача', 'задачи', 'задач')))
    if late:
        parts.append('просрочено %d' % len(late))
    title = 'План на %s' % _human(today) + (': ' + ', '.join(parts) if parts else '')
    return {'title': title, 'body': _cut(lines), 'url': APP_URL, 'tag': 'digest-%s' % today}


def _cut(lines, limit=5):
    if len(lines) <= limit:
        return '\n'.join(lines)
    return '\n'.join(lines[:limit - 1] + ['…и ещё %d' % (len(lines) - limit + 1)])


# ---------------- университет ----------------
def lessons_on(records, day, with_optional=True):
    return sorted((l for l in records.get('lessons', []) if l.get('weekday') == day.weekday() and (with_optional or not l.get('optional'))),
                  key=lambda l: (bool(l.get('optional')), l['first']))


def is_holiday(records, day):
    d = day.isoformat()
    return any(c.get('kind') == 'holiday' and c['start'] <= d <= c['end'] for c in records.get('calendar', []))


def _lesson_line(l):
    room = (', ауд. %s' % l['room']) if l.get('room') else ''
    return '%s–%s %s%s' % (SLOTS[l['first']][0], SLOTS[l['last']][1], l['course'], room)


def uni_message(records, day, kind, now=None):
    """Сообщение о парах: kind = 'morning' (на сегодня), 'evening' (day — завтрашняя дата), 'before' (перед первой парой)."""
    if is_holiday(records, day):
        return None
    must = lessons_on(records, day, with_optional=False)
    if not must:
        return None
    start, end = SLOTS[must[0]['first']][0], max(SLOTS[l['last']][1] for l in must)
    tag = 'uni-%s-%s' % (kind, day)
    if kind == 'before':
        first = must[0]
        mins = max(1, round((datetime.combine(day, datetime.strptime(start, '%H:%M').time(), TZ) - now).total_seconds() / 60))
        return {'title': 'Через %d мин — %s' % (mins, first['course']), 'body': _lesson_line(first) + ('\n' + first['teacher'] if first.get('teacher') else ''), 'url': UNI_URL, 'tag': tag}
    lines = [_lesson_line(l) for l in must]
    opt = [l for l in lessons_on(records, day) if l.get('optional')]
    if opt:
        lines.append('Можно не ходить: ' + ', '.join(l['course'] for l in opt))
    title = ('Пары сегодня: %s–%s' if kind == 'morning' else 'Завтра первая пара в %s, до %s') % (start, end)
    return {'title': title, 'body': _cut(lines), 'url': UNI_URL, 'tag': tag}


def uni_due(records, st, now):
    """Какие напоминания о парах пора отправить: список (ключ журнала, сообщение)."""
    if st['uni_paused']:
        return []
    today, out = now.date(), []

    def window(hm, grace=2 * 3600):  # как в боте: опоздавшее сообщение уходит в течение 2 часов
        h, m = map(int, hm.split(':'))
        return 0 <= (now - now.replace(hour=h, minute=m, second=0, microsecond=0)).total_seconds() < grace

    if st['uni_morning_on'] and window(st['uni_morning_time']):
        msg = uni_message(records, today, 'morning')
        if msg:
            out.append(('uni-morning:%s' % today, msg))
    if st['uni_before_on'] and not is_holiday(records, today):
        must = lessons_on(records, today, with_optional=False)
        if must:
            first = datetime.combine(today, datetime.strptime(SLOTS[must[0]['first']][0], '%H:%M').time(), TZ)
            if first - timedelta(minutes=st['uni_before_min']) <= now < first:
                out.append(('uni-before:%s' % today, uni_message(records, today, 'before', now)))
    if st['uni_evening_on'] and window(st['uni_evening_time']):
        msg = uni_message(records, today + timedelta(days=1), 'evening')
        if msg:
            out.append(('uni-evening:%s' % today, msg))
    return out


# ---------------- планировщик ----------------
def tick(db, crm, now=None):
    now = now or datetime.now(TZ)
    today, hm = now.date(), now.strftime('%H:%M')
    with db() as con:
        st = settings(con)
    for kind in ('digest', 'evening'):
        if not st[kind + '_on'] or hm < st[kind + '_time']:
            continue
        key = '%s:%s' % (kind, today)
        with db() as con:
            if con.execute('SELECT 1 FROM push_log WHERE key=?', [key]).fetchone():
                continue
            con.execute('INSERT INTO push_log (key, at) VALUES (?, ?)', [key, now.isoformat()])
            if not con.execute('SELECT 1 FROM push_subs LIMIT 1').fetchone():
                continue
            records = crm.all_records(con)
        h, m = map(int, st[kind + '_time'].split(':'))
        if (now - now.replace(hour=h, minute=m, second=0, microsecond=0)).total_seconds() > 3 * 3600:
            continue  # сервер был выключен — поздно
        msg = build(records, today, kind)
        if msg:
            res = send_all(db, msg)
            print('push %s: %s' % (key, res), file=sys.stderr)
    # пары: окно отправки считается внутри uni_due, журнал защищает от повторов
    with db() as con:
        if not con.execute('SELECT 1 FROM push_subs LIMIT 1').fetchone():
            return
        records = crm.all_records(con)
    due = uni_due(records, st, now)
    for hook in HOOKS:
        with db() as con:
            due += hook(con, now, st)
    for key, msg in due:
        with db() as con:
            if con.execute('SELECT 1 FROM push_log WHERE key=?', [key]).fetchone():
                continue
            con.execute('INSERT INTO push_log (key, at) VALUES (?, ?)', [key, now.isoformat()])
        print('push %s: %s' % (key, send_all(db, msg)), file=sys.stderr)


def start(db, crm):
    def loop():
        while True:
            try:
                tick(db, crm)
            except Exception as e:  # планировщик не должен падать
                print('push scheduler error:', type(e).__name__, e, file=sys.stderr)
            time.sleep(30)
    threading.Thread(target=loop, daemon=True, name='push-scheduler').start()
