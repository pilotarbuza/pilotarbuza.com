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
import argparse, base64, csv, functools, getpass, hashlib, hmac, io, json, os, re, secrets, sqlite3, sys, threading, time
import urllib.parse, urllib.request
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crm  # noqa: E402  план работ и CRM: server/crm.py

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
CRM_SEED = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'crm_seed.json')
SESSION_TTL = 12 * 3600
PBKDF2_ITERS = 600_000

CFG = {}
SESSIONS = {}          # token -> срок действия; живут в памяти, перезапуск сервиса разлогинивает
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


def db():
    con = sqlite3.connect(CFG['db'], timeout=10)
    con.row_factory = sqlite3.Row
    return con


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
            urllib.request.urlopen('https://api.telegram.org/bot%s/sendMessage' % CFG['tg_token'], data, timeout=10).read()
        except Exception as e:  # уведомление не должно ронять приём заказа
            print('telegram notify failed:', type(e).__name__, file=sys.stderr)
    threading.Thread(target=send, daemon=True).start()


class Handler(SimpleHTTPRequestHandler):
    server_version = 'pa-orders'
    static = None

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.ip(), fmt % args))

    # ---------- вспомогательное ----------
    def ip(self):
        peer = self.client_address[0]
        fwd = self.headers.get('X-Forwarded-For') if self.headers else None
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

    def read_json(self, limit=MAX_BODY):
        """Тело запроса как dict; None, если запрос не похож на наш (и ответ уже отправлен)."""
        origin = self.headers.get('Origin')
        if origin and urllib.parse.urlsplit(origin).netloc != self.headers.get('Host'):
            self.send_json(403, {'error': 'origin'})
            return None
        if 'application/json' not in (self.headers.get('Content-Type') or ''):
            self.send_json(415, {'error': 'content-type'})
            return None
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            n = -1
        if n < 0 or n > limit:
            self.send_json(413, {'error': 'too large'})
            return None
        try:
            data = json.loads(self.rfile.read(n) or b'{}')
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
        with LOCK:
            exp = SESSIONS.get(tok)
            if exp and exp > time.time():
                return True
            SESSIONS.pop(tok, None)
        return False

    def require_admin(self):
        if self.authed():
            return True
        self.send_json(401, {'error': 'auth'})
        return False

    def route(self):
        return urllib.parse.urlsplit(self.path).path.rstrip('/') or '/'

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
        if path in ('/api/admin/crm', '/api/admin/crm/export.json'):
            if not self.require_admin():
                return
            with db() as con:
                data = crm.all_records(con)
            headers = [('Content-Disposition', 'attachment; filename="plan-crm-%s.json"' % time.strftime('%Y%m%d'))] if path.endswith('.json') else []
            return self.send_json(200, data, headers)
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
            with LOCK:
                SESSIONS.pop(self.token(), None)
            return self.send_json(200, {'ok': True}, [('Set-Cookie', 'pa_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict')])
        if path == '/api/admin/crm/batch':
            if not self.require_admin():
                return
            data = self.read_json(MAX_BATCH_BODY)
            if data is None:
                return
            return self.crm_call(lambda con: {'results': crm.batch(con, data.get('ops'))})
        m = re.fullmatch(r'/api/admin/crm/([a-z]+)', path)
        if m and m.group(1) in crm.KINDS:
            if not self.require_admin():
                return
            data = self.read_json()
            if data is None:
                return
            return self.crm_call(lambda con: crm.create(con, m.group(1), data), 201)
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
        with LOCK:
            now = time.time()
            for k in [k for k, exp in SESSIONS.items() if exp < now]:
                SESSIONS.pop(k, None)
            SESSIONS[tok] = now + SESSION_TTL
            HITS.pop('login:' + self.ip(), None)
        self.send_json(200, {'ok': True}, [('Set-Cookie', 'pa_admin=%s; Path=/; Max-Age=%d; HttpOnly; Secure; SameSite=Strict' % (tok, SESSION_TTL))])

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
