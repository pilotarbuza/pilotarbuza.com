"""pilotarbuza.com — план работ и CRM для админки. Только стандартная библиотека Python 3.9+.

Все записи лежат в одной таблице `records` той же базы, что и заказы: вид записи (kind), id и поля в JSON.
Поля каждого вида описаны в SCHEMA, сервер проверяет и обрезает всё, что приходит из браузера.
Если таблица пустая, при старте в неё загружается server/crm_seed.json (двухлетний план ANY1).

API (всё только после входа в админку):
  GET    /api/admin/crm                 все записи, сгруппированные по видам, и справочники
  GET    /api/admin/crm/export.json     то же самое файлом — резервная копия
  POST   /api/admin/crm/<kind>          создать запись
  PATCH  /api/admin/crm/<kind>/<id>     изменить поля
  DELETE /api/admin/crm/<kind>/<id>     удалить (задача — вместе с подзадачами, контакт — с историей)
  POST   /api/admin/crm/batch           {"ops": [{"op": "update", "kind": "tasks", "id": 5, "data": {...}}, ...]} одной транзакцией
"""
import json, os, re, sqlite3
from datetime import date, datetime, timezone

TASK_STATUSES = ['todo', 'doing', 'review', 'blocked', 'done']
PRIORITIES = ['low', 'normal', 'high', 'critical']
TASK_KINDS = ['phase', 'task', 'milestone', 'test']
CONTACT_KINDS = ['regulator', 'university', 'competition', 'supplier', 'sponsor', 'team', 'other']
CONTACT_STATUSES = ['new', 'contacted', 'waiting', 'active', 'closed']
ACTIVITY_TYPES = ['email', 'call', 'meeting', 'message', 'note']
CAL_KINDS = ['session', 'holiday', 'vacation', 'event', 'deadline']

# поле: (тип, параметры..., обязательное)
SCHEMA = {
    'people': {
        'name': ('str', 80, True), 'role': ('str', 120), 'color': ('color',), 'email': ('str', 120),
        'telegram': ('str', 64), 'capacity': ('int', 0, 80),
    },
    'projects': {
        'name': ('str', 120, True), 'code': ('str', 24), 'color': ('color',), 'description': ('text', 2000),
    },
    'tasks': {
        'title': ('str', 200, True), 'kind': ('enum', TASK_KINDS), 'code': ('str', 24),
        'project': ('ref', 'projects'), 'parent': ('ref', 'tasks'), 'assignee': ('ref', 'people'),
        'status': ('enum', TASK_STATUSES), 'priority': ('enum', PRIORITIES),
        'start': ('date',), 'end': ('date',), 'progress': ('int', 0, 100), 'hours': ('int', 0, 5000),
        'deps': ('refs', 'tasks', 30), 'criteria': ('text', 1500), 'notes': ('text', 6000), 'order': ('int', 0, 10 ** 7),
    },
    'contacts': {
        'name': ('str', 120, True), 'org': ('str', 160), 'kind': ('enum', CONTACT_KINDS), 'role': ('str', 160),
        'email': ('str', 160), 'phone': ('str', 40), 'telegram': ('str', 64), 'url': ('str', 300),
        'status': ('enum', CONTACT_STATUSES), 'next_step': ('str', 300), 'next_date': ('date',),
        'notes': ('text', 6000), 'tasks': ('refs', 'tasks', 50),
    },
    'activities': {
        'contact': ('ref', 'contacts', True), 'date': ('date', True), 'type': ('enum', ACTIVITY_TYPES),
        'text': ('text', 4000, True),
    },
    'calendar': {
        'title': ('str', 160, True), 'kind': ('enum', CAL_KINDS), 'start': ('date', True), 'end': ('date', True),
        'notes': ('text', 1000),
    },
}
DEFAULTS = {
    'tasks': {'kind': 'task', 'status': 'todo', 'priority': 'normal', 'progress': 0, 'deps': []},
    'contacts': {'kind': 'other', 'status': 'new', 'tasks': []},
    'activities': {'type': 'note'},
    'calendar': {'kind': 'event'},
    'people': {'capacity': 8},
}
KINDS = list(SCHEMA)
DATE_RE = re.compile(r'\d{4}-\d{2}-\d{2}')
COLOR_RE = re.compile(r'#[0-9A-Fa-f]{6}')
MAX_OPS = 400


class Bad(Exception):
    """Ошибка в данных от браузера: уходит ответом 400."""
    def __init__(self, error, **extra):
        super().__init__(error)
        self.payload = dict(error=error, **extra)


def _now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _strip(value, limit, multiline=False):
    if not isinstance(value, str):
        raise ValueError
    pat = r'[\x00-\x08\x0b\x0c\x0e-\x1f]' if multiline else r'[\x00-\x1f]'
    return re.sub(pat, '' if multiline else ' ', value).strip()[:limit]


def _date(value):
    if not isinstance(value, str) or not DATE_RE.fullmatch(value):
        raise ValueError
    date.fromisoformat(value)
    return value


def _field(spec, value):
    t = spec[0]
    if t in ('ref', 'date', 'color') and value in (None, ''):
        return None
    if t in ('str', 'text') and value is None:
        return ''
    if t == 'str':
        return _strip(value, spec[1])
    if t == 'text':
        return _strip(value, spec[1], multiline=True)
    if t == 'enum':
        if value not in spec[1]:
            raise ValueError
        return value
    if t == 'int':
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError
        return max(spec[1], min(spec[2], int(value)))
    if t == 'date':
        return _date(value)
    if t == 'color':
        if not isinstance(value, str) or not COLOR_RE.fullmatch(value):
            raise ValueError
        return value.upper()
    if t == 'ref':
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise ValueError
        return value
    if t == 'refs':
        if not isinstance(value, list) or len(value) > spec[2]:
            raise ValueError
        out = []
        for v in value:
            if isinstance(v, bool) or not isinstance(v, int) or v <= 0:
                raise ValueError
            if v not in out:
                out.append(v)
        return out
    raise ValueError


def validate(kind, data, current=None):
    """Чистые поля записи. current — запись до изменения (для PATCH), None — создание."""
    if not isinstance(data, dict):
        raise Bad('json')
    schema = SCHEMA[kind]
    out = dict(current or DEFAULTS.get(kind, {}))
    bad = []
    for key, value in data.items():
        if key not in schema:
            continue
        try:
            out[key] = _field(schema[key], value)
        except (ValueError, TypeError):
            bad.append(key)
    for key, spec in schema.items():
        if spec[-1] is True and out.get(key) in (None, ''):
            bad.append(key)
    if kind in ('tasks', 'calendar') and out.get('start') and out.get('end') and out['end'] < out['start']:
        bad.append('end')
    if bad:
        raise Bad('fields', fields=sorted(set(bad)))
    return out


# ---------- база ----------
def init(con, seed_path=None):
    con.execute('''CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, data TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL)''')
    con.execute('CREATE INDEX IF NOT EXISTS records_kind ON records(kind)')
    empty = con.execute('SELECT COUNT(*) FROM records').fetchone()[0] == 0
    if empty and seed_path and os.path.exists(seed_path):
        with open(seed_path, encoding='utf-8') as f:
            load_seed(con, json.load(f))


def load_seed(con, seed):
    """Сид ссылается на записи метками "@key"; при загрузке они превращаются в настоящие id."""
    ids = {}

    def resolve(spec, value):
        if spec[0] == 'ref' and isinstance(value, str) and value.startswith('@'):
            return ids[value]
        if spec[0] == 'refs' and isinstance(value, list):
            return [ids[v] if isinstance(v, str) and v.startswith('@') else v for v in value]
        return value

    ts = _now()
    for kind in ['people', 'projects', 'calendar', 'tasks', 'contacts', 'activities']:
        pending = []
        for item in seed.get(kind, []):
            key = item.get('key')
            cur = con.execute('INSERT INTO records (kind, data, created_at, updated_at) VALUES (?,?,?,?)', [kind, '{}', ts, ts])
            if key:
                ids['@' + key] = cur.lastrowid
            pending.append((cur.lastrowid, item))
        for rid, item in pending:
            raw = {k: resolve(SCHEMA[kind][k], v) for k, v in item.items() if k in SCHEMA[kind]}
            con.execute('UPDATE records SET data=? WHERE id=?', [json.dumps(validate(kind, raw), ensure_ascii=False), rid])


def _row(r):
    d = json.loads(r['data'])
    d['id'] = r['id']
    d['updated_at'] = r['updated_at']
    return d


def get(con, kind, rid):
    r = con.execute('SELECT * FROM records WHERE id=? AND kind=?', [rid, kind]).fetchone()
    return _row(r) if r else None


def all_records(con):
    out = {k: [] for k in KINDS}
    for r in con.execute('SELECT * FROM records ORDER BY id'):
        if r['kind'] in out:
            out[r['kind']].append(_row(r))
    out['meta'] = {
        'task_statuses': TASK_STATUSES, 'priorities': PRIORITIES, 'task_kinds': TASK_KINDS,
        'contact_kinds': CONTACT_KINDS, 'contact_statuses': CONTACT_STATUSES,
        'activity_types': ACTIVITY_TYPES, 'calendar_kinds': CAL_KINDS,
    }
    return out


def _check_refs(con, kind, rec, rid=None):
    for key, spec in SCHEMA[kind].items():
        if spec[0] == 'ref' and rec.get(key):
            if rec[key] == rid or not get(con, spec[1], rec[key]):
                raise Bad('fields', fields=[key])
        if spec[0] == 'refs' and rec.get(key):
            keep = [v for v in rec[key] if v != rid and get(con, spec[1], v)]
            rec[key] = keep
    if kind == 'tasks' and rid and rec.get('parent'):
        seen, p = set(), rec['parent']
        while p:  # родитель не может оказаться собственным потомком
            if p == rid or p in seen:
                raise Bad('fields', fields=['parent'])
            seen.add(p)
            parent = get(con, 'tasks', p)
            p = parent and parent.get('parent')


def _save(con, rid, rec):
    data = {k: v for k, v in rec.items() if k not in ('id', 'updated_at')}
    ts = _now()
    con.execute('UPDATE records SET data=?, updated_at=? WHERE id=?', [json.dumps(data, ensure_ascii=False), ts, rid])
    rec['id'], rec['updated_at'] = rid, ts
    return rec


def create(con, kind, data):
    rec = validate(kind, data)
    _check_refs(con, kind, rec)
    ts = _now()
    cur = con.execute('INSERT INTO records (kind, data, created_at, updated_at) VALUES (?,?,?,?)', [kind, '{}', ts, ts])
    return _save(con, cur.lastrowid, rec)


def update(con, kind, rid, data):
    current = get(con, kind, rid)
    if not current:
        return None
    rec = validate(kind, data, current)
    _check_refs(con, kind, rec, rid)
    return _save(con, rid, rec)


def delete(con, kind, rid):
    """Удаляет запись и всё, что без неё теряет смысл. Возвращает список удалённых id."""
    if not get(con, kind, rid):
        return []
    gone = [rid]
    if kind == 'tasks':
        tasks = [_row(r) for r in con.execute("SELECT * FROM records WHERE kind='tasks'")]
        frontier = [rid]
        while frontier:
            kids = [t['id'] for t in tasks if t.get('parent') in frontier]
            gone += kids
            frontier = kids
    if kind == 'contacts':
        gone += [r['id'] for r in con.execute("SELECT * FROM records WHERE kind='activities'") if json.loads(r['data']).get('contact') == rid]
    con.executemany('DELETE FROM records WHERE id=?', [[g] for g in gone])
    # убрать ссылки на удалённое из остальных записей
    for r in con.execute('SELECT * FROM records').fetchall():
        rec, changed = json.loads(r['data']), False
        for key, spec in SCHEMA.get(r['kind'], {}).items():
            if spec[0] == 'refs' and any(v in gone for v in rec.get(key) or []):
                rec[key] = [v for v in rec[key] if v not in gone]
                changed = True
            if spec[0] == 'ref' and rec.get(key) in gone and spec[-1] is not True:
                rec[key] = None
                changed = True
        if changed:
            con.execute('UPDATE records SET data=?, updated_at=? WHERE id=?', [json.dumps(rec, ensure_ascii=False), _now(), r['id']])
    return gone


def batch(con, ops):
    if not isinstance(ops, list) or not ops or len(ops) > MAX_OPS:
        raise Bad('ops')
    results = []
    for i, op in enumerate(ops):
        if not isinstance(op, dict) or op.get('kind') not in SCHEMA or op.get('op') not in ('create', 'update', 'delete'):
            raise Bad('op', index=i)
        kind, rid = op['kind'], op.get('id')
        try:
            if op['op'] == 'create':
                results.append(create(con, kind, op.get('data')))
                continue
            if isinstance(rid, bool) or not isinstance(rid, int):
                raise Bad('op', index=i)
            if op['op'] == 'update':
                rec = update(con, kind, rid, op.get('data'))
                if rec is None:
                    raise Bad('not found', index=i)
                results.append(rec)
            else:
                results.append({'deleted': delete(con, kind, rid)})
        except Bad as e:
            e.payload.setdefault('index', i)
            raise
    return results
