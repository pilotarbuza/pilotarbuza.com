#!/usr/bin/env python3
"""pilotarbuza.com — приём предзаказов и админка. Только стандартная библиотека Python 3.9+.

Запуск:   python3 orders.py --env-file /etc/pilotarbuza/orders.env
Пароль:   python3 orders.py hash        (печатает строку для ADMIN_PASSWORD_HASH)
Локально: python3 orders.py --env-file dev.env --static ..   (заодно раздаёт сам сайт)

Настройки (переменные окружения или строки KEY=VALUE в --env-file):
  ADMIN_PASSWORD_HASH  обязательно; без него вход в админку закрыт
  ORDERS_DB            путь к базе SQLite, по умолчанию ~/.pilotarbuza/orders.db (не кладите её в папку сайта)
  ORDERS_HOST/PORT     по умолчанию 127.0.0.1:8787, наружу сервис отдаёт Caddy
  TG_BOT_TOKEN, TG_CHAT_ID   необязательно: уведомление о новом предзаказе в Telegram
"""
import argparse, base64, contextlib, csv, functools, getpass, hashlib, hmac, io, json, os, re, secrets, sqlite3, sys, threading, time
import urllib.parse, urllib.request
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crm  # noqa: E402  план работ и CRM: server/crm.py
import me  # noqa: E402  личное приложение /me/: server/me.py
import push  # noqa: E402  уведомления на телефон: server/push.py

PRINTS = {
    'buttons': 'JUST press BUTTONS', 'flap': 'CERTIFIED FLAP OPERATOR', 'autopilot': 'CERTIFIED AUTOPILOT SUPERVISOR',
    'holding': "I'M NOT LOST, I'M HOLDING", '1500': '1500 FLIGHT HOURS / 0 SLEEP',
}
COLORWAYS = ['sky_on_cloud', 'bordo_on_cloud', 'cloud_on_bordo', 'high_on_night', 'white_on_sky']
SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
CONTACT_TYPES = ['telegram', 'whatsapp', 'email']
STATUSES = ['new', 'confirmed', 'paid', 'shipped', 'done', 'cancelled']
MAX_BODY = 16 * 1024
MAX_BATCH_BODY = 512 * 1024
MAX_ME_BODY = 2 * 1024 * 1024      # заметка целиком (HTML и текст для поиска)
MAX_IMPORT_BODY = 4 * 1024 * 1024  # точки с фото из галереи
CRM_SEED = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'crm_seed.json')
SESSION_TTL = 12 * 3600
SESSION_TTL_LONG = 30 * 24 * 3600  # «запомнить на этом устройстве» — для приложения на телефоне
PBKDF2_ITERS = 600_000

CFG = {}
HITS = {}              # ключ -> отметки времени, для ограничения частоты
LOCK = threading.Lock()


def load_config(env_file):
    cfg = dict(os.environ)
    if env_file:
        with open(env_file, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    cfg[k.strip()] = v.strip().strip('"').strip("'")
    CFG.update(
        hash=cfg.get('ADMIN_PASSWORD_HASH', ''),
        db=os.path.expanduser(cfg.get('ORDERS_DB', '~/.pilotarbuza/orders.db')),
        host=cfg.get('ORDERS_HOST', '127.0.0.1'), port=int(cfg.get('ORDERS_PORT', '8787')),
        tg_token=cfg.get('TG_BOT_TOKEN', ''), tg_chat=cfg.get('TG_CHAT_ID', ''),
    )


def make_hash(password):
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, PBKDF2_ITERS)
    return 'pbkdf2_sha256$%d$%s$%s' % (PBKDF2_ITERS, base64.b64encode(salt).decode(), base64.b64encode(dk).decode())


def check_password(password):
    try:
        algo, iters, salt, want = CFG['hash'].split('$')
        if algo != 'pbkdf2_sha256':
            return False
        dk = hashlib.pbkdf2_hmac('sha256', password.encode(), base64.b64decode(salt), int(iters))
        return hmac.compare_digest(dk, base64.b64decode(want))
    except (ValueError, TypeError):
        return False


def allowed(key, limit, window):
    """Не больше limit событий за window секунд на ключ."""
    now = time.time()
    with LOCK:
        hits = [t for t in HITS.get(key, []) if now - t < window]
        ok = len(hits) < limit
        if ok:
            hits.append(now)
        HITS[key] = hits
        if len(HITS) > 5000:
            for k in [k for k, v in HITS.items() if not v or now - v[-1] > 3600]:
                HITS.pop(k, None)
        return ok


@contextlib.contextmanager
def db():
    """Соединение с базой: коммит при успехе, откат при ошибке и всегда закрытие —
    иначе соединения копятся, и служба упирается в лимит открытых файлов."""
    con = sqlite3.connect(CFG['db'], timeout=10)
    con.row_factory = sqlite3.Row
    try:
        with con:
            yield con
    finally:
        con.close()


def init_db():
    os.makedirs(os.path.dirname(CFG['db']) or '.', exist_ok=True)
    with db() as con:
        con.execute('PRAGMA journal_mode=WAL')
        con.execute('''CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            print TEXT NOT NULL, colorway TEXT NOT NULL, size TEXT NOT NULL, qty INTEGER NOT NULL,
            name TEXT NOT NULL, contact_type TEXT NOT NULL, contact TEXT NOT NULL,
            city TEXT NOT NULL DEFAULT '', comment TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'new', note TEXT NOT NULL DEFAULT '')''')
        crm.init(con, CRM_SEED)
        me.init(con)
        push.init(con)
        # сессии хранятся в базе (только хеш токена), поэтому переживают перезапуск службы
        con.execute('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires REAL NOT NULL)')


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def clean(value, limit):
    if not isinstance(value, str):
        return ''
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', value).strip()[:limit]


def notify(order):
    if not (CFG['tg_token'] and CFG['tg_chat']):
        return
    text = 'Предзаказ №%d\n%s\n%s · %s · %d шт.\n%s — %s: %s\n%s\n%s' % (
        order['id'], PRINTS[order['print']], order['colorway'], order['size'], order['qty'],
        order['name'], order['contact_type'], order['contact'], order['city'], order['comment'])

    def send():
        try:
            data = urllib.parse.urlencode({'chat_id': CFG['tg_chat'], 'text': text.strip()}).encode()
            with urllib.request.urlopen('https://api.telegram.org/bot%s/sendMessage' % CFG['tg_token'], data, timeout=10) as r:
                r.read()
        except Exception as e:  # уведомление не должно ронять приём заказа
            print('telegram notify failed:', type(e).__name__, file=sys.stderr)
    threading.Thread(target=send, daemon=True).start()


class Handler(SimpleHTTPRequestHandler):
    server_version = 'pa-orders'
    static = None
    timeout = 30  # зависшее подключение закрывается, а не держит поток и файл

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.ip(), fmt % args))

    # ---------- вспомогательное ----------
    def ip(self):
        peer = self.client_address[0]
        h = getattr(self, 'headers', None)  # при тайм-ауте заголовков ещё нет
        fwd = h.get('X-Forwarded-For') if h else None
        if fwd and peer in ('127.0.0.1', '::1'):
            return fwd.split(',')[-1].strip()
        return peer

    def send_json(self, code, obj, headers=()):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def same_origin(self):
        origin = self.headers.get('Origin')
        if origin and urllib.parse.urlsplit(origin).netloc != self.headers.get('Host'):
            self.send_json(403, {'error': 'origin'})
            return False
        return True

    def read_body(self, limit):
        """Сырое тело запроса; None, если оно больше limit (ответ уже отправлен)."""
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            n = -1
        if n < 0 or n > limit:
            self.send_json(413, {'error': 'too large'})
            return None
        return self.rfile.read(n)

    def read_json(self, limit=MAX_BODY):
        """Тело запроса как dict; None, если запрос не похож на наш (и ответ уже отправлен)."""
        if not self.same_origin():
            return None
        if 'application/json' not in (self.headers.get('Content-Type') or ''):
            self.send_json(415, {'error': 'content-type'})
            return None
        raw = self.read_body(limit)
        if raw is None:
            return None
        try:
            data = json.loads(raw or b'{}')
        except ValueError:
            data = None
        if not isinstance(data, dict):
            self.send_json(400, {'error': 'json'})
            return None
        return data

    def token(self):
        for part in (self.headers.get('Cookie') or '').split(';'):
            k, _, v = part.strip().partition('=')
            if k == 'pa_admin':
                return v
        return ''

    def authed(self):
        tok = self.token()
        if not tok:
            return False
        with db() as con:
            r = con.execute('SELECT expires FROM sessions WHERE token_hash=?', [hashlib.sha256(tok.encode()).hexdigest()]).fetchone()
        return bool(r and r[0] > time.time())

    def require_admin(self):
        if self.authed():
            return self.same_origin()
        self.send_json(401, {'error': 'auth'})
        return False

    def route(self):
        return urllib.parse.urlsplit(self.path).path.rstrip('/') or '/'

    def query(self):
        return dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(self.path).query))

    # ---------- методы ----------
    def do_GET(self):
        path = self.route()
        if not path.startswith('/api/'):
            if self.static and not path.startswith('/server'):
                return super().do_GET()
            return self.send_json(404, {'error': 'not found'})
        if path == '/api/health':
            return self.send_json(200, {'ok': True})
        if path == '/api/admin/me':
            return self.send_json(200, {'auth': self.authed()})
        if path == '/api/admin/orders':
            if not self.require_admin():
                return
            with db() as con:
                rows = [dict(r) for r in con.execute('SELECT * FROM orders ORDER BY id DESC')]
            return self.send_json(200, {'orders': rows, 'prints': PRINTS, 'statuses': STATUSES})
        if path == '/api/admin/orders.csv':
            if not self.require_admin():
                return
            return self.send_csv()
        if path == '/api/admin/push':
            if not self.require_admin():
                return
            with db() as con:
                return self.send_json(200, push.info(con))
        if path in ('/api/admin/crm', '/api/admin/crm/export.json'):
            if not self.require_admin():
                return
            with db() as con:
                data = crm.all_records(con)
            headers = [('Content-Disposition', 'attachment; filename="plan-crm-%s.json"' % time.strftime('%Y%m%d'))] if path.endswith('.json') else []
            return self.send_json(200, data, headers)
        if path.startswith('/api/me/'):
            return self.me_get(path)
        self.send_json(404, {'error': 'not found'})

    def do_HEAD(self):
        if self.static and not self.route().startswith(('/api/', '/server')):
            return super().do_HEAD()
        self.send_json(404, {'error': 'not found'})

    def do_POST(self):
        path = self.route()
        if path == '/api/preorders':
            return self.create_order()
        if path == '/api/admin/login':
            return self.login()
        if path == '/api/admin/logout':
            data = self.read_json()
            if data is None:
                return
            with db() as con:
                con.execute('DELETE FROM sessions WHERE token_hash=?', [hashlib.sha256(self.token().encode()).hexdigest()])
            return self.send_json(200, {'ok': True}, [('Set-Cookie', 'pa_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict')])
        if path.startswith('/api/admin/push/'):
            return self.push_post(path)
        if path == '/api/admin/crm/batch':
            if not self.require_admin():
                return
            data = self.read_json(MAX_BATCH_BODY)
            if data is None:
                return
            return self.crm_call(lambda con: {'results': crm.batch(con, data.get('ops'))})
        if path.startswith('/api/me/'):
            return self.me_post(path)
        m = re.fullmatch(r'/api/admin/crm/([a-z]+)', path)
        if m and m.group(1) in crm.KINDS:
            if not self.require_admin():
                return
            data = self.read_json()
            if data is None:
                return
            return self.crm_call(lambda con: crm.create(con, m.group(1), data), 201)
        self.send_json(404, {'error': 'not found'})

    def push_post(self, path):
        if not self.require_admin():
            return
        data = self.read_json()
        if data is None:
            return
        action = path.rsplit('/', 1)[1]
        if action == 'subscribe':
            with db() as con:
                err = push.subscribe(con, data)
            return self.send_json(400, {'error': 'fields', 'fields': [err]}) if err else self.send_json(200, {'ok': True})
        if action == 'unsubscribe':
            sub_id = data.get('id') if isinstance(data.get('id'), int) else None
            with db() as con:
                n = push.unsubscribe(con, data.get('endpoint') if isinstance(data.get('endpoint'), str) else None, sub_id)
            return self.send_json(200, {'ok': True, 'removed': n})
        if action == 'settings':
            with db() as con:
                bad = push.update_settings(con, data)
                st = push.settings(con)
            return self.send_json(400, {'error': 'fields', 'fields': bad}) if bad else self.send_json(200, {'settings': st})
        if action in ('test', 'digest'):
            if action == 'test':
                msg = {'title': 'Уведомления работают', 'body': 'Так будут приходить сводка по плану и напоминания о сроках.', 'url': push.APP_URL, 'tag': 'test'}
            else:  # прислать сегодняшнюю сводку прямо сейчас
                with db() as con:
                    msg = push.build(crm.all_records(con), datetime.now(push.TZ).date(), 'digest')
                if not msg:
                    return self.send_json(200, {'sent': 0, 'empty': True})
            return self.send_json(200, push.send_all(db, msg))
        self.send_json(404, {'error': 'not found'})

    def crm_call(self, fn, code=200):
        """Выполнить действие с планом/CRM в одной транзакции и ответить JSON."""
        try:
            with db() as con:
                result = fn(con)
        except crm.Bad as e:
            return self.send_json(400, e.payload)
        if result is None:
            return self.send_json(404, {'error': 'not found'})
        self.send_json(code, result)

    def crm_route(self):
        m = re.fullmatch(r'/api/admin/crm/([a-z]+)/(\d+)', self.route())
        if m and m.group(1) in crm.KINDS:
            return m.group(1), int(m.group(2))
        return None

    def do_PATCH(self):
        m = re.fullmatch(r'/api/me/r/([a-z]+)/(\d+)', self.route())
        if m and m.group(1) in me.KINDS:
            if not self.require_admin():
                return
            data = self.read_json(MAX_ME_BODY)
            if data is None:
                return
            return self.crm_call(lambda con: me.update(con, m.group(1), int(m.group(2)), data))
        target = self.crm_route()
        if target:
            if not self.require_admin():
                return
            data = self.read_json()
            if data is None:
                return
            return self.crm_call(lambda con: crm.update(con, target[0], target[1], data))
        m = re.fullmatch(r'/api/admin/orders/(\d+)', self.route())
        if not m:
            return self.send_json(404, {'error': 'not found'})
        if not self.require_admin():
            return
        data = self.read_json()
        if data is None:
            return
        sets, vals = [], []
        if 'status' in data:
            if data['status'] not in STATUSES:
                return self.send_json(400, {'error': 'status'})
            sets.append('status=?'); vals.append(data['status'])
        if 'note' in data:
            sets.append('note=?'); vals.append(clean(data['note'], 1000))
        if not sets:
            return self.send_json(400, {'error': 'empty'})
        with db() as con:
            cur = con.execute('UPDATE orders SET %s, updated_at=? WHERE id=?' % ', '.join(sets), vals + [now_iso(), int(m.group(1))])
        self.send_json(200 if cur.rowcount else 404, {'ok': bool(cur.rowcount)})

    def do_DELETE(self):
        m = re.fullmatch(r'/api/me/(r/([a-z]+)|files)/(\d+)', self.route())
        if m and (m.group(1) == 'files' or m.group(2) in me.KINDS):
            if not self.require_admin() or not self.same_origin():
                return
            rid = int(m.group(3))
            if m.group(1) == 'files':
                with db() as con:
                    n = con.execute('DELETE FROM me_files WHERE id=?', [rid]).rowcount
                return self.send_json(200 if n else 404, {'ok': bool(n)})
            return self.crm_call(lambda con: me.delete(con, m.group(2), rid))
        target = self.crm_route()
        m = re.fullmatch(r'/api/admin/orders/(\d+)', self.route())
        if not (m or target):
            return self.send_json(404, {'error': 'not found'})
        if not self.require_admin():
            return
        origin = self.headers.get('Origin')
        if origin and urllib.parse.urlsplit(origin).netloc != self.headers.get('Host'):
            return self.send_json(403, {'error': 'origin'})
        if target:
            return self.crm_call(lambda con: {'deleted': crm.delete(con, *target)} if crm.get(con, *target) else None)
        with db() as con:
            cur = con.execute('DELETE FROM orders WHERE id=?', [int(m.group(1))])
        self.send_json(200 if cur.rowcount else 404, {'ok': bool(cur.rowcount)})

    # ---------- личное приложение /me/ ----------
    def me_get(self, path):
        if not self.require_admin():
            return
        q = self.query()
        if path == '/api/me/all':
            with db() as con:
                return self.send_json(200, me.everything(con))
        if path == '/api/me/briefs':
            before = int(q['before']) if q.get('before', '').isdigit() else None
            with db() as con:
                return self.send_json(200, {'briefs': me.briefs(con, before)})
        if path == '/api/me/points':
            try:
                d = crm._date(q.get('date'))
            except ValueError:
                return self.send_json(400, {'error': 'fields', 'fields': ['date']})
            with db() as con:
                return self.send_json(200, {'points': me.points_on(con, d)})
        if path == '/api/me/rates':
            return self.send_json(200, me.rates(db))
        m = re.fullmatch(r'/api/me/files/(\d+)', path)
        if m:
            with db() as con:
                r = con.execute('SELECT name, type, data FROM me_files WHERE id=?', [int(m.group(1))]).fetchone()
            if not r:
                return self.send_json(404, {'error': 'not found'})
            self.send_response(200)
            self.send_header('Content-Type', r['type'])
            self.send_header('Content-Length', str(len(r['data'])))
            self.send_header('Content-Disposition', "inline; filename*=UTF-8''%s" % urllib.parse.quote(r['name']))
            self.send_header('Cache-Control', 'private, max-age=86400')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
            self.end_headers()
            self.wfile.write(r['data'])
            return
        self.send_json(404, {'error': 'not found'})

    def key_ok(self, name, data=None):
        """Ключ из заголовка Authorization: Bearer … или из поля key; без ключа подходит и вход в админку."""
        if not allowed('key:' + self.ip(), 120, 600):
            self.send_json(429, {'error': 'rate'})
            return False
        auth = self.headers.get('Authorization') or ''
        key = auth[7:].strip() if auth.lower().startswith('bearer ') else (data or {}).get('key')
        if key:
            with db() as con:
                if me.check_key(con, name, key):
                    return True
            self.send_json(401, {'error': 'key'})
            return False
        if self.authed():
            return self.same_origin()
        self.send_json(401, {'error': 'auth'})
        return False

    def me_post(self, path):
        if path in ('/api/me/ping', '/api/me/import', '/api/me/brief'):
            return self.me_keyed(path)
        if not self.require_admin():
            return
        if path == '/api/me/files':
            if not self.same_origin():
                return
            q = self.query()
            body = self.read_body(me.MAX_FILE)
            if body is None:
                return
            rec = int(q['rec']) if q.get('rec', '').isdigit() else None
            ctype = (self.headers.get('Content-Type') or '').split(';')[0].strip().lower()
            return self.crm_call(lambda con: me.add_file(con, rec, q.get('name'), ctype, body), 201)
        m = re.fullmatch(r'/api/me/keys/([a-z]+)', path)
        if m and m.group(1) in me.KEY_NAMES:
            if self.read_json() is None:
                return
            with db() as con:
                return self.send_json(200, {'key': me.new_key(con, m.group(1)), 'keys': me.keys_info(con)})
        data = self.read_json(MAX_ME_BODY)
        if data is None:
            return
        m = re.fullmatch(r'/api/me/r/([a-z]+)', path)
        if m and m.group(1) in me.KINDS:
            return self.crm_call(lambda con: me.create(con, m.group(1), data), 201)
        if path == '/api/me/days':
            return self.crm_call(lambda con: me.edit_days(con, data))
        if path == '/api/me/geo':
            pts = data.get('points')
            if not isinstance(pts, list) or len(pts) > 5000:
                return self.send_json(400, {'error': 'fields', 'fields': ['points']})
            out = []
            for p in pts:
                try:
                    out.append(me.country_at(me._coord(p[0], -90, 90), me._coord(p[1], -180, 180)))
                except (ValueError, TypeError, IndexError, KeyError):
                    out.append(None)
            return self.send_json(200, {'countries': out})
        if path == '/api/me/settings':
            with db() as con:
                bad = me.update_settings(con, data)
                st = me.settings(con)
            return self.send_json(400, {'error': 'fields', 'fields': bad}) if bad else self.send_json(200, {'settings': st})
        self.send_json(404, {'error': 'not found'})

    def me_keyed(self, path):
        """Запросы от «Быстрых команд» и от задачи с брифом: JSON или (для импорта) строки текста."""
        ctype = self.headers.get('Content-Type') or ''
        raw = self.read_body(MAX_IMPORT_BODY if path == '/api/me/import' else MAX_ME_BODY)
        if raw is None:
            return
        text = raw.decode('utf-8', 'replace')
        data = None
        if 'json' in ctype or text.lstrip()[:1] in ('{', '['):
            try:
                data = json.loads(text or '{}')
            except ValueError:
                return self.send_json(400, {'error': 'json'})
            if isinstance(data, list):
                data = {'points': data}
        if data is None:
            data = {'points': me.parse_lines(text)} if path == '/api/me/import' else {'text': text}
        if not isinstance(data, dict):
            return self.send_json(400, {'error': 'json'})
        if not self.key_ok('brief' if path == '/api/me/brief' else 'track', data):
            return
        if path == '/api/me/ping':
            return self.crm_call(lambda con: me.ping(con, data))
        if path == '/api/me/import':
            pts = data.get('points')
            if isinstance(pts, str):
                pts = me.parse_lines(pts)
            return self.crm_call(lambda con: me.import_points(con, pts))
        data.setdefault('kind', 'morning' if datetime.now(me.TZ).hour < 15 else 'evening')
        try:
            with db() as con:
                res = me.add_brief(con, data)
                want = me.settings(con)['brief_push']
        except crm.Bad as e:
            return self.send_json(400, e.payload)
        self.send_json(201, res)
        if want:
            title = {'morning': 'Утренний бриф', 'evening': 'Вечерний бриф'}.get(data['kind'], 'Бриф')
            first = next((l for l in str(data.get('text', '')).splitlines()[1:] if l.strip()), '')
            msg = {'title': title, 'body': first[:120], 'url': '/me/#brief', 'tag': 'me-brief'}
            threading.Thread(target=push.send_all, args=(db, msg), daemon=True).start()

    # ---------- действия ----------
    def create_order(self):
        if not allowed('order:' + self.ip(), 5, 600):
            return self.send_json(429, {'error': 'rate'})
        data = self.read_json()
        if data is None:
            return
        if data.get('website'):  # поле-ловушка, люди его не видят
            return self.send_json(200, {'ok': True, 'id': 0})
        o = {
            'print': data.get('print'), 'colorway': data.get('colorway'), 'size': data.get('size'),
            'contact_type': data.get('contact_type'), 'name': clean(data.get('name'), 80),
            'contact': clean(data.get('contact'), 120), 'city': clean(data.get('city'), 120),
            'comment': clean(data.get('comment'), 600), 'lang': clean(data.get('lang'), 5),
        }
        try:
            o['qty'] = int(data.get('qty', 1))
        except (TypeError, ValueError):
            o['qty'] = 0
        bad = [k for k, ok in (
            ('print', o['print'] in PRINTS), ('colorway', o['colorway'] in COLORWAYS), ('size', o['size'] in SIZES),
            ('contact_type', o['contact_type'] in CONTACT_TYPES), ('qty', 1 <= o['qty'] <= 10),
            ('name', len(o['name']) >= 2), ('contact', len(o['contact']) >= 3)) if not ok]
        if bad:
            return self.send_json(400, {'error': 'fields', 'fields': bad})
        ts = now_iso()
        with db() as con:
            cur = con.execute(
                'INSERT INTO orders (created_at, updated_at, print, colorway, size, qty, name, contact_type, contact, city, comment, lang) '
                'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                [ts, ts, o['print'], o['colorway'], o['size'], o['qty'], o['name'], o['contact_type'], o['contact'], o['city'], o['comment'], o['lang']])
            o['id'] = cur.lastrowid
        notify(o)
        self.send_json(201, {'ok': True, 'id': o['id']})

    def login(self):
        if not allowed('login:' + self.ip(), 5, 900):
            return self.send_json(429, {'error': 'rate'})
        data = self.read_json()
        if data is None:
            return
        password = data.get('password')
        if not CFG['hash'] or not isinstance(password, str) or not check_password(password):
            return self.send_json(401, {'error': 'password'})
        tok = secrets.token_urlsafe(32)
        ttl = SESSION_TTL_LONG if data.get('remember') is True else SESSION_TTL
        now = time.time()
        with db() as con:
            con.execute('DELETE FROM sessions WHERE expires < ?', [now])
            con.execute('INSERT INTO sessions (token_hash, expires) VALUES (?, ?)', [hashlib.sha256(tok.encode()).hexdigest(), now + ttl])
        with LOCK:
            HITS.pop('login:' + self.ip(), None)
        self.send_json(200, {'ok': True}, [('Set-Cookie', 'pa_admin=%s; Path=/; Max-Age=%d; HttpOnly; Secure; SameSite=Strict' % (tok, ttl))])

    def send_csv(self):
        cols = ['id', 'created_at', 'status', 'print', 'colorway', 'size', 'qty', 'name', 'contact_type', 'contact', 'city', 'comment', 'note', 'lang', 'updated_at']
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=';')
        w.writerow(cols)
        with db() as con:
            for r in con.execute('SELECT * FROM orders ORDER BY id'):
                row = [r[c] for c in cols]
                # текст от покупателей не должен исполняться как формула в Excel
                w.writerow(["'" + v if isinstance(v, str) and v[:1] in '=+-@\t' else v for v in row])
        body = buf.getvalue().encode('utf-8-sig')
        self.send_response(200)
        self.send_header('Content-Type', 'text/csv; charset=utf-8')
        self.send_header('Content-Disposition', 'attachment; filename="preorders-%s.csv"' % time.strftime('%Y%m%d'))
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)


def main():
    ap = argparse.ArgumentParser(description='pilotarbuza.com preorders')
    ap.add_argument('command', nargs='?', choices=['serve', 'hash'], default='serve')
    ap.add_argument('--env-file')
    ap.add_argument('--static', help='только для локальной разработки: папка сайта, которую отдавать вместе с API')
    args = ap.parse_args()
    if args.command == 'hash':
        p1 = getpass.getpass('Пароль админки: ')
        if len(p1) < 10 or p1 != getpass.getpass('Ещё раз: '):
            sys.exit('Пароли не совпали или короче 10 символов.')
        print('ADMIN_PASSWORD_HASH=' + make_hash(p1))
        return
    load_config(args.env_file)
    init_db()
    push.HOOKS.append(me.due)
    push.start(db, crm)
    if not CFG['hash']:
        print('ADMIN_PASSWORD_HASH не задан — вход в админку закрыт.', file=sys.stderr)
    handler = Handler
    if args.static:
        handler = functools.partial(Handler, directory=os.path.abspath(args.static))
        Handler.static = True
    srv = ThreadingHTTPServer((CFG['host'], CFG['port']), handler)
    print('orders: http://%s:%d  db=%s' % (CFG['host'], CFG['port'], CFG['db']), file=sys.stderr)
    srv.serve_forever()


if __name__ == '__main__':
    main()
