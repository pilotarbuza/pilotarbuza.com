"""Web Push (RFC 8030/8291/8292) на чистом Python: ключи VAPID, подпись ES256, шифрование aes128gcm.

Если на сервере установлен пакет `cryptography`, тяжёлая математика идёт через него; иначе — через
код ниже (P-256 и AES-GCM на целых числах). Уведомлений несколько в день, так что скорость не важна.
"""
import base64, hashlib, hmac, json, os, secrets, struct, time, urllib.error, urllib.parse, urllib.request

try:  # быстрый путь, если библиотека есть
    from cryptography.hazmat.primitives.asymmetric import ec as _ec
    from cryptography.hazmat.primitives import hashes as _hashes
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature as _dds
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM as _AESGCM
    HAVE_CRYPTO = True
except Exception:  # noqa: BLE001
    HAVE_CRYPTO = False


def b64u(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def unb64u(s):
    s = s.strip()
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


# ---------------- P-256 ----------------
P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff
A = P - 3
B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b
N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
G = (0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296,
     0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5)


def _jadd(p1, p2):
    """Сложение точек в якобиевых координатах (X, Y, Z); None — бесконечность."""
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    X1, Y1, Z1 = p1
    X2, Y2, Z2 = p2
    Z1Z1, Z2Z2 = Z1 * Z1 % P, Z2 * Z2 % P
    U1, U2 = X1 * Z2Z2 % P, X2 * Z1Z1 % P
    S1, S2 = Y1 * Z2 * Z2Z2 % P, Y2 * Z1 * Z1Z1 % P
    if U1 == U2:
        return _jdbl(p1) if S1 == S2 else None
    H, R = (U2 - U1) % P, (S2 - S1) % P
    HH = H * H % P
    HHH = H * HH % P
    V = U1 * HH % P
    X3 = (R * R - HHH - 2 * V) % P
    Y3 = (R * (V - X3) - S1 * HHH) % P
    return X3, Y3, H * Z1 * Z2 % P


def _jdbl(p1):
    if p1 is None:
        return None
    X, Y, Z = p1
    if Y == 0:
        return None
    YY = Y * Y % P
    S = 4 * X * YY % P
    ZZ = Z * Z % P
    M = 3 * (X - ZZ) * (X + ZZ) % P  # a = -3
    X3 = (M * M - 2 * S) % P
    return X3, (M * (S - X3) - 8 * YY * YY) % P, 2 * Y * Z % P


def _mul(k, pt):
    acc, add = None, (pt[0], pt[1], 1)
    while k:
        if k & 1:
            acc = _jadd(acc, add)
        add = _jdbl(add)
        k >>= 1
    if acc is None:
        raise ValueError('infinity')
    X, Y, Z = acc
    zi = pow(Z, -1, P)
    return X * zi * zi % P, Y * zi * zi * zi % P


def _on_curve(x, y):
    return 0 <= x < P and 0 <= y < P and (y * y - (x * x * x + A * x + B)) % P == 0


def _point(raw):
    if len(raw) != 65 or raw[0] != 4:
        raise ValueError('point')
    x, y = int.from_bytes(raw[1:33], 'big'), int.from_bytes(raw[33:], 'big')
    if not _on_curve(x, y):
        raise ValueError('point')
    return x, y


def _enc_point(pt):
    return b'\x04' + pt[0].to_bytes(32, 'big') + pt[1].to_bytes(32, 'big')


def new_keypair():
    """(закрытый ключ 32 байта, открытый 65 байт)."""
    d = secrets.randbelow(N - 1) + 1
    return d.to_bytes(32, 'big'), _enc_point(_mul(d, G))


def public_from_private(priv):
    return _enc_point(_mul(int.from_bytes(priv, 'big'), G))


def ecdh(priv, peer_pub):
    if HAVE_CRYPTO:
        key = _ec.derive_private_key(int.from_bytes(priv, 'big'), _ec.SECP256R1())
        peer = _ec.EllipticCurvePublicKey.from_encoded_point(_ec.SECP256R1(), peer_pub)
        return key.exchange(_ec.ECDH(), peer)
    return _mul(int.from_bytes(priv, 'big'), _point(peer_pub))[0].to_bytes(32, 'big')


def sign_es256(priv, msg):
    """Подпись ECDSA P-256/SHA-256 в формате JOSE (r||s, 64 байта)."""
    if HAVE_CRYPTO:
        key = _ec.derive_private_key(int.from_bytes(priv, 'big'), _ec.SECP256R1())
        r, s = _dds(key.sign(msg, _ec.ECDSA(_hashes.SHA256())))
        return r.to_bytes(32, 'big') + s.to_bytes(32, 'big')
    d, z = int.from_bytes(priv, 'big'), int.from_bytes(hashlib.sha256(msg).digest(), 'big')
    while True:
        k = secrets.randbelow(N - 1) + 1
        r = _mul(k, G)[0] % N
        if not r:
            continue
        s = pow(k, -1, N) * (z + r * d) % N
        if s:
            return r.to_bytes(32, 'big') + s.to_bytes(32, 'big')


# ---------------- AES-128-GCM ----------------
_SBOX = bytearray(256)


def _init_sbox():
    p = q = 1
    while True:  # стандартное построение S-блока AES
        p = p ^ ((p << 1) & 0xff) ^ (0x1b if p & 0x80 else 0)
        q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff
        if q & 0x80:
            q ^= 0x09
        x = q ^ ((q << 1 | q >> 7) & 0xff) ^ ((q << 2 | q >> 6) & 0xff) ^ ((q << 3 | q >> 5) & 0xff) ^ ((q << 4 | q >> 4) & 0xff)
        _SBOX[p] = x ^ 0x63
        if p == 1:
            break
    _SBOX[0] = 0x63


_init_sbox()


def _xt(a):
    return ((a << 1) ^ 0x1b) & 0xff if a & 0x80 else a << 1


def _expand(key):
    w = [list(key[i:i + 4]) for i in range(0, 16, 4)]
    rcon = 1
    for i in range(4, 44):
        t = list(w[i - 1])
        if i % 4 == 0:
            t = [_SBOX[b] for b in t[1:] + t[:1]]
            t[0] ^= rcon
            rcon = _xt(rcon)
        w.append([a ^ b for a, b in zip(w[i - 4], t)])
    return [sum(w[r * 4:r * 4 + 4], []) for r in range(11)]


def _aes_block(rk, block):
    s = [b ^ k for b, k in zip(block, rk[0])]
    for rnd in range(1, 11):
        s = [_SBOX[b] for b in s]
        s = [s[(i + 4 * (i % 4)) % 16] for i in range(16)]  # ShiftRows (по столбцам)
        if rnd != 10:
            t = []
            for c in range(4):
                a = s[4 * c:4 * c + 4]
                x = a[0] ^ a[1] ^ a[2] ^ a[3]
                t += [a[i] ^ x ^ _xt(a[i] ^ a[(i + 1) % 4]) for i in range(4)]
            s = t
        s = [b ^ k for b, k in zip(s, rk[rnd])]
    return bytes(s)


def _gmul(x, y):
    R, z = 0xe1 << 120, 0
    for i in range(127, -1, -1):
        if (y >> i) & 1:
            z ^= x
        x = (x >> 1) ^ R if x & 1 else x >> 1
    return z


def aes128gcm_encrypt(key, nonce, data):
    if HAVE_CRYPTO:
        return _AESGCM(key).encrypt(nonce, data, None)
    rk = _expand(key)
    H = int.from_bytes(_aes_block(rk, bytes(16)), 'big')
    j0 = nonce + b'\x00\x00\x00\x01'
    out = bytearray()
    for i in range(0, len(data), 16):
        ks = _aes_block(rk, nonce + struct.pack('>I', 2 + i // 16))
        out += bytes(a ^ b for a, b in zip(data[i:i + 16], ks))
    y = 0
    padded = bytes(out) + bytes(-len(out) % 16)
    for i in range(0, len(padded), 16):
        y = _gmul(y ^ int.from_bytes(padded[i:i + 16], 'big'), H)
    y = _gmul(y ^ (len(out) * 8), H)  # длины: AAD = 0 бит, шифртекст
    tag = (y ^ int.from_bytes(_aes_block(rk, j0), 'big')).to_bytes(16, 'big')
    return bytes(out) + tag


def _hmac(key, data):
    return hmac.new(key, data, hashlib.sha256).digest()


def encrypt_payload(payload, ua_public_b64, auth_b64):
    """Тело запроса aes128gcm (RFC 8291) для подписки браузера."""
    ua_pub, auth = unb64u(ua_public_b64), unb64u(auth_b64)
    _point(ua_pub)
    as_priv, as_pub = new_keypair()
    secret = ecdh(as_priv, ua_pub)
    ikm = _hmac(_hmac(auth, secret), b'WebPush: info\x00' + ua_pub + as_pub + b'\x01')
    salt = secrets.token_bytes(16)
    prk = _hmac(salt, ikm)
    cek = _hmac(prk, b'Content-Encoding: aes128gcm\x00\x01')[:16]
    nonce = _hmac(prk, b'Content-Encoding: nonce\x00\x01')[:12]
    body = aes128gcm_encrypt(cek, nonce, payload + b'\x02')
    return salt + struct.pack('>I', 4096) + bytes([65]) + as_pub + body


# ---------------- отправка ----------------
PUSH_HOSTS = ('.push.apple.com', 'fcm.googleapis.com', '.push.services.mozilla.com', 'push.services.mozilla.com', '.notify.windows.com')


def endpoint_ok(url):
    try:
        u = urllib.parse.urlsplit(url)
    except ValueError:
        return False
    host = (u.hostname or '').lower()
    return u.scheme == 'https' and any(host == h.lstrip('.') or host.endswith(h) for h in PUSH_HOSTS)


def vapid_header(endpoint, priv, pub, subject):
    u = urllib.parse.urlsplit(endpoint)
    head = b64u(json.dumps({'typ': 'JWT', 'alg': 'ES256'}, separators=(',', ':')).encode())
    claims = b64u(json.dumps({'aud': '%s://%s' % (u.scheme, u.netloc), 'exp': int(time.time()) + 12 * 3600, 'sub': subject}, separators=(',', ':')).encode())
    sig = b64u(sign_es256(priv, ('%s.%s' % (head, claims)).encode()))
    return 'vapid t=%s.%s.%s, k=%s' % (head, claims, sig, b64u(pub))


def send(sub, message, priv, pub, subject, ttl=86400, urgency='normal'):
    """Отправить одно уведомление. Возвращает HTTP-код службы push (201 — принято, 404/410 — подписки больше нет)."""
    if not endpoint_ok(sub['endpoint']):
        return 400
    body = encrypt_payload(json.dumps(message, ensure_ascii=False).encode(), sub['p256dh'], sub['auth'])
    req = urllib.request.Request(sub['endpoint'], data=body, method='POST', headers={
        'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'TTL': str(ttl), 'Urgency': urgency,
        'Authorization': vapid_header(sub['endpoint'], priv, pub, subject)})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        e.close()
        return e.code
    except (urllib.error.URLError, OSError):
        return 0
