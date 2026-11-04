/* Загрузка CSV (UTF-8, разделитель — запятая, значения в кавычках поддерживаются) */
window.DataLoader = (function () {
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = [];
      } else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    const head = rows.shift().map(h => h.trim());
    return rows.map(r => { const o = {}; head.forEach((h, i) => o[h] = (r[i] ?? '').trim()); return o; });
  }

  const NUM = /^-?\d+([.,]\d+)?$/;
  const TEXT_FIELDS = new Set(['contract_id', 'quarter', 'source', 'note', 'unit', 'price_unit']);
  function typed(o) {
    for (const k in o) {
      const v = o[k];
      if (k === 'is_forecast') o[k] = (v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'да');
      else if (!TEXT_FIELDS.has(k) && NUM.test(v)) o[k] = parseFloat(v.replace(',', '.'));
      else if (v === '' ) o[k] = null;
    }
    return o;
  }

  async function loadCSV(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('Не удалось загрузить ' + url + ' (' + r.status + ')');
    return parseCSV(await r.text()).map(typed);
  }

  async function loadAll(cfg) {
    const out = {};
    await Promise.all(Object.entries(cfg.files).map(async ([k, f]) => { out[k] = await loadCSV(cfg.dataDir + f); }));
    const g = await fetch(cfg.geo.url, { cache: 'no-cache' });
    if (!g.ok) throw new Error('Не удалось загрузить GeoJSON: ' + cfg.geo.url);
    out.geo = await g.json();
    return out;
  }
  return { loadAll, parseCSV };
})();
