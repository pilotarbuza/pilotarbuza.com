/* pilotarbuza.com/me — дата съёмки и координаты из фото (EXIF) прямо в браузере, без загрузки снимка на сервер.
   Понимает JPEG и HEIC/HEIF (формат камеры iPhone). Возвращает { date: 'YYYY-MM-DD', time: 'HH:MM', lat, lon } или поля null. */
window.EXIF = (() => {
  const read = (file, start, len) => file.slice(start, start + len).arrayBuffer().then(b => new DataView(b));
  const str = (dv, off, n) => { let s = ''; for (let i = 0; i < n && off + i < dv.byteLength; i++) s += String.fromCharCode(dv.getUint8(off + i)); return s; };

  // разбор блока TIFF (с него начинается EXIF и в JPEG, и в HEIC)
  function tiff(dv, base) {
    const le = dv.getUint16(base) === 0x4949;
    const u16 = o => dv.getUint16(base + o, le), u32 = o => dv.getUint32(base + o, le);
    const rat = o => { const d = u32(o + 4); return d ? u32(o) / d : 0; };
    const ifd = off => {
      const out = {}, n = u16(off);
      for (let i = 0; i < n; i++) {
        const e = off + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4);
        const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 }[type] || 1;
        const vo = count * size > 4 ? u32(e + 8) : e + 8;
        if (type === 2) out[tag] = str(dv, base + vo, count).replace(/\0+$/, '');
        else if (type === 3) out[tag] = u16(vo);
        else if (type === 4) out[tag] = u32(vo);
        else if (type === 5) out[tag] = Array.from({ length: count }, (_, k) => rat(vo + k * 8));
        else if (type === 1 || type === 7) out[tag] = str(dv, base + vo, Math.min(count, 8));
      }
      return out;
    };
    const ifd0 = ifd(u32(4));
    const exif = ifd0[0x8769] ? ifd(ifd0[0x8769]) : {};
    const gps = ifd0[0x8825] ? ifd(ifd0[0x8825]) : {};
    const dms = v => (Array.isArray(v) ? v[0] + (v[1] || 0) / 60 + (v[2] || 0) / 3600 : null);
    let lat = dms(gps[2]), lon = dms(gps[4]);
    if (lat !== null && /S/i.test(gps[1] || '')) lat = -lat;
    if (lon !== null && /W/i.test(gps[3] || '')) lon = -lon;
    if (lat === 0 && lon === 0) lat = lon = null;
    const dt = exif[0x9003] || exif[0x9004] || ifd0[0x0132] || '';
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(dt);
    return { date: m ? `${m[1]}-${m[2]}-${m[3]}` : null, time: m ? `${m[4]}:${m[5]}` : null, lat, lon };
  }

  async function jpeg(file) {
    let off = 2;
    for (let guard = 0; guard < 40 && off < file.size; guard++) {
      const h = await read(file, off, 4);
      if (h.getUint8(0) !== 0xFF) return null;
      const marker = h.getUint8(1), len = h.getUint16(2);
      if (marker === 0xE1) {
        const seg = await read(file, off + 4, len - 2);
        if (str(seg, 0, 4) === 'Exif') return tiff(seg, 6);
      }
      if (marker === 0xDA) return null;
      off += 2 + len;
    }
    return null;
  }

  // HEIC: коробки ISO BMFF → meta → iinf (ищем элемент типа Exif) → iloc (где он лежит в файле)
  async function heic(file) {
    const head = await read(file, 0, Math.min(file.size, 512 * 1024));
    const boxes = (start, end) => {
      const out = [];
      for (let o = start; o + 8 <= end;) {
        let size = head.getUint32(o); const type = str(head, o + 4, 4); let hdr = 8;
        if (size === 1) { size = Number(head.getBigUint64(o + 8)); hdr = 16; } else if (size === 0) size = end - o;
        if (size < hdr) break;
        out.push({ type, start: o + hdr, end: Math.min(o + size, end) });
        o += size;
      }
      return out;
    };
    const meta = boxes(0, head.byteLength).find(b => b.type === 'meta');
    if (!meta) return null;
    const inner = boxes(meta.start + 4, meta.end);
    const iinf = inner.find(b => b.type === 'iinf'), iloc = inner.find(b => b.type === 'iloc');
    if (!iinf || !iloc) return null;
    // iinf: версия, количество, затем infe
    const iv = head.getUint8(iinf.start);
    let exifId = null;
    for (const b of boxes(iinf.start + 4 + (iv === 0 ? 2 : 4), iinf.end)) {
      if (b.type !== 'infe') continue;
      const v = head.getUint8(b.start);
      if (v < 2) continue;
      const id = v === 2 ? head.getUint16(b.start + 4) : head.getUint32(b.start + 4);
      const typeOff = b.start + 4 + (v === 2 ? 2 : 4) + 2;
      if (str(head, typeOff, 4) === 'Exif') { exifId = id; break; }
    }
    if (exifId === null) return null;
    let o = iloc.start;
    const v = head.getUint8(o); o += 4;
    const a = head.getUint8(o), b2 = head.getUint8(o + 1); o += 2;
    const offSize = a >> 4, lenSize = a & 15, baseSize = b2 >> 4, idxSize = v >= 1 ? b2 & 15 : 0;
    const num = n => { let x = 0; for (let i = 0; i < n; i++) x = x * 256 + head.getUint8(o + i); o += n; return x; };
    const count = v < 2 ? num(2) : num(4);
    for (let i = 0; i < count; i++) {
      const id = v < 2 ? num(2) : num(4);
      if (v >= 1) num(2);
      num(2);
      const baseOff = num(baseSize), ext = num(2);
      let first = null;
      for (let k = 0; k < ext; k++) { if (idxSize) num(idxSize); const eo = num(offSize), el = num(lenSize); if (k === 0) first = [eo, el]; }
      if (id === exifId && first) {
        const dv = await read(file, baseOff + first[0], first[1]);
        const skip = dv.getUint32(0); // смещение до заголовка TIFF
        return tiff(dv, 4 + skip);
      }
    }
    return null;
  }

  async function parse(file) {
    try {
      const sig = await read(file, 0, 12);
      if (sig.getUint16(0) === 0xFFD8) return await jpeg(file) || {};
      if (str(sig, 4, 4) === 'ftyp') return await heic(file) || {};
    } catch (e) { /* битый или незнакомый файл */ }
    return {};
  }
  return { parse };
})();
