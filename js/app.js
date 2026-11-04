/* Основная логика дашборда «Управление реализации газа». Факт 2021–2025, прогноз до 2035 (цены, потоки, потребление, рынки); прогноз по всем графикам. Без KPI-плиток. */
(async function () {
  const C = window.CONFIG;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v, d = 1) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
  const FC = C.forecastLabel;
  const state = { year: null, dir: 'all', gas: 'all', region: 'all', company: 'all', tab: 'overview', lngProject: 'all', lngRegion: 'all' };

  let D;
  try { D = await DataLoader.loadAll(C); }
  catch (e) {
    const el = $('error'); el.hidden = false;
    el.textContent = 'Ошибка загрузки данных: ' + e.message + '. Откройте сайт через локальный веб-сервер (см. README), а не двойным кликом по index.html.';
    return;
  }

  /* ---------- подготовка данных ---------- */
  const uniq = a => [...new Set(a)];
  const factYears = uniq(D.consumption.filter(r => !r.is_forecast).map(r => r.year)).sort((a, b) => a - b);
  const lastFact = factYears[factYears.length - 1];
  const allYears = uniq(D.consumption.map(r => r.year)).sort((a, b) => a - b);     // факт + прогноз
  const isFc = y => y > lastFact;
  const fcYears = allYears.filter(isFc);
  const yLabel = y => y + (isFc(y) ? ' (' + FC + ')' : '');
  const fcColSet = offset => { const s = new Set(); allYears.forEach((y, i) => { if (isFc(y)) s.add(i + offset); }); return s; };
  state.year = lastFact;
  const regionsList = uniq(D.consumption.map(r => r.region)).sort((a, b) => a.localeCompare(b, 'ru'));
  const geoNames = new Set(D.geo.features.map(f => f.properties[C.geo.nameProperty]));
  regionsList.filter(r => !geoNames.has(r)).forEach(r => console.warn('Регион из CSV не найден в GeoJSON:', r));
  const shortByName = {};
  D.geo.features.forEach(f => { shortByName[f.properties[C.geo.nameProperty]] = f.properties[C.geo.shortProperty]; });
  echarts.registerMap('RU', D.geo, {});

  const srcOf = rows => uniq(rows.map(r => r.source).filter(Boolean)).join('; ') || 'не указан';
  const sumBy = (rows, f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
  const consVal = (region, year) => sumBy(D.consumption.filter(r => r.region === region && r.year === year), r => r.volume_bcm);
  const consTotal = year => sumBy(D.consumption.filter(r => r.year === year), r => r.volume_bcm);
  const flow = (dir, year) => D.exportFlows.filter(r => r.direction === dir && r.year === year);
  const pt = (value, src, fc) => ({ value, src, fc: !!fc });
  const flowArr = dir => allYears.map(y => { const f = flow(dir, y); return f.length ? pt(+sumBy(f, r => r.volume_bcm).toFixed(2), srcOf(f), isFc(y)) : null; });

  /* ---------- графики ---------- */
  const charts = {};
  function chart(id) {
    const el = $(id); if (!el) return null;
    let c = charts[id];
    if (c && c.getDom() !== el) { c.dispose(); c = null; }
    if (!c) {
      c = echarts.init(el); charts[id] = c;
      const so = c.setOption.bind(c);   // единый стиль: тултипы и цвет текста
      c.setOption = (o, nm) => {
        if (o.tooltip && !Array.isArray(o.tooltip)) Object.assign(o.tooltip, { backgroundColor: '#ffffff', borderColor: '#c5cedb', textStyle: { color: '#18212f' } });
        o.textStyle = Object.assign({ color: '#33415a', fontSize: 13 }, o.textStyle);
        [].concat(o.yAxis || []).forEach(a => {
          if (a.type === 'value' && a.max == null) a.max = v => { const m = v.max * 1.14, p = Math.pow(10, Math.floor(Math.log10(m)) - 1); return Math.ceil(m / p) * p; };
        });
        (o.series || []).forEach(s => {   // без обводки текста
          if (s.label) Object.assign(s.label, { textBorderWidth: 0, color: s.label.color || '#18212f' });
          if (s.markLine && s.markLine.label) s.markLine.label.textBorderWidth = 0;
          if (s.markArea && s.markArea.label) s.markArea.label.textBorderWidth = 0;
        });
        return so(o, nm);
      };
    }
    return c;
  }
  window.addEventListener('resize', () => Object.values(charts).forEach(c => c.resize()));

  // Общий тултип: период, значение, единица, признак «прогноз», источник
  function tip(unit, dec = 1) {
    return {
      trigger: 'axis', confine: true,
      formatter(ps) {
        ps = Array.isArray(ps) ? ps : [ps];
        let h = '<b>' + esc(ps[0].axisValueLabel ?? ps[0].name) + '</b>'; const srcs = new Set();
        ps.forEach(p => {
          const d = p.data; const v = d && typeof d === 'object' ? d.value : d;
          if (v == null || (d && d.skipTip)) return;
          const u = typeof unit === 'function' ? unit(p.seriesName, p) : unit;
          h += '<br>' + p.marker + ' ' + esc(p.seriesName) + ': <b>' + fmt(v, dec) + '</b> ' + esc(u) + (d && d.fc ? ' <span class="fc-tag">(' + FC + ')</span>' : '');
          if (d && d.src) srcs.add(d.src);
        });
        if (srcs.size) h += '<br><span class="tsrc">Источник: ' + esc([...srcs].join('; ')) + '</span>';
        return h;
      }
    };
  }
  const axisName = (name) => ({ name, nameTextStyle: { color: '#5d6b80', align: 'left', padding: [0, 0, 6, 0] }, axisLabel: { color: '#5d6b80' }, splitLine: { lineStyle: { color: '#e9edf3' } } });
  const baseOpt = (o) => {
    // в легенде — только фактические ряды (прогноз показан заливкой и пунктиром); больше места сверху и снизу
    const names = (o.series || []).map(s => s.name).filter(n => n && n !== 'Итого' && !String(n).endsWith(' — ' + FC));
    const r = Object.assign({ animation: false, grid: { left: 52, right: 24, top: names.length >= 3 ? 104 : 80, bottom: 44, containLabel: true }, legend: { top: 0, type: 'plain', itemGap: 18, textStyle: { color: '#33415a' }, data: names } }, o);
    if (o.legend && o.legend.show !== false && !o.legend.data) r.legend = Object.assign({ itemGap: 18, data: names }, o.legend);
    return r;
  };

  // Прогноз: заливка зоны, пунктирные линии, полупрозрачные столбцы
  const fcArea = () => fcYears.length ? { silent: true, itemStyle: { color: 'rgba(240,179,74,.14)' }, label: { color: '#9a5b00', fontWeight: 600, position: 'insideTop', distance: 6 }, data: [[{ name: 'Прогноз', xAxis: String(fcYears[0]) }, { xAxis: String(fcYears[fcYears.length - 1]) }]] } : undefined;
  const lineFc = (name, color, arr, extra = {}) => [
    Object.assign({ name, type: 'line', symbolSize: 7, itemStyle: { color }, lineStyle: { width: 3 }, data: arr.map(o => o && !o.fc ? o : null) }, extra),
    { name: name + ' — ' + FC, type: 'line', symbol: 'diamond', symbolSize: 7, itemStyle: { color }, lineStyle: { width: 2, type: 'dashed' },
      data: arr.map((o, i) => o && o.fc ? o : (allYears[i] === lastFact && o ? Object.assign({}, o, { skipTip: true }) : null)) }
  ];
  const barData = (arr, color) => arr.map(o => o && o.fc ? Object.assign({}, o, { itemStyle: { color, opacity: .5, borderColor: color, borderType: 'dashed', borderWidth: 1 } }) : o);
  const yearAxis = () => ({ type: 'category', data: allYears.map(String) });

  /* ---------- таблицы ---------- */
  function table(head, rows, opts = {}) {
    const fcCols = opts.fcCols || new Set();
    let h = '<table><thead><tr>' + head.map((t, i) => '<th class="' + (fcCols.has(i) ? 'fc' : '') + '">' + t + '</th>').join('') + '</tr></thead><tbody>';
    rows.forEach((r, ri) => {
      const cls = [r.cls, (opts.rowClass && opts.rowClass(r, ri)) || ''].join(' ');
      h += '<tr class="' + cls + '"' + (r.attr || '') + '>' + r.cells.map((c, i) => '<td class="' + (fcCols.has(i) ? 'fc ' : '') + (opts.wrapCols && opts.wrapCols.has(i) ? 'wrap' : '') + '">' + c + '</td>').join('') + '</tr>';
    });
    return h + '</tbody></table>';
  }
  const R = (cells, extra = {}) => Object.assign({ cells }, extra);

  /* ====================== 1. КАРТА + ДЕТАЛИЗАЦИЯ ====================== */
  const mapMax = Math.max(...D.consumption.map(r => r.volume_bcm));
  function renderMap(p) {
    const c = chart(p + 'map'); if (!c) return;
    const data = regionsList.map(n => ({ name: n, value: +consVal(n, state.year).toFixed(2), selected: n === state.region }));
    const hasShort = C.geo.showLabels && Object.values(shortByName).some(Boolean);
    c.setOption({
      animation: false,
      tooltip: {
        trigger: 'item', confine: true,
        formatter: q => {
          const rows = D.consumption.filter(r => r.region === q.name && r.year === state.year);
          const v = q.value;
          return '<b>' + esc(q.name) + '</b><br>' + state.year + ' г.: <b>' + (v == null || isNaN(v) ? 'нет данных' : fmt(v, 2) + ' млрд куб. м') + '</b>' +
            (isFc(state.year) ? ' <span class="fc-tag">(' + FC + ')</span>' : '') +
            '<br><span class="tsrc">Источник: ' + esc(srcOf(rows)) + ' · ' + (isFc(state.year) ? FC : 'факт') + '</span>';
        }
      },
      visualMap: {
        min: 0, max: Math.ceil(mapMax / 5) * 5, calculable: true, orient: 'horizontal', left: 10, bottom: 4, itemWidth: 14, itemHeight: 140,
        text: ['млрд куб. м', ''], inRange: { color: C.mapColors }, textStyle: { color: '#33415a' }
      },
      series: [{
        type: 'map', map: 'RU', nameProperty: C.geo.nameProperty, aspectScale: 1, roam: false, top: 10, bottom: 46, left: 4, right: 4,
        selectedMode: 'single', data,
        itemStyle: { areaColor: C.mapNoData, borderColor: C.mapBorder, borderWidth: 1 },
        emphasis: { itemStyle: { borderColor: '#18212f', borderWidth: 2 }, label: { show: hasShort } },
        select: { itemStyle: { borderColor: C.mapSelectedBorder, borderWidth: 3 }, label: { show: hasShort, color: '#fff' } },
        label: { show: hasShort, fontSize: 10, color: '#18212f', formatter: q => shortByName[q.name] || '' }
      }]
    }, true);
    c.off('click');
    c.on('click', q => { state.region = (state.region === q.name) ? 'all' : q.name; $('f-region').value = state.region; render(); });
    renderDetail(p);
  }

  function renderDetail(p) {
    const reg = state.region;
    $(p + 'detail-title').textContent = reg === 'all' ? 'Россия — всего' : reg;
    const vals = allYears.map(y => reg === 'all' ? consTotal(y) : consVal(reg, y));
    const rows = reg === 'all' ? D.consumption : D.consumption.filter(r => r.region === reg);
    const colorOf = y => y === state.year ? C.mapColors[5] : C.mapColors[3];
    const c = chart(p + 'detail-chart');
    c.setOption(baseOpt({
      legend: { show: false }, grid: { left: 40, right: 12, top: 54, bottom: 26, containLabel: true }, tooltip: Object.assign(tip('млрд куб. м', 2), { axisPointer: { type: 'shadow' } }),
      xAxis: { type: 'category', data: allYears.map(String), axisLabel: { fontSize: 10, interval: 1 } },
      yAxis: Object.assign({ type: 'value' }, axisName('млрд куб. м')),
      series: [{
        name: 'Потребление', type: 'bar', barMaxWidth: 26, label: { show: allYears.length <= 16 && $('ov-detail-chart') === $(p + 'detail-chart'), position: 'top', fontSize: 11, formatter: q => fmt(q.value, 0) },
        markArea: fcArea(),
        data: allYears.map((y, i) => { const o = pt(+vals[i].toFixed(2), srcOf(rows.filter(r => r.year === y)), isFc(y)); o.itemStyle = isFc(y) ? { color: colorOf(y), opacity: .5, borderColor: colorOf(y), borderType: 'dashed', borderWidth: 1 } : { color: colorOf(y) }; return o; })
      }]
    }), true);
    const tot = allYears.map(consTotal);
    if (!$(p + 'detail-table')) return;
    $(p + 'detail-table').innerHTML = '<div>' + table(['Год', 'млрд куб. м', 'Доля в РФ, %'],
      allYears.map((y, i) => R([yLabel(y), fmt(vals[i], 2), reg === 'all' ? '100,0' : fmt(vals[i] / tot[i] * 100, 2)], { cls: y === state.year ? 'sel' : (isFc(y) ? 'fc' : '') }))) + '</div>';
  }

  /* таблица регионов (вкладка «Регионы РФ») */
  function renderRegTable() {
    const rows = regionsList.map(n => ({ n, v: allYears.map(y => consVal(n, y)) }));
    const iy = allYears.indexOf(state.year);
    rows.sort((a, b) => b.v[iy] - a.v[iy]);
    const body = rows.map(r => R([esc(r.n)].concat(r.v.map(v => fmt(v, 2))).concat([fmt(r.v[iy] / consTotal(state.year) * 100, 1)]),
      { cls: 'click' + (r.n === state.region ? ' sel' : ''), attr: ' data-region="' + esc(r.n) + '"' }));
    body.push(R(['Итого по РФ'].concat(allYears.map(y => fmt(consTotal(y), 2))).concat(['100,0']), { cls: 'total' }));
    $('tb-reg-table').innerHTML = table(['Регион, млрд куб. м'].concat(allYears.map(yLabel)).concat(['Доля ' + state.year + ', %']), body, { fcCols: fcColSet(1) });
    $('tb-reg-table').querySelectorAll('tr[data-region]').forEach(tr => tr.onclick = () => {
      state.region = state.region === tr.dataset.region ? 'all' : tr.dataset.region; $('f-region').value = state.region; render();
    });
  }

  /* ====================== 2. ЭКСПОРТНЫЕ ПОТОКИ (диаграмма Санкея) ====================== */
  function renderScheme() {
    const y = state.year, dir = state.dir;
    const yTxt = y + (isFc(y) ? ' (' + FC + ')' : '');
    const showPipe = state.gas !== 'lng', showLng = state.gas !== 'pipe';
    $('ov-sankey-pipe').style.display = showPipe ? '' : 'none';
    $('ov-sankey-lng').style.display = showLng ? '' : 'none';
    const midNodes = ['Запад («Турецкий поток»)', 'Восток («Сила Сибири»)', 'Юг (Средняя Азия)'];   // у промежуточных узлов — только название
    const sk = (id, title, unit, nodes, links, colors) => {
      chart(id).setOption({
        animation: false, title: { text: title.toUpperCase(), left: 0, top: 0, textStyle: { fontSize: 14, fontWeight: 600, color: '#33415a' } },
        tooltip: {
          trigger: 'item', confine: true,
          formatter: q => q.dataType === 'edge'
            ? '<b>' + esc(q.data.source) + ' → ' + esc(q.data.target) + '</b><br>' + yTxt + ' г.<br><b>' + fmt(q.data.value, 1) + '</b> ' + unit + '<br><span class="tsrc">Источник: ' + esc(q.data.src) + '</span>'
            : '<b>' + esc(q.name) + '</b><br>' + yTxt + ' г.<br><b>' + fmt(q.value, 1) + '</b> ' + unit
        },
        series: [{
          type: 'sankey', top: 34, bottom: 6, left: 6, right: '32%', nodeWidth: 14, nodeGap: 14, draggable: false, layoutIterations: 0,
          emphasis: { focus: 'adjacency' }, lineStyle: { color: 'gradient', opacity: 0.45, curveness: 0.5 },
          label: { fontSize: 13, color: '#18212f', formatter: q => q.name + ' · ' + fmt(q.value, 1) + ' ' + unit },
          data: nodes.map(n => ({ name: n, itemStyle: { color: colors[n] || '#8a94a6' }, label: midNodes.includes(n) ? { formatter: q => q.name } : undefined })), links
        }]
      }, true);
    };
    if (showPipe) {
      const dirs = { west: 'Запад («Турецкий поток»)', east: 'Восток («Сила Сибири»)', south: 'Юг (Средняя Азия)' };
      const links = [];
      const add = (s, t, v, src) => { if (v > 0) links.push({ source: s, target: t, value: +v.toFixed(2), src }); };
      ['west', 'east'].forEach(d => { if (dir === 'all' || dir === d) { const f = flow(d, y); add('Россия', dirs[d], sumBy(f, r => r.volume_bcm), srcOf(f)); add(dirs[d], d === 'west' ? 'Европа' : 'Китай', sumBy(f, r => r.volume_bcm), srcOf(f)); } });
      if (dir === 'all' || dir === 'south') {
        const f = flow('south', y); add('Россия', dirs.south, sumBy(f, r => r.volume_bcm), srcOf(f));
        countries().forEach(c => { const rr = D.centralAsia.filter(r => r.country === c && r.year === y); add(dirs.south, c, sumBy(rr, r => r.volume_bcm), srcOf(rr)); });
      }
      const nodes = uniq(links.flatMap(l => [l.source, l.target]));
      sk('ov-sankey-pipe', 'Трубопроводный газ, млрд куб. м · ' + yTxt, 'млрд куб. м', nodes, links,
        { 'Россия': '#12263f', [dirs.west]: C.colors.west, 'Европа': C.colors.west, [dirs.east]: C.colors.east, 'Китай': C.colors.east, [dirs.south]: C.colors.south, ...C.colors.countries });
    }
    if (showLng) {
      const links = []; const regOk = r => dir === 'all' || (dir === 'west' && r === 'Европа') || (dir === 'east' && r === 'Азия');
      uniq(D.lngExports.map(r => r.project)).forEach(pj => ['Европа', 'Азия'].forEach(rg => {
        if (!regOk(rg)) return;
        const rr = D.lngExports.filter(r => r.project === pj && r.buyer_region === rg && r.year === y), v = sumBy(rr, r => r.volume_mt);
        if (v > 0) links.push({ source: pj, target: rg, value: +v.toFixed(2), src: srcOf(rr) });
      }));
      const nodes = uniq(links.flatMap(l => [l.source, l.target]));
      sk('ov-sankey-lng', 'СПГ, млн т · ' + yTxt + (links.length ? '' : ' — нет СПГ-потоков для выбранного направления'), 'млн т', nodes, links,
        { 'Европа': C.colors.west, 'Азия': C.colors.east, 'Ямал СПГ': '#7a4fb0', 'Сахалин-2': '#d9822b', 'Арктик СПГ-2': '#2a9d8f' });
    }
  }

  /* ====================== 5. ДОБЫЧА (только факт) ====================== */
  const quarters = () => { const out = []; uniq(D.production.map(r => r.year)).sort().forEach(y => ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => out.push([y, q]))); return out; };
  const prodVal = (c, y, q) => sumBy(D.production.filter(r => r.company === c && r.year === y && (!q || r.quarter === q)), r => r.volume_bcm);
  const shownCompanies = () => state.company === 'all' ? C.companies : [state.company];
  const prodArea = qs => { const f = qs.filter(([y]) => isFc(y)); return f.length ? { silent: true, itemStyle: { color: 'rgba(240,179,74,.14)' }, label: { color: '#9a5b00', fontWeight: 600 }, data: [[{ name: 'Прогноз', xAxis: f[0][0] + '-' + f[0][1] }, { xAxis: f[f.length - 1][0] + '-' + f[f.length - 1][1] }]] } : undefined; };
  const qLabel = ([y, q]) => y + '-' + q;
  function renderProdStack(id) {
    const qs = quarters();
    chart(id).setOption(baseOpt({
      tooltip: Object.assign(tip('млрд куб. м'), { axisPointer: { type: 'shadow' } }),
      dataZoom: [{ type: 'inside' }],
      xAxis: { type: 'category', data: qs.map(qLabel), axisLabel: { rotate: 60, fontSize: 10, interval: id === 'ov-prod' ? 3 : 1 } },
      yAxis: Object.assign({ type: 'value' }, axisName('млрд куб. м')),
      series: shownCompanies().map((c, i) => ({
        name: c, type: 'bar', stack: 'prod', itemStyle: { color: C.colors.companies[c] }, barMaxWidth: 26, markArea: i === 0 ? prodArea(qs) : undefined,
        data: barData(qs.map(([y, q]) => pt(+prodVal(c, y, q).toFixed(1), srcOf(D.production.filter(r => r.company === c && r.year === y && r.quarter === q)), isFc(y))), C.colors.companies[c])
      }))
    }), true);
  }
  // Обзор: годовая добыча по компаниям (факт + прогноз)
  function renderProdAnnual(id) {
    const tot = allYears.map(y => { const rr = D.production.filter(r => r.year === y && shownCompanies().includes(r.company)); return pt(+sumBy(rr, r => r.volume_bcm).toFixed(1), srcOf(rr), isFc(y)); });
    chart(id).setOption(baseOpt({
      tooltip: Object.assign(tip('млрд куб. м'), { axisPointer: { type: 'shadow' } }), xAxis: yearAxis(),
      yAxis: Object.assign({ type: 'value' }, axisName('млрд куб. м')),
      series: shownCompanies().map((c, i) => ({
        name: c, type: 'bar', stack: 'prod', itemStyle: { color: C.colors.companies[c] }, barMaxWidth: 44, markArea: i === 0 ? fcArea() : undefined,
        data: barData(allYears.map(y => { const rr = D.production.filter(r => r.company === c && r.year === y); return pt(+sumBy(rr, r => r.volume_bcm).toFixed(1), srcOf(rr), isFc(y)); }), C.colors.companies[c])
      })).concat([totalSeries(tot)])
    }), true);
  }
  function renderProdShare(id) {
    const qs = quarters(); const lastIdx = qs.map(([y]) => y).lastIndexOf(lastFact);
    const series = [];
    shownCompanies().forEach((c, ci) => {
      const arr = qs.map(([y, q]) => { const t = sumBy(C.companies, k => prodVal(k, y, q)); return pt(t ? +(prodVal(c, y, q) / t * 100).toFixed(2) : null, srcOf(D.production.filter(r => r.year === y && r.quarter === q)), isFc(y)); });
      const col = C.colors.companies[c];
      series.push({ name: c, type: 'line', symbolSize: 5, itemStyle: { color: col }, markArea: ci === 0 ? prodArea(qs) : undefined, data: arr.map(o => o.fc ? null : o) });
      series.push({ name: c + ' — ' + FC, type: 'line', symbol: 'diamond', symbolSize: 5, itemStyle: { color: col }, lineStyle: { type: 'dashed' },
        data: arr.map((o, i) => o.fc ? o : (i === lastIdx ? Object.assign({}, o, { skipTip: true }) : null)) });
    });
    chart(id).setOption(baseOpt({
      tooltip: tip('%'), xAxis: { type: 'category', data: qs.map(qLabel), axisLabel: { rotate: 60, fontSize: 10, interval: 1 } },
      yAxis: Object.assign({ type: 'value', min: 0 }, axisName('% от добычи РФ')), series
    }), true);
  }
  function renderProdTable(id) {
    const ys = uniq(D.production.map(r => r.year)).sort();
    const body = shownCompanies().map(c => R([c].concat(ys.map(y => fmt(prodVal(c, y), 1)))));
    body.push(R(['Итого по РФ'].concat(ys.map(y => fmt(sumBy(C.companies, c => prodVal(c, y)), 1))), { cls: 'total' }));
    const fcCols = new Set(); ys.forEach((y, i) => { if (isFc(y)) fcCols.add(i + 1); });
    $(id).innerHTML = '<div class="unit">Сумма кварталов за год, млрд куб. м · факт и прогноз</div>' + table(['Компания'].concat(ys.map(yLabel)), body, { fcCols });
  }
  /* ====== отрасли потребления и собственная добыча (Европа, Китай, Средняя Азия) ====== */
  const SECTORS = [['электроэнергетика', 'Электроэнергетика'], ['промышленность', 'Промышленность'], ['население_и_услуги', 'Население и услуги'], ['прочее', 'Прочее']];
  const totalSeries = arr => ({ name: 'Итого', type: 'line', symbol: 'circle', symbolSize: 0, silent: true, z: 5, lineStyle: { width: 0 }, emphasis: { disabled: true },
    label: { show: true, position: 'top', fontSize: 11, fontWeight: 600, formatter: q => fmt(q.value, 0) }, data: arr });
  const sectorChart = (id, arrFn, totArr, ymax) => chart(id).setOption(baseOpt({
    tooltip: Object.assign(tip('млрд куб. м'), { axisPointer: { type: 'shadow' } }), xAxis: yearAxis(), yAxis: Object.assign({ type: 'value', max: ymax }, axisName('млрд куб. м')),
    series: SECTORS.map(([k, n], i) => ({ name: n, type: 'bar', stack: 's', barMaxWidth: 36, itemStyle: { color: C.colors.sectors[n] }, markArea: i === 0 ? fcArea() : undefined, data: barData(arrFn('потребление_' + k), C.colors.sectors[n]) }))
      .concat(totArr ? [totalSeries(totArr)] : [])
  }), true);  const prodLine = (id, arr) => chart(id).setOption(baseOpt({
    tooltip: tip('млрд куб. м'), xAxis: yearAxis(), yAxis: Object.assign({ type: 'value', min: 0 }, axisName('млрд куб. м')),
    series: lineFc('Собственная добыча', C.colors.ownProd, arr, { markArea: fcArea() })
  }), true);
  const EXTRA_ROWS = [['собственная_добыча', 'Собственная добыча']].concat(SECTORS.map(([k, n]) => ['потребление_' + k, 'Потребление: ' + n.toLowerCase()]));
  /* ====================== 6. ЕВРОПА ====================== */
  const eu = (ind, y) => D.europe.find(r => r.indicator === ind && r.year === y);
  const euArr = ind => allYears.map(y => { const r = eu(ind, y); return r ? pt(r.value, r.source, r.is_forecast) : null; });
  // Обзор: весь ресурс газа (добыча + импорт труб + СПГ) и потребление по отраслям. Итог по годам одинаков в обоих графиках, шкала общая.
  function resourceChart(id, arrOf, prodKey, shareArr, totArr, ymax) {
    chart(id).setOption(baseOpt({
      tooltip: tip(n => n.startsWith('Доля') ? '%' : 'млрд куб. м'), xAxis: yearAxis(),
      yAxis: [Object.assign({ type: 'value', max: ymax }, axisName('млрд куб. м')), Object.assign({ type: 'value', min: 0, max: 100, position: 'right' }, axisName('%'), { splitLine: { show: false } })],
      series: [
        { name: 'Собственная добыча', type: 'bar', stack: 'r', itemStyle: { color: C.colors.ownProd }, data: barData(arrOf(prodKey), C.colors.ownProd), markArea: fcArea() },
        { name: 'Импорт трубопроводный', type: 'bar', stack: 'r', itemStyle: { color: C.colors.pipe }, data: barData(arrOf('импорт_трубопроводный'), C.colors.pipe) },
        { name: 'Импорт СПГ', type: 'bar', stack: 'r', itemStyle: { color: C.colors.lngSeries }, data: barData(arrOf('импорт_СПГ'), C.colors.lngSeries) },
        totalSeries(totArr),
        ...lineFc('Доля России в импорте', C.colors.share, shareArr).map(s => Object.assign(s, { yAxisIndex: 1 }))
      ]
    }), true);
  }
  const ymaxOf = arr => Math.ceil(Math.max(...arr.filter(Boolean).map(o => o.value)) * 1.12 / 50) * 50;
  function renderEuropeOv() {
    const tot = euArr('потребление'), ymax = ymaxOf(tot);
    resourceChart('ov-europe', euArr, 'собственная_добыча', euArr('доля_России'), tot, ymax);
    sectorChart('ov-eu-sect', euArr, tot, ymax);
  }  function renderEuropeTab() {
    chart('tb-eu-a').setOption(baseOpt({
      tooltip: tip('млрд куб. м'), xAxis: yearAxis(), yAxis: Object.assign({ type: 'value', min: 0 }, axisName('млрд куб. м')),
      series: [...lineFc('Потребление', C.colors.cons, euArr('потребление'), { markArea: fcArea() }), ...lineFc('Импорт всего', C.colors.west, euArr('импорт_всего'))]
    }), true);
    chart('tb-eu-b').setOption(baseOpt({
      tooltip: Object.assign(tip('млрд куб. м'), { axisPointer: { type: 'shadow' } }), xAxis: yearAxis(), yAxis: Object.assign({ type: 'value' }, axisName('млрд куб. м')),
      series: [{ name: 'Импорт трубопроводный', type: 'bar', stack: 'i', itemStyle: { color: C.colors.pipe }, data: barData(euArr('импорт_трубопроводный'), C.colors.pipe), markArea: fcArea() },
        { name: 'Импорт СПГ', type: 'bar', stack: 'i', itemStyle: { color: C.colors.lngSeries }, data: barData(euArr('импорт_СПГ'), C.colors.lngSeries) }]
    }), true);
    chart('tb-eu-c').setOption(baseOpt({
      tooltip: tip('%'), xAxis: yearAxis(), yAxis: Object.assign({ type: 'value', min: 0 }, axisName('% от импорта')),
      series: lineFc('Доля России в импорте', C.colors.share, euArr('доля_России'), { markArea: fcArea(), label: { show: true, position: 'top', distance: 10, formatter: q => fmt(q.value, 1) + '%', fontSize: 11 } })
    }), true);
    prodLine('tb-eu-d', euArr('собственная_добыча')); sectorChart('tb-eu-e', euArr);
    const inds = [['потребление', 'Потребление'], ['импорт_всего', 'Импорт всего'], ['импорт_трубопроводный', 'Импорт трубопроводного газа'], ['импорт_СПГ', 'Импорт СПГ'], ['доля_России', 'Доля России в импорте']].concat(EXTRA_ROWS);
    $('tb-eu-table').innerHTML = table(['Показатель', 'Ед.'].concat(allYears.map(yLabel)), inds.map(([k, n]) => {
      const u = (D.europe.find(r => r.indicator === k) || {}).unit === '%' ? '%' : 'млрд куб. м';
      return R([n, u].concat(allYears.map(y => { const r = eu(k, y); return r ? fmt(r.value, 1) : '—'; })));
    }), { fcCols: fcColSet(2) });
  }

  /* ====================== 7. КИТАЙ ====================== */
  const cn = (ind, y) => D.china.find(r => r.indicator === ind && r.year === y);
  const cnArr = ind => allYears.map(y => { const r = cn(ind, y); return r ? pt(r.value_bcm, r.source, r.is_forecast) : null; });
  // Доля России = экспорт РФ «на восток» (export_flows) / импорт трубопроводного газа Китаем
  const cnShare = () => allYears.map(y => {
    const imp = cn('импорт_трубопроводный', y), ex = flow('east', y);
    return imp && ex.length && imp.value_bcm ? pt(+(sumBy(ex, r => r.volume_bcm) / imp.value_bcm * 100).toFixed(1), 'расчёт: export_flows (east) / china_market', isFc(y)) : null;
  });
  function renderChinaOv() {
    const tot = cnArr('потребление'), ymax = ymaxOf(tot);
    resourceChart('ov-china', cnArr, 'собственная_добыча', cnShare(), tot, ymax);
    sectorChart('ov-cn-sect', cnArr, tot, ymax);
  }  function renderChinaTab() {
    chart('tb-cn-a').setOption(baseOpt({
      tooltip: Object.assign(tip('млрд куб. м'), { axisPointer: { type: 'shadow' } }), xAxis: yearAxis(), yAxis: Object.assign({ type: 'value', min: 0 }, axisName('млрд куб. м')),
      series: [{ name: 'Импорт трубопроводный', type: 'bar', stack: 'i', itemStyle: { color: C.colors.pipe }, data: barData(cnArr('импорт_трубопроводный'), C.colors.pipe), markArea: fcArea() },
        { name: 'Импорт СПГ', type: 'bar', stack: 'i', itemStyle: { color: C.colors.lngSeries }, data: barData(cnArr('импорт_СПГ'), C.colors.lngSeries) },
        ...lineFc('Потребление', C.colors.cons, cnArr('потребление'))]
    }), true);
    chart('tb-cn-b').setOption(baseOpt({
      tooltip: tip('%'), xAxis: yearAxis(), yAxis: Object.assign({ type: 'value', min: 0, max: 100 }, axisName('% от трубопроводного импорта')),
      series: lineFc('Доля России', C.colors.share, cnShare(), { markArea: fcArea(), label: { show: true, position: 'top', distance: 10, formatter: q => fmt(q.value, 1) + '%', fontSize: 11 } })
    }), true);
    prodLine('tb-cn-c', cnArr('собственная_добыча')); sectorChart('tb-cn-d', cnArr);
    const inds = [['потребление', 'Потребление'], ['импорт_трубопроводный', 'Импорт трубопроводного газа'], ['импорт_СПГ', 'Импорт СПГ']].concat(EXTRA_ROWS);
    const body = inds.map(([k, n]) => R([n, 'млрд куб. м'].concat(allYears.map(y => { const r = cn(k, y); return r ? fmt(r.value_bcm, 1) : '—'; }))));
    body.push(R(['Доля России в трубопроводном импорте', '%'].concat(cnShare().map(s => s ? fmt(s.value, 1) : '—'))));
    $('tb-cn-table').innerHTML = table(['Показатель', 'Ед.'].concat(allYears.map(yLabel)), body, { fcCols: fcColSet(2) }) + '<div class="unit">Доля России рассчитана как экспорт «на восток» (export_flows) / импорт трубопроводного газа Китаем.</div>';
  }

  /* ====================== 8. СРЕДНЯЯ АЗИЯ ====================== */
  const countries = () => uniq(D.centralAsia.map(r => r.country));
  function renderCA(id, withTable) {
    chart(id).setOption(baseOpt({
      tooltip: Object.assign(tip('млрд куб. м'), { axisPointer: { type: 'shadow' } }), xAxis: yearAxis(), yAxis: Object.assign({ type: 'value' }, axisName('млрд куб. м')),
      series: countries().map((c, i) => ({
        name: c, type: 'bar', stack: 'ca', barMaxWidth: 40, itemStyle: { color: C.colors.countries[c] }, markArea: i === 0 ? fcArea() : undefined,
        data: barData(allYears.map(y => { const r = D.centralAsia.find(x => x.country === c && x.year === y); return r ? pt(r.volume_bcm, r.source, r.is_forecast) : null; }), C.colors.countries[c])
      }))
    }), true);
    if (withTable) {
      const cam = (ind, country) => allYears.map(y => { const rr = D.centralAsiaMarket.filter(r => r.indicator === ind && r.year === y && (!country || r.country === country)); return rr.length ? pt(+sumBy(rr, r => r.value_bcm).toFixed(2), srcOf(rr), isFc(y)) : null; });
      chart('tb-ca-prod').setOption(baseOpt({
        tooltip: Object.assign(tip('млрд куб. м'), { axisPointer: { type: 'shadow' } }), xAxis: yearAxis(), yAxis: Object.assign({ type: 'value' }, axisName('млрд куб. м')),
        series: countries().map((c, i) => ({ name: c, type: 'bar', stack: 'p', barMaxWidth: 36, itemStyle: { color: C.colors.countries[c] }, markArea: i === 0 ? fcArea() : undefined, data: barData(cam('собственная_добыча', c), C.colors.countries[c]) }))
      }), true);
      sectorChart('tb-ca-sect', ind => cam(ind));
      const v2 = (ind, c) => cam(ind, c).map(o => o ? fmt(o.value, 1) : '—');
      const body2 = [];
      countries().forEach(c => { body2.push(R([c + ': собственная добыча'].concat(v2('собственная_добыча', c)))); body2.push(R([c + ': потребление'].concat(v2('потребление', c)))); });
      SECTORS.forEach(([k, n]) => body2.push(R(['Три страны, потребление: ' + n.toLowerCase()].concat(v2('потребление_' + k)))));
      body2.push(R(['Три страны, потребление всего'].concat(v2('потребление')), { cls: 'total' }));
      $('tb-ca-table2').innerHTML = '<div class="unit">млрд куб. м</div>' + table(['Показатель'].concat(allYears.map(yLabel)), body2, { fcCols: fcColSet(1) });
      const body = countries().map(c => R([c].concat(allYears.map(y => fmt(sumBy(D.centralAsia.filter(r => r.country === c && r.year === y), r => r.volume_bcm), 1)))));
      body.push(R(['Итого'].concat(allYears.map(y => fmt(sumBy(D.centralAsia.filter(r => r.year === y), r => r.volume_bcm), 1))), { cls: 'total' }));
      $('tb-ca-table').innerHTML = '<div class="unit">млрд куб. м</div>' + table(['Страна'].concat(allYears.map(yLabel)), body, { fcCols: fcColSet(1) });
    }
  }

  /* ====================== СПГ-КОНТРАКТЫ ====================== */
  function renderLng() {
    const projects = uniq(D.contracts.filter(r => r.volume_mtpa != null).map(r => r.project));
    const lp = uniq(D.lngExports.map(r => r.project)); const lcol = ['#7a4fb0', '#d9822b', '#2a9d8f'];
    chart('tb-lng-chart').setOption(baseOpt({
      tooltip: Object.assign(tip('млн т'), { axisPointer: { type: 'shadow' } }), xAxis: yearAxis(), yAxis: Object.assign({ type: 'value' }, axisName('млн т')),
      series: lp.map((p, i) => ({ name: p, type: 'bar', stack: 'l', barMaxWidth: 40, itemStyle: { color: lcol[i % 3] }, markArea: i === 0 ? fcArea() : undefined,
        data: barData(allYears.map(y => { const rr = D.lngExports.filter(r => r.project === p && r.year === y); return pt(+sumBy(rr, r => r.volume_mt).toFixed(1), srcOf(rr), isFc(y)); }), lcol[i % 3]) }))
    }), true);
    const rows = D.contracts.filter(r => r.volume_mtpa != null && (state.lngProject === 'all' || r.project === state.lngProject) && (state.lngRegion === 'all' || r.buyer_region === state.lngRegion));
    $('tb-lng-table').innerHTML = table(['Проект', 'Покупатель', 'Регион', 'Объём, млн т/год', 'Срок действия', 'Формула цены'],
      rows.map(r => R([esc(r.project), esc(r.buyer), esc(r.buyer_region), fmt(r.volume_mtpa, 1), r.start_year + '–' + r.end_year,
        esc(r.pricing_formula) + (r.price_value != null ? ' (' + fmt(r.price_value, r.price_unit === 'USD/т' ? 0 : 1) + ' ' + esc(r.price_unit) + ')' : '')])),
      { wrapCols: new Set([5]) }) + '<div class="unit">Покупатели обезличены (демо). Источник: ' + esc(srcOf(rows)) + '</div>';
    fillSelect('f-lng-project', [['all', 'Все проекты']].concat(projects.map(p => [p, p])), state.lngProject);
  }

  /* ====================== ЦЕНЫ ====================== */
  const segs = () => uniq(D.prices.map(r => r.segment));
  const pyears = () => uniq(D.prices.map(r => r.year)).sort((a, b) => a - b);
  function priceChart(id, segList) {
    const ys = pyears(), pf = ys.filter(y => D.prices.some(r => r.year === y && r.is_forecast));
    const unit = (D.prices.find(r => r.segment === segList[0]) || {}).price_unit || '';
    const series = [];
    segList.forEach((s, i) => {
      const col = C.colors.segments[s] || '#888'; const get = y => D.prices.find(r => r.segment === s && r.year === y);
      const lastFactY = Math.max(...ys.filter(y => !pf.includes(y)));
      series.push({
        name: C.segmentLabels[s] || s, type: 'line', symbolSize: 7, itemStyle: { color: col }, lineStyle: { width: 3 },
        data: ys.map(y => { const r = get(y); return r && !r.is_forecast ? pt(r.price_value, r.source, false) : null; }),
        markArea: i === 0 && pf.length ? { silent: true, itemStyle: { color: 'rgba(240,179,74,.14)' }, label: { color: '#9a5b00', fontWeight: 600 }, data: [[{ name: 'Прогноз', xAxis: String(pf[0]) }, { xAxis: String(pf[pf.length - 1]) }]] } : undefined
      });
      series.push({
        name: (C.segmentLabels[s] || s) + ' — ' + FC, type: 'line', symbol: 'diamond', symbolSize: 8, itemStyle: { color: col }, lineStyle: { width: 2, type: 'dashed' },
        data: ys.map(y => { const r = get(y); if (r && r.is_forecast) return pt(r.price_value, r.source, true); if (y === lastFactY && r) return Object.assign(pt(r.price_value, r.source, false), { skipTip: true }); return null; })
      });
    });
    chart(id).setOption(baseOpt({
      legend: { top: 0, type: 'plain', textStyle: { color: '#33415a' } },
      tooltip: tip(unit, 0), xAxis: { type: 'category', data: ys.map(String) }, yAxis: Object.assign({ type: 'value', min: 0 }, axisName(unit)), series
    }), true);
  }
  const segsOfType = t => segs().filter(s => t === 'pipe' ? s.startsWith('трубопровод') : s.startsWith('СПГ'));
  function renderPrices(p) {
    const showPipe = state.gas !== 'lng', showLng = state.gas !== 'pipe';
    [['pipe', showPipe], ['lng', showLng]].forEach(([t, on]) => {
      const id = p + 'pr-' + t; const el = $(id); el.parentElement.style.display = (p === 'ov-' ? '' : (on ? '' : 'none')); el.style.visibility = on ? '' : 'hidden';
      if (on) priceChart(id, segsOfType(t));
    });
    if (p === 'tb-') {
      const ys = pyears(); const fcCols = new Set();
      ys.forEach((y, i) => { if (D.prices.some(r => r.year === y && r.is_forecast)) fcCols.add(i + 2); });
      const list = segs().filter(s => state.gas === 'all' || segsOfType(state.gas).includes(s));
      $('tb-pr-table').innerHTML = table(['Сегмент', 'Ед.'].concat(ys.map(y => y + (fcCols.has(ys.indexOf(y) + 2) ? ' (' + FC + ')' : ''))),
        list.map(s => R([C.segmentLabels[s] || s, (D.prices.find(r => r.segment === s) || {}).price_unit].concat(ys.map(y => { const r = D.prices.find(x => x.segment === s && x.year === y); return r ? fmt(r.price_value, 0) : '—'; })))), { fcCols })
        + '<div class="unit">Контрактные цены (демо). Закрашенные столбцы — прогноз. Спотовые индексы не используются.</div>';
    }
  }

  /* ====================== ВЫГРУЗКА В EXCEL ====================== */
  function exportXlsx() {
    const wb = XLSX.utils.book_new();
    const add = (name, aoa, widths) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
    add('Потребление по регионам',
      [['Регион'].concat(allYears.map(y => yLabel(y) + ', млрд куб. м'))].concat(regionsList.map(n => [n].concat(allYears.map(y => +consVal(n, y).toFixed(2)))))
        .concat([['Итого по РФ'].concat(allYears.map(y => +consTotal(y).toFixed(2)))]), [44].concat(allYears.map(() => 24)));
    add('Добыча по компаниям (квартал)',
      [['Год', 'Квартал', 'Компания', 'Добыча, млрд куб. м', 'Тип данных', 'Источник']].concat(D.production.map(r => [r.year, r.quarter, r.company, r.volume_bcm, r.is_forecast ? 'прогноз' : 'факт', r.source || ''])), [8, 10, 14, 20, 12, 28]);
    add('Контракты',
      [['ID', 'Проект', 'Покупатель', 'Регион покупателя', 'Объём, млн т/год', 'Объём, млрд куб. м/год', 'Начало', 'Окончание', 'Формула цены', 'Значение цены', 'Ед. цены']]
        .concat(D.contracts.map(r => [r.contract_id, r.project, r.buyer, r.buyer_region, r.volume_mtpa, r.volume_bcm_year, r.start_year, r.end_year, r.pricing_formula, r.price_value, r.price_unit])), [8, 16, 18, 16, 16, 20, 9, 11, 30, 14, 16]);
    add('Цены',
      [['Год', 'Сегмент', 'Цена', 'Единица', 'Тип данных', 'Источник']].concat(D.prices.map(r => [r.year, C.segmentLabels[r.segment] || r.segment, r.price_value, r.price_unit, r.is_forecast ? 'прогноз' : 'факт', r.source || ''])), [8, 30, 10, 18, 12, 28]);
    XLSX.writeFile(wb, 'gas_dashboard_demo.xlsx');
  }

  /* ====================== ФИЛЬТРЫ, ВКЛАДКИ, ОТРИСОВКА ====================== */
  function fillSelect(id, opts, val) { const s = $(id); const html = opts.map(([v, t]) => '<option value="' + esc(v) + '">' + esc(t) + '</option>').join(''); if (s.dataset.sig !== html) { s.innerHTML = html; s.dataset.sig = html; } s.value = val; }

  function render() {
    const t = state.tab;
    document.querySelectorAll('.js-company').forEach(s => s.value = state.company);
    if (t === 'overview') {
      renderMap('ov-'); renderScheme(); renderProdAnnual('ov-prod'); renderPrices('ov-'); renderEuropeOv(); renderChinaOv();
    } else if (t === 'regions') { renderMap('tb-'); renderRegTable(); }
    else if (t === 'production') { renderProdStack('tb-prod-stack'); renderProdShare('tb-prod-share'); renderProdTable('tb-prod-table'); }
    else if (t === 'europe') renderEuropeTab();
    else if (t === 'china') renderChinaTab();
    else if (t === 'ca') renderCA('tb-ca-chart', true);
    else if (t === 'lng') renderLng();
    else if (t === 'prices') renderPrices('tb-');
  }

  fillSelect('f-year', allYears.map(y => [y, y + (isFc(y) ? ' (' + FC + ')' : ' (факт)')]), state.year);
  fillSelect('f-region', [['all', 'Все регионы']].concat(regionsList.map(r => [r, r])), 'all');
  fillSelect('f-lng-region', [['all', 'Все регионы']].concat(uniq(D.contracts.filter(r => r.volume_mtpa != null).map(r => r.buyer_region)).map(r => [r, r])), 'all');
  document.querySelectorAll('.js-company').forEach(s => { s.innerHTML = [['all', 'Все']].concat(C.companies.map(c => [c, c])).map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join(''); });

  $('f-year').onchange = e => { state.year = +e.target.value; render(); };
  $('f-dir').onchange = e => { state.dir = e.target.value; render(); };
  $('f-gas').onchange = e => { state.gas = e.target.value; render(); };
  $('f-region').onchange = e => { state.region = e.target.value; render(); };
  $('f-lng-project').onchange = e => { state.lngProject = e.target.value; render(); };
  $('f-lng-region').onchange = e => { state.lngRegion = e.target.value; render(); };
  document.querySelectorAll('.js-company').forEach(s => s.onchange = e => { state.company = e.target.value; render(); });
  $('btn-export').onclick = exportXlsx;

  document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
    state.tab = b.dataset.tab;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + state.tab));
    render(); Object.values(charts).forEach(c => c.resize());
  });

  render();
})();
