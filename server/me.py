"""pilotarbuza.com/me — личное приложение: заметки, страны, документы, деньги, бриф. Только стандартная библиотека.

Записи (заметки, папки, документы, операции, подписки, долги, правила стран, поездки) лежат в таблице
`me_records` той же базы, что и заказы, — по образцу crm.py: вид записи, id и поля в JSON, поля описаны в SCHEMA.
Дни по странам — `me_days` (дата + страна), отметки геопозиции — `me_points`, бриф — `me_briefs`,
файлы (фото документов, картинки в заметках) — `me_files`, настройки и курсы валют — `me_kv`.

Страна по координатам определяется здесь же, по контурам Natural Earth 1:50m из server/geo/countries.json.

API после входа в админку (cookie):
  GET    /api/me/all                       всё сразу: записи, дни, настройки, ключи, последний бриф
  POST   /api/me/r/<kind>                  создать запись;  PATCH/DELETE /api/me/r/<kind>/<id>
  POST   /api/me/days                      {"add": [{"date", "country"}], "remove": [...], "source": "manual"}
  POST   /api/me/geo                       {"points": [[lat, lon], ...]} → {"countries": ["TR", null, ...]}
  GET    /api/me/points?date=YYYY-MM-DD    отметки за день
  GET    /api/me/briefs?before=<id>        бриф, по 20 штук, новые первыми
  POST   /api/me/keys/<track|brief>        выпустить новый ключ (старый перестаёт работать)
  POST   /api/me/settings                  настройки
  GET    /api/me/rates                     курсы валют к доллару (обновляются раз в 12 часов)
  POST   /api/me/files?rec=<id>&name=<имя> тело запроса — сам файл;  GET/DELETE /api/me/files/<id>

С ключом вместо cookie (заголовок Authorization: Bearer <ключ> или поле "key"), для «Быстрых команд» iPhone
и для задачи, которая собирает бриф:
  POST   /api/me/ping      ключ track: {"lat", "lon", "acc", "date": "YYYY-MM-DD"} — где я сейчас
  POST   /api/me/import    ключ track: {"points": [{"lat", "lon", "date"}]} или строки «lat;lon;дата» — фото из галереи
  POST   /api/me/brief     ключ brief: {"kind": "morning|evening", "text": "..."}
"""
import bisect, hashlib, json, math, os, re, secrets, sys, threading, unicodedata, urllib.request
from datetime import date, datetime, timedelta, timezone

import crm

TZ = timezone(timedelta(hours=3))
GEO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'geo', 'countries.json')
CITIES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'geo', 'cities.json')
CITY_NEAR_KM = 40  # дальше — «рядом с городом, N км»
CODE_RE = re.compile(r'[A-Z]{2}')
CURRENCY_RE = re.compile(r'[A-Z]{3}')
DOC_TYPES = ['passport', 'intpassport', 'id', 'visa', 'residence', 'license', 'medical', 'insurance', 'student', 'other']
TX_KINDS = ['expense', 'income']
PERIODS = ['week', 'month', 'quarter', 'year']
DEBT_DIRS = ['they_owe', 'i_owe']
RULE_MODES = ['rolling', 'year', 'since']
RULE_GOALS = ['max', 'min']
SOURCES = ['auto', 'photo', 'manual', 'import']
FILE_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/pdf'}
MAX_FILE = 10 * 1024 * 1024
KEY_NAMES = ['track', 'brief']

SCHEMA = {
    'folders': {'name': ('str', 80, True), 'order': ('int', 0, 10 ** 7)},
    'notes': {
        'folder': ('ref', 'folders'), 'title': ('str', 200), 'body': ('html', 200000), 'text': ('text', 200000),
        'pinned': ('bool',), 'deleted': ('date',), 'edited': ('stamp',),
    },
    'docs': {
        'type': ('enum', DOC_TYPES), 'title': ('str', 160, True), 'holder': ('str', 120), 'number': ('str', 80),
        'country': ('code',), 'issuer': ('str', 160), 'issued': ('date',), 'expires': ('date',),
        'remind': ('ints', 0, 400, 8), 'notes': ('text', 4000),
    },
    'tx': {
        'kind': ('enum', TX_KINDS), 'date': ('date', True), 'amount': ('num', 0, 10 ** 10, True), 'currency': ('cur',),
        'category': ('str', 40), 'account': ('str', 40), 'note': ('str', 300), 'sub': ('ref', 'subs'),
    },
    'subs': {
        'name': ('str', 120, True), 'amount': ('num', 0, 10 ** 9), 'currency': ('cur',), 'period': ('enum', PERIODS),
        'next': ('date',), 'category': ('str', 40), 'active': ('bool',), 'note': ('str', 300),
    },
    'debts': {
        'person': ('str', 120, True), 'dir': ('enum', DEBT_DIRS), 'amount': ('num', 0, 10 ** 10), 'currency': ('cur',),
        'date': ('date',), 'due': ('date',), 'note': ('str', 300), 'settled': ('bool',),
    },
    'budgets': {'category': ('str', 40, True), 'amount': ('num', 0, 10 ** 10), 'currency': ('cur',)},
    'rules': {  # ограничения по дням: Шенген 90/180, налоговое резидентство и т.п.
        'name': ('str', 80, True), 'countries': ('codes', 60), 'mode': ('enum', RULE_MODES), 'window': ('int', 1, 3660),
        'limit': ('int', 1, 3660), 'goal': ('enum', RULE_GOALS), 'warn': ('int', 0, 365), 'since': ('date',),
        'on': ('bool',), 'tile': ('bool',), 'order': ('int', 0, 10 ** 7), 'note': ('str', 300),
    },
    'places': {  # город, добавленный вручную (без отметок и фото)
        'city': ('int', 0, 10 ** 6, True), 'date': ('date',), 'note': ('str', 200),
    },
    'trips': {  # запланированные поездки — для проверки правил наперёд
        'country': ('code', True), 'start': ('date', True), 'end': ('date', True), 'note': ('str', 200),
    },
}
DEFAULTS = {
    'notes': {'pinned': False, 'deleted': None, 'body': '', 'text': ''},
    'docs': {'type': 'other', 'remind': [90, 30, 7, 1]},
    'tx': {'kind': 'expense', 'currency': 'TRY'},
    'subs': {'period': 'month', 'currency': 'TRY', 'active': True},
    'debts': {'dir': 'they_owe', 'currency': 'TRY', 'settled': False},
    'budgets': {'currency': 'TRY'},
    'rules': {'mode': 'rolling', 'window': 180, 'limit': 90, 'goal': 'max', 'warn': 10, 'on': True, 'tile': True, 'countries': []},
}
KINDS = list(SCHEMA)
SCHENGEN = ['AT', 'BE', 'BG', 'CH', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IS', 'IT', 'LI', 'LT',
            'LU', 'LV', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK']
SEED_RULES = [
    {'name': 'Шенген 90/180', 'countries': SCHENGEN, 'mode': 'rolling', 'window': 180, 'limit': 90, 'goal': 'max', 'warn': 15, 'order': 10,
     'note': 'Не больше 90 дней в любые 180 дней подряд, день въезда и выезда считаются.'},
    {'name': 'Налоговый резидент РФ', 'countries': ['RU'], 'mode': 'year', 'window': 365, 'limit': 183, 'goal': 'min', 'warn': 30, 'order': 20,
     'note': '183 дня в России за календарный год — резидент, НДФЛ 13–15%. Меньше — нерезидент, 30%.'},
    {'name': 'Турция за год', 'countries': ['TR'], 'mode': 'year', 'window': 365, 'limit': 183, 'goal': 'min', 'warn': 0, 'tile': False, 'order': 30,
     'note': 'Сколько дней в году прожито в Турции — пригодится для икамета и налогов.'},
]
SETTINGS = {'name': 'Максим', 'base_currency': 'TRY', 'home': 'TR', 'track_on_open': True, 'brief_push': False,
            'gap_fill': False, 'money_categories': None}


def init(con):
    con.execute('''CREATE TABLE IF NOT EXISTS me_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)''')
    con.execute('CREATE INDEX IF NOT EXISTS me_records_kind ON me_records(kind)')
    con.execute('''CREATE TABLE IF NOT EXISTS me_days (
        date TEXT NOT NULL, country TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (date, country))''')
    con.execute('''CREATE TABLE IF NOT EXISTS me_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, date TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
        acc REAL, country TEXT, source TEXT NOT NULL)''')
    con.execute('CREATE INDEX IF NOT EXISTS me_points_date ON me_points(date)')
    con.execute('''CREATE TABLE IF NOT EXISTS me_briefs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, date TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL)''')
    con.execute('''CREATE TABLE IF NOT EXISTS me_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT, rec INTEGER, name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL,
        data BLOB NOT NULL, created_at TEXT NOT NULL)''')
    con.execute('CREATE TABLE IF NOT EXISTS me_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    con.execute('CREATE TABLE IF NOT EXISTS me_keys (name TEXT PRIMARY KEY, hash TEXT NOT NULL, created_at TEXT NOT NULL, last_used TEXT)')
    if not kv_get(con, 'seeded'):
        for r in SEED_RULES:
            create(con, 'rules', r)
        create(con, 'folders', {'name': 'Заметки', 'order': 10})
        kv_put(con, 'seeded', True)


def _now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def kv_get(con, key, default=None):
    r = con.execute('SELECT value FROM me_kv WHERE key=?', [key]).fetchone()
    return json.loads(r[0]) if r else default


def kv_put(con, key, value):
    con.execute('INSERT INTO me_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, json.dumps(value, ensure_ascii=False)])


# ---------------- записи ----------------
def _field(spec, value):
    t = spec[0]
    if t in ('code', 'cur', 'stamp') and value in (None, ''):
        return None
    if t == 'html':
        if value is None:
            return ''
        if not isinstance(value, str):
            raise ValueError
        return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', value)[:spec[1]]
    if t == 'num':
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError
        return round(max(spec[1], min(spec[2], float(value))), 2)
    if t == 'code':
        if not isinstance(value, str) or not CODE_RE.fullmatch(value):
            raise ValueError
        return value
    if t == 'cur':
        if not isinstance(value, str) or not CURRENCY_RE.fullmatch(value):
            raise ValueError
        return value
    if t == 'codes':
        if not isinstance(value, list) or len(value) > spec[1] or not all(isinstance(v, str) and CODE_RE.fullmatch(v) for v in value):
            raise ValueError
        return sorted(set(value))
    if t == 'ints':
        if not isinstance(value, list) or len(value) > spec[3]:
            raise ValueError
        if any(isinstance(v, bool) or not isinstance(v, int) or not spec[1] <= v <= spec[2] for v in value):
            raise ValueError
        return sorted(set(value), reverse=True)
    if t == 'stamp':
        if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z', value):
            raise ValueError
        return value[:19] + 'Z'
    return crm._field(spec, value)


def validate(kind, data, current=None):
    if not isinstance(data, dict):
        raise crm.Bad('json')
    schema, out, bad = SCHEMA[kind], dict(current or DEFAULTS.get(kind, {})), []
    for key, value in data.items():
        if key in schema:
            try:
                out[key] = _field(schema[key], value)
            except (ValueError, TypeError):
                bad.append(key)
    for key, spec in schema.items():
        if spec[-1] is True and out.get(key) in (None, ''):
            bad.append(key)
    if kind == 'trips' and out.get('start') and out.get('end') and out['end'] < out['start']:
        bad.append('end')
    if bad:
        raise crm.Bad('fields', fields=sorted(set(bad)))
    return out


def _row(r):
    d = json.loads(r['data'])
    d['id'], d['updated_at'], d['created_at'] = r['id'], r['updated_at'], r['created_at']
    return d


def get(con, kind, rid):
    r = con.execute('SELECT * FROM me_records WHERE id=? AND kind=?', [rid, kind]).fetchone()
    return _row(r) if r else None


def records(con, kind):
    return [_row(r) for r in con.execute('SELECT * FROM me_records WHERE kind=? ORDER BY id', [kind])]


def _check_refs(con, kind, rec):
    for key, spec in SCHEMA[kind].items():
        if spec[0] == 'ref' and rec.get(key) and not get(con, spec[1], rec[key]):
            raise crm.Bad('fields', fields=[key])


def _save(con, rid, rec):
    data = {k: v for k, v in rec.items() if k not in ('id', 'updated_at', 'created_at')}
    ts = _now()
    con.execute('UPDATE me_records SET data=?, updated_at=? WHERE id=?', [json.dumps(data, ensure_ascii=False), ts, rid])
    rec['id'], rec['updated_at'] = rid, ts
    return rec


def create(con, kind, data):
    rec = validate(kind, data)
    _check_refs(con, kind, rec)
    ts = _now()
    cur = con.execute('INSERT INTO me_records (kind, data, created_at, updated_at) VALUES (?,?,?,?)', [kind, '{}', ts, ts])
    rec['created_at'] = ts
    return _save(con, cur.lastrowid, rec)


def update(con, kind, rid, data):
    current = get(con, kind, rid)
    if not current:
        return None
    rec = validate(kind, data, current)
    _check_refs(con, kind, rec)
    return _save(con, rid, rec)


def delete(con, kind, rid):
    """Удаляет запись; заметки из удалённой папки переезжают в «Недавно удалённые», файлы записи — вместе с ней."""
    if not get(con, kind, rid):
        return None
    if kind == 'folders':
        for n in records(con, 'notes'):
            if n.get('folder') == rid:
                _save(con, n['id'], dict(n, folder=None, deleted=n.get('deleted') or date.today().isoformat()))
    if kind == 'subs':
        for t in records(con, 'tx'):
            if t.get('sub') == rid:
                _save(con, t['id'], dict(t, sub=None))
    con.execute('DELETE FROM me_files WHERE rec=?', [rid])
    con.execute('DELETE FROM me_records WHERE id=?', [rid])
    return {'deleted': [rid]}


def purge_notes(con, today=None):
    """«Недавно удалённые» хранятся 30 дней, как на iPhone."""
    limit = ((today or date.today()) - timedelta(days=30)).isoformat()
    for n in records(con, 'notes'):
        if n.get('deleted') and n['deleted'] < limit:
            delete(con, 'notes', n['id'])


# ---------------- настройки, ключи ----------------
def settings(con):
    out = dict(SETTINGS)
    out.update({k: v for k, v in (kv_get(con, 'settings') or {}).items() if k in SETTINGS})
    return out


def update_settings(con, data):
    cur, bad = settings(con), []
    for k, v in data.items():
        if k not in SETTINGS:
            continue
        if k in ('track_on_open', 'brief_push', 'gap_fill') and isinstance(v, bool):
            cur[k] = v
        elif k == 'name' and isinstance(v, str) and len(v.strip()) <= 40:
            cur[k] = v.strip()
        elif k == 'base_currency' and isinstance(v, str) and CURRENCY_RE.fullmatch(v):
            cur[k] = v
        elif k == 'home' and isinstance(v, str) and CODE_RE.fullmatch(v):
            cur[k] = v
        elif k == 'money_categories' and (v is None or (isinstance(v, list) and len(v) <= 60 and all(
                isinstance(c, list) and len(c) == 3 and all(isinstance(x, str) and 0 < len(x) <= 40 for x in c) for c in v))):
            cur[k] = v
        else:
            bad.append(k)
    if not bad:
        kv_put(con, 'settings', {k: v for k, v in cur.items() if k in SETTINGS})
    return bad


def _hash(key):
    return hashlib.sha256(key.encode()).hexdigest()


def new_key(con, name):
    key = 'me_' + secrets.token_urlsafe(24)
    con.execute('INSERT INTO me_keys (name, hash, created_at) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET hash=excluded.hash, created_at=excluded.created_at, last_used=NULL',
                [name, _hash(key), _now()])
    return key


def check_key(con, name, key):
    if not isinstance(key, str) or not key.startswith('me_'):
        return False
    r = con.execute('SELECT hash FROM me_keys WHERE name=?', [name]).fetchone()
    if not r or not secrets.compare_digest(r[0], _hash(key)):
        return False
    con.execute('UPDATE me_keys SET last_used=? WHERE name=?', [_now(), name])
    return True


def keys_info(con):
    return {r['name']: {'created_at': r['created_at'], 'last_used': r['last_used']} for r in con.execute('SELECT * FROM me_keys')}


# ---------------- страны по координатам ----------------
_GEO = None
_GEO_LOCK = threading.Lock()


def _geo():
    global _GEO
    with _GEO_LOCK:
        if _GEO is None:
            with open(GEO_PATH, encoding='utf-8') as f:
                polys = json.load(f)
            polys.sort(key=lambda p: p['b'][0])
            _GEO = (polys, [p['b'][0] for p in polys])
        return _GEO


def _inside(ring, x, y):
    hit, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def _seg_km(x, y, a, b):
    """Расстояние от точки до отрезка, км (плоское приближение, годится для десятков километров)."""
    k = math.cos(math.radians(y))
    ax, ay, bx, by = (a[0] - x) * k, a[1] - y, (b[0] - x) * k, b[1] - y
    dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
    return math.hypot(ax + t * dx, ay + t * dy) * 111.2


def country_at(lat, lon, near_km=25):
    """Код страны (ISO 3166-1 alpha-2) по координатам. Точка у берега или на границе — ближайшая страна в пределах near_km."""
    polys, xs = _geo()
    pad = near_km / 80
    near = [p for p in polys[:bisect.bisect_right(xs, lon + pad)] if p['b'][2] >= lon - pad and p['b'][1] - pad <= lat <= p['b'][3] + pad]
    for p in near:
        b = p['b']
        if b[0] <= lon <= b[2] and b[1] <= lat <= b[3] and _inside(p['r'][0], lon, lat) and not any(_inside(h, lon, lat) for h in p['r'][1:]):
            return p['c']
    best, best_d = None, near_km
    for p in near:
        ring = p['r'][0]
        for i in range(len(ring) - 1):
            d = _seg_km(lon, lat, ring[i], ring[i + 1])
            if d < best_d:
                best, best_d = p['c'], d
    return best


def _coord(v, lo, hi):
    if isinstance(v, str):
        v = v.strip().replace(',', '.')
        try:
            v = float(v)
        except ValueError:
            raise ValueError
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not lo <= v <= hi:
        raise ValueError
    return float(v)


DATE_ANY = re.compile(r'(\d{4})[-./:](\d{1,2})[-./:](\d{1,2})|(\d{1,2})[./](\d{1,2})[./](\d{4})')
DATE_WORDS = re.compile(r'(\d{1,2})\s+([^\W\d_]+)\.?\s+(\d{4})')
# начало названия месяца по-русски, по-английски и по-турецки → номер
MONTH_WORDS = [('янв', 1), ('фев', 2), ('мар', 3), ('апр', 4), ('мая', 5), ('май', 5), ('июн', 6), ('июл', 7), ('авг', 8),
               ('сен', 9), ('окт', 10), ('ноя', 11), ('дек', 12), ('jan', 1), ('feb', 2), ('mar', 3), ('apr', 4), ('may', 5),
               ('jun', 6), ('jul', 7), ('aug', 8), ('sep', 9), ('oct', 10), ('nov', 11), ('dec', 12), ('oca', 1), ('şub', 2),
               ('nis', 4), ('haz', 6), ('tem', 7), ('ağu', 8), ('eyl', 9), ('eki', 10), ('kas', 11), ('ara', 12)]


def parse_date(v):
    """«2026-10-25», «2026:10:25 14:02», «25.10.2026, 14:02», «25 окт. 2026 г.» → '2026-10-25'."""
    if not isinstance(v, str):
        raise ValueError
    m = DATE_ANY.search(v)
    if m:
        y, mo, d = (m.group(1), m.group(2), m.group(3)) if m.group(1) else (m.group(6), m.group(5), m.group(4))
        return date(int(y), int(mo), int(d)).isoformat()
    m = DATE_WORDS.search(v.lower())
    if m:
        mo = next((n for w, n in MONTH_WORDS if m.group(2).startswith(w)), None)
        if mo:
            return date(int(m.group(3)), mo, int(m.group(1))).isoformat()
    raise ValueError


# ---------------- города ----------------
_CITIES = None


def _cities():
    """Города и сетка 1°×1° для быстрого поиска ближайшего."""
    global _CITIES
    with _GEO_LOCK:
        if _CITIES is None:
            with open(CITIES_PATH, encoding='utf-8') as f:
                rows = json.load(f)
            grid = {}
            for i, r in enumerate(rows):
                grid.setdefault((math.floor(r[0]), math.floor(r[1])), []).append(i)
            _CITIES = (rows, grid)
        return _CITIES


def _km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = 0.5 - math.cos((lat2 - lat1) * p) / 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2
    return 12742 * math.asin(math.sqrt(max(0, a)))


def city_at(lat, lon):
    """Ближайший город: (номер в cities.json, км). Ищет в соседних клетках сетки, расширяя круг до ~3°."""
    rows, grid = _cities()
    cy, cx = math.floor(lat), math.floor(lon)
    best = (None, 1e9)
    for ring in range(4):
        for dy in range(-ring, ring + 1):
            for dx in range(-ring, ring + 1):
                if max(abs(dy), abs(dx)) != ring:
                    continue
                for i in grid.get((cy + dy, (cx + dx + 180) % 360 - 180), []):
                    r = rows[i]
                    d = _km(lat, lon, r[0], r[1])
                    if d < best[1]:
                        best = (i, d)
        if best[0] is not None and best[1] < ring * 80:
            break
    return best


def city_info(i):
    r = _cities()[0][i]
    # название — английское, native — местное написание (İstanbul, Москва, თბილისი), ru — для поиска
    return {'id': i, 'name': r[3], 'native': r[6], 'ru': r[2], 'country': r[4], 'lat': r[0], 'lon': r[1], 'pop': r[5]}


def _fold(text):
    """Для поиска: без регистра и диакритики (İstanbul, Muğla, Şəki находятся по istanbul, mugla, seki)."""
    return ''.join(ch for ch in unicodedata.normalize('NFKD', text.casefold()) if not unicodedata.combining(ch)).replace('ı', 'i')


def search_cities(q, limit=20):
    q = _fold((q or '').strip())
    if len(q) < 2:
        return []
    rows = _cities()[0]
    pop = lambda i: -rows[i][5]
    names = lambda r: (_fold(r[2]), _fold(r[3]), _fold(r[6]))
    first = sorted((i for i, r in enumerate(rows) if any(n.startswith(q) for n in names(r))), key=pop)
    seen = set(first)
    rest = sorted((i for i, r in enumerate(rows) if i not in seen and any(q in n for n in names(r))), key=pop)
    return [city_info(i) for i in (first + rest)[:limit]]


def cities(con):
    """Где я был: отметки и фото → ближайший город; плюс города, добавленные вручную.
    Для каждого города — дни (даты), первая и последняя, сколько отметок; далёкие точки — «рядом с», с расстоянием."""
    cache, out = {}, {}
    for r in con.execute('SELECT date, lat, lon, country, source FROM me_points'):
        key = (round(r['lat'], 2), round(r['lon'], 2))
        if key not in cache:
            cache[key] = city_at(r['lat'], r['lon'])
        i, km = cache[key]
        if i is None or not r['country'] or km > 100:  # море, полёт или глушь — не город
            continue
        c = out.setdefault(i, {'dates': set(), 'n': 0, 'km': km, 'country': r['country'], 'sources': set()})
        c['dates'].add(r['date'])
        c['n'] += 1
        c['km'] = min(c['km'], km)
        c['sources'].add(r['source'])
        if r['country']:
            c['country'] = r['country']
    for p in records(con, 'places'):
        if 0 <= p['city'] < len(_cities()[0]):
            c = out.setdefault(p['city'], {'dates': set(), 'n': 0, 'km': 0, 'country': None, 'sources': set()})
            c['km'] = 0
            if p.get('date'):
                c['dates'].add(p['date'])
            c['sources'].add('manual')
            c.setdefault('place_ids', []).append(p['id'])
    res = []
    for i, c in out.items():
        info = city_info(i)
        ds = sorted(c['dates'])
        res.append(dict(info, country=c['country'] or info['country'], days=len(ds), dates=ds, first=ds[0] if ds else None, last=ds[-1] if ds else None,
                        points=c['n'], near=c['km'] > CITY_NEAR_KM, km=round(c['km']), sources=sorted(c['sources']), place_ids=c.get('place_ids', [])))
    res.sort(key=lambda x: (x['last'] or '', x['days']), reverse=True)
    return res


# ---------------- дни ----------------
RANK = {'auto': 1, 'import': 2, 'photo': 2, 'manual': 3}


def days(con):
    return [[r['date'], r['country'], r['source']] for r in con.execute('SELECT * FROM me_days ORDER BY date, country')]


def add_day(con, d, country, source):
    r = con.execute('SELECT source FROM me_days WHERE date=? AND country=?', [d, country]).fetchone()
    if r and RANK.get(r[0], 0) >= RANK[source]:
        return False
    con.execute('INSERT INTO me_days (date, country, source, created_at) VALUES (?,?,?,?) ON CONFLICT(date, country) DO UPDATE SET source=excluded.source',
                [d, country, source, _now()])
    return True


def edit_days(con, data):
    src = data.get('source', 'manual')
    if src not in SOURCES:
        raise crm.Bad('fields', fields=['source'])
    items = []
    for key in ('add', 'remove'):
        lst = data.get(key) or []
        if not isinstance(lst, list) or len(lst) > 4000:
            raise crm.Bad('fields', fields=[key])
        for it in lst:
            try:
                d, c = crm._date(it.get('date')), it.get('country')
                if not (isinstance(c, str) and CODE_RE.fullmatch(c)):
                    raise ValueError
            except (ValueError, TypeError, AttributeError):
                raise crm.Bad('fields', fields=[key])
            items.append((key, d, c))
    added = removed = 0
    for key, d, c in items:
        if key == 'remove':
            removed += con.execute('DELETE FROM me_days WHERE date=? AND country=?', [d, c]).rowcount
        elif add_day(con, d, c, src):
            added += 1
    return {'added': added, 'removed': removed, 'days': days(con)}


def add_point(con, lat, lon, d, source, acc=None):
    c = country_at(lat, lon)
    con.execute('INSERT INTO me_points (at, date, lat, lon, acc, country, source) VALUES (?,?,?,?,?,?,?)', [_now(), d, lat, lon, acc, c, source])
    if c:
        add_day(con, d, c, 'auto' if source == 'auto' else 'photo')
    return c


def ping(con, data):
    try:
        lat, lon = _coord(data.get('lat'), -90, 90), _coord(data.get('lon'), -180, 180)
    except ValueError:
        raise crm.Bad('fields', fields=['lat', 'lon'])
    try:
        d = parse_date(data['date']) if data.get('date') else datetime.now(TZ).date().isoformat()
    except ValueError:
        raise crm.Bad('fields', fields=['date'])
    try:
        acc = _coord(data['acc'], 0, 10 ** 6) if data.get('acc') not in (None, '') else None
    except ValueError:
        acc = None
    c = add_point(con, lat, lon, d, 'auto')
    return {'ok': True, 'date': d, 'country': c}


def import_points(con, points):
    """Фото из галереи: точки (широта, долгота, дата снимка) → дни. Одинаковые места за день не дублируются."""
    if not isinstance(points, list) or len(points) > 20000:
        raise crm.Bad('fields', fields=['points'])
    seen, per_day, bad = set(), {}, 0
    for p in points:
        try:
            lat, lon, d = _coord(p.get('lat'), -90, 90), _coord(p.get('lon'), -180, 180), parse_date(p.get('date'))
        except (ValueError, TypeError, AttributeError):
            bad += 1
            continue
        key = (d, round(lat, 2), round(lon, 2))
        if key in seen:
            continue
        seen.add(key)
        c = add_point(con, lat, lon, d, 'photo')
        if c:
            per_day.setdefault(d, set()).add(c)
    return {'ok': True, 'photos': len(points), 'skipped': bad, 'days': len(per_day),
            'countries': sorted({c for s in per_day.values() for c in s})}


def parse_lines(text):
    """Строки «широта;долгота;дата» (так их удобно собирать в «Быстрых командах»)."""
    out = []
    for line in text.splitlines():
        parts = [x.strip() for x in re.split(r'[;\t|]', line) if x.strip()]
        if len(parts) >= 3:
            out.append({'lat': parts[0], 'lon': parts[1], 'date': parts[2]})
    return out


def points_on(con, d):
    return [dict(r) for r in con.execute('SELECT id, at, date, lat, lon, acc, country, source FROM me_points WHERE date=? ORDER BY id', [d])]


def last_ping(con):
    r = con.execute("SELECT at, date, country FROM me_points WHERE source='auto' ORDER BY id DESC LIMIT 1").fetchone()
    return dict(r) if r else None


# ---------------- бриф ----------------
def add_brief(con, data):
    kind, text = data.get('kind'), data.get('text')
    if kind not in ('morning', 'evening', 'other') or not isinstance(text, str) or not text.strip():
        raise crm.Bad('fields', fields=['kind', 'text'])
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text).strip()[:200000]
    d = datetime.now(TZ).date().isoformat()
    cur = con.execute('INSERT INTO me_briefs (kind, date, text, created_at) VALUES (?,?,?,?)', [kind, d, text, _now()])
    return {'ok': True, 'id': cur.lastrowid}


def briefs(con, before=None, limit=20):
    q, args = 'SELECT * FROM me_briefs', []
    if before:
        q, args = q + ' WHERE id < ?', [before]
    return [dict(r) for r in con.execute(q + ' ORDER BY id DESC LIMIT ?', args + [limit])]


# ---------------- файлы ----------------
def files_meta(con):
    return [dict(r) for r in con.execute('SELECT id, rec, name, type, size, created_at FROM me_files ORDER BY id')]


def add_file(con, rec, name, ctype, data):
    if ctype not in FILE_TYPES:
        raise crm.Bad('fields', fields=['type'])
    if rec is not None and not con.execute('SELECT 1 FROM me_records WHERE id=?', [rec]).fetchone():
        raise crm.Bad('fields', fields=['rec'])
    name = re.sub(r'[\x00-\x1f/\\"]', '', name or 'file')[:120] or 'file'
    cur = con.execute('INSERT INTO me_files (rec, name, type, size, data, created_at) VALUES (?,?,?,?,?,?)', [rec, name, ctype, len(data), data, _now()])
    return {'id': cur.lastrowid, 'rec': rec, 'name': name, 'type': ctype, 'size': len(data)}


# ---------------- курсы валют ----------------
RATES_URL = 'https://open.er-api.com/v6/latest/USD'
_RATES_BUSY = threading.Lock()


def rates(db):
    """Курсы к доллару из кэша; если им больше 12 часов — в фоне обновить."""
    with db() as con:
        cached = kv_get(con, 'rates')
    fresh = cached and (datetime.now(timezone.utc) - datetime.fromisoformat(cached['at'])).total_seconds() < 12 * 3600
    if not fresh and _RATES_BUSY.acquire(blocking=False):
        def fetch():
            try:
                with urllib.request.urlopen(RATES_URL, timeout=10) as r:
                    d = json.load(r)
                if d.get('result') == 'success' and isinstance(d.get('rates'), dict):
                    keep = {k: v for k, v in d['rates'].items() if CURRENCY_RE.fullmatch(k) and isinstance(v, (int, float)) and v > 0}
                    with db() as con:
                        kv_put(con, 'rates', {'at': datetime.now(timezone.utc).isoformat(), 'rates': keep})
            except Exception as e:  # без сети приложение покажет прошлые курсы
                print('rates fetch failed:', type(e).__name__, file=sys.stderr)
            finally:
                _RATES_BUSY.release()
        threading.Thread(target=fetch, daemon=True).start()
    return cached or {'at': None, 'rates': {'USD': 1}}


# ---------------- всё сразу ----------------
def everything(con):
    purge_notes(con)
    out = {k: records(con, k) for k in KINDS}
    out.update(days=days(con), settings=settings(con), keys=keys_info(con), last_ping=last_ping(con),
               files=files_meta(con), brief=briefs(con, limit=2), rates=kv_get(con, 'rates'),
               meta={'doc_types': DOC_TYPES, 'periods': PERIODS, 'schengen': SCHENGEN})
    return out


# ---------------- правила по дням ----------------
def rule_usage(rule, day_map, today):
    """Сколько дней по правилу набрано на сегодня. day_map: дата ISO → множество стран."""
    cs = set(rule.get('countries') or [])
    if rule.get('mode') == 'year':
        start = date(today.year, 1, 1)
    elif rule.get('mode') == 'since' and rule.get('since'):
        start = date.fromisoformat(rule['since'])
    else:
        start = today - timedelta(days=rule.get('window', 180) - 1)
    n, d = 0, start
    while d <= today:
        if day_map.get(d.isoformat(), set()) & cs:
            n += 1
        d += timedelta(days=1)
    return n


# ---------------- напоминания (вызывает планировщик push.py) ----------------
DOC_NAMES = {'passport': 'Паспорт', 'intpassport': 'Загранпаспорт', 'id': 'Удостоверение', 'visa': 'Виза', 'residence': 'Икамет',
             'license': 'Лицензия', 'medical': 'Медкомиссия', 'insurance': 'Страховка', 'student': 'Студенческий', 'other': 'Документ'}


def _plural(n, one, few, many):
    a, b = abs(n) % 100, abs(n) % 10
    return many if 10 < a < 20 else few if 1 < b < 5 else one if b == 1 else many


def due(con, now, st):
    """Что пора прислать из личного приложения: список (ключ журнала, сообщение)."""
    today, hm, out = now.date(), now.strftime('%H:%M'), []
    morning = hm >= st.get('digest_time', '08:30')
    evening = hm >= st.get('evening_time', '20:00')
    if morning:
        for d in records(con, 'docs'):
            if not d.get('expires'):
                continue
            left = (date.fromisoformat(d['expires']) - today).days
            if left in (d.get('remind') or []) or left == 0:
                title = '%s: срок %s' % (d['title'], 'истекает сегодня' if left == 0 else 'через %d %s' % (left, _plural(left, 'день', 'дня', 'дней')))
                out.append(('me-doc:%d:%d:%s' % (d['id'], left, d['expires']), {
                    'title': title, 'body': '%s, действует до %s' % (DOC_NAMES.get(d.get('type'), 'Документ'), date.fromisoformat(d['expires']).strftime('%d.%m.%Y')),
                    'url': '/me/#docs/%d' % d['id'], 'tag': 'me-doc-%d' % d['id']}))
        day_map = {}
        for dd, c, _ in days(con):
            day_map.setdefault(dd, set()).add(c)
        for r in records(con, 'rules'):
            if not r.get('on') or r.get('goal') != 'max' or not r.get('warn'):
                continue
            left = r['limit'] - rule_usage(r, day_map, today)
            if left <= r['warn'] and left in (r['warn'], 10, 5, 3, 1, 0) or left < 0:
                out.append(('me-rule:%d:%d:%s' % (r['id'], left, today.isoformat() if left < 0 else today.year), {
                    'title': '%s: %s' % (r['name'], 'лимит превышен на %d дн.' % -left if left < 0 else 'осталось %d %s' % (left, _plural(left, 'день', 'дня', 'дней'))),
                    'body': 'Проверьте планы поездок в разделе «Страны».', 'url': '/me/#countries', 'tag': 'me-rule-%d' % r['id']}))
    if evening:
        tomorrow = (today + timedelta(days=1)).isoformat()
        for s in records(con, 'subs'):
            if s.get('active') and s.get('next') == tomorrow:
                out.append(('me-sub:%d:%s' % (s['id'], tomorrow), {
                    'title': 'Завтра списание: %s' % s['name'], 'body': '%g %s' % (s.get('amount') or 0, s.get('currency') or ''),
                    'url': '/me/#money/subs', 'tag': 'me-sub-%d' % s['id']}))
        for d in records(con, 'debts'):
            if not d.get('settled') and d.get('due') == tomorrow:
                who = 'Вам должны вернуть' if d.get('dir') == 'they_owe' else 'Вернуть долг'
                out.append(('me-debt:%d:%s' % (d['id'], tomorrow), {
                    'title': '%s завтра: %s' % (who, d['person']), 'body': '%g %s' % (d.get('amount') or 0, d.get('currency') or ''),
                    'url': '/me/#money/debts', 'tag': 'me-debt-%d' % d['id']}))
    # автоотслеживание молчит больше 36 часов — один раз в день, в полдень
    if hm >= '12:00' and con.execute("SELECT 1 FROM me_keys WHERE name='track'").fetchone():
        lp = last_ping(con)
        if lp and (datetime.now(timezone.utc) - datetime.fromisoformat(lp['at'].replace('Z', '+00:00'))).total_seconds() > 36 * 3600:
            out.append(('me-silent:%s' % today, {
                'title': 'Автоотслеживание стран молчит', 'body': 'Последняя отметка — %s. Проверьте автоматизацию в «Быстрых командах».' % lp['date'],
                'url': '/me/#countries/setup', 'tag': 'me-silent'}))
    return out
