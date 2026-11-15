/* “港股通”页面脚本。数据：data.js（市值）、quality.js（年报摘要）、hk.js（港股快照）。 */
"use strict";
// ================================================================ 数据
const DATA = window.AGU_DATA, QD = window.AGU_Q, HK = window.AGU_HK;
const MONTHS = DATA.months, NM = MONTHS.length, LAST = NM - 1, TOT = DATA.tot;
const SECT = DATA.sectors.map(([k, n, f], i) => ({ i, k, n, f }));
const HUE = { bank: [6, 62], broker: [24, 50], insur: [352, 42], estate: [40, 58], build: [30, 34], bmat: [50, 34],
  baijiu: [330, 42], food: [345, 38], appl: [305, 24], pharma: [152, 36], agri: [92, 34], light: [62, 36], trade: [18, 32],
  auto: [198, 34], power: [134, 38], mach: [172, 26], defense: [212, 16],
  elec: [214, 46], semi: [236, 40], ai: [264, 44], telecom: [190, 44], soft: [224, 32], media: [286, 26],
  oil: [22, 30], coal: [30, 6], metal: [38, 46], steel: [206, 10], chem: [70, 32], util: [180, 30], transp: [246, 16] };
let DARK = false;
const secColor = k => { const [h, s] = HUE[SECT[k].k]; return DARK ? `hsl(${h} ${Math.max(s, 22)}% 60%)` : `hsl(${h} ${Math.max(s, 22)}% 44%)`; };
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rawC = b64(DATA.caps), QC = new Uint16Array(rawC.buffer, rawC.byteOffset, rawC.byteLength / 2);
const FY0 = QD.fy0, FY1 = QD.fy1, NY = FY1 - FY0 + 1, K1 = NY - 1, NT = QD.nt, PER = NY * 4 + 1;
const rawF = b64(QD.fin), QF = new Int16Array(rawF.buffer, rawF.byteOffset, rawF.byteLength / 2);
const QL = b64(QD.lev), QG = b64(QD.gw), QR = b64(QD.rd);
const rawT = b64(QD.tr), QT = new Uint16Array(rawT.buffer, rawT.byteOffset, rawT.byteLength / 2);
const dq = q => q === -32768 ? NaN : q === 0 ? 0 : Math.sign(q) * Math.pow(10, (Math.abs(q) - 1) / 3200 - 4);
const mi = m => MONTHS.indexOf(m);
const yi = y => y - FY0;
const dec = y => mi(y + '-12');
const secAt = (o, t) => { let s = o.sc[0][1]; for (const [m, k] of o.sc) { if (m <= t) s = k; else break; } return s; };
let off = 0;
const CO = DATA.co.map((c, j) => {
  const o = { j, code: c[0], name: c[1], ren: c[2], sc: c[3], a: c[4], b: c[5] };
  const n = o.b - o.a + 1; o.v = new Float32Array(n);
  for (let i = 0; i < n; i++) o.v[i] = Math.pow(10, QC[off + i] / 9000 - 2);
  off += n;
  const b = j * PER, seq = (s, len) => Array.from({ length: len }, (_, k) => dq(QF[b + s + k]));
  o.rev = seq(0, NY); o.ni = seq(NY, NY); o.eq = seq(2 * NY, NY + 1); o.ocf = seq(3 * NY + 1, NY);   // eq[k]：FY0-1+k 年末
  o.lev = Array.from({ length: NY }, (_, k) => QL[j * NY + k] === 255 ? NaN : QL[j * NY + k]);
  o.gw = QG[j] === 255 ? NaN : QG[j]; o.rd = QR[j] === 255 ? NaN : QR[j] / 5;
  o.tr = Array.from({ length: NT }, (_, k) => { const q = QT[j * NT + k]; return q ? Math.pow(10, q / 9000 - 2) : NaN; });
  o.avgEq = o.ni.map((_, k) => { const e0 = o.eq[k], e1 = o.eq[k + 1]; return e1 > 0 ? (e0 > 0 ? (e0 + e1) / 2 : e1) : NaN; });
  o.roe = o.ni.map((n, k) => isFinite(n) && o.avgEq[k] > 0 ? n / o.avgEq[k] * 100 : NaN);
  o.s = secAt(o, o.b); o.ly = +MONTHS[o.a].slice(0, 4);
  return o;
});
const cap = (o, t) => (t < o.a || t > o.b) ? 0 : o.v[t - o.a];
const byCode = new Map(CO.map(o => [o.code, o]));
const LIVE = CO.filter(o => o.b === LAST);
const FINK = new Set(['bank', 'broker', 'insur']);
const isFin = o => FINK.has(SECT[o.s].k);
const mean = a => { let s = 0, n = 0; for (const v of a) if (isFinite(v)) { s += v; n++; } return n ? s / n : NaN; };
const med = a => d3.median(a.filter(isFinite));
// ================================================================ 格式
const fmtYi = v => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return s + (a >= 10000 ? (a / 10000).toFixed(a >= 100000 ? 1 : 2) + '万亿' : (a >= 100 ? Math.round(a).toLocaleString('zh-CN') : a >= 10 ? a.toFixed(1) : a.toFixed(2)) + '亿'); };
const fmtPct = v => (Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2)) + '%';
const pct0 = v => isFinite(v) ? Math.round(v).toString().replace('-', '−') + '%' : '—';
const pct1 = v => isFinite(v) ? v.toFixed(1).replace('-', '−') + '%' : '—';
const sgn = (v, d = 1) => !isFinite(v) ? '—' : Math.abs(v) < 0.05 ? '0.0%' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%';
const ym = t => { const [y, m] = MONTHS[t].split('-'); return `${y}年${+m}月`; };
const x2 = v => !isFinite(v) ? '—' : v.toFixed(2).replace('-', '−');
const cnt = n => n.toLocaleString('zh-CN');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);
const cssv = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const CN = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];

// ================================================================ 图表小工具
const tt = $('tt');
function tip(html, cx, cy) {
  tt.innerHTML = html; tt.hidden = false;
  const w = tt.offsetWidth, h = tt.offsetHeight;
  tt.style.left = Math.max(6, Math.min(cx + 14, innerWidth - w - 8)) + 'px';
  tt.style.top = Math.max(6, (cy + 16 + h > innerHeight ? cy - h - 12 : cy + 16)) + 'px';
}
const untip = () => { tt.hidden = true; };
function svgIn(el, h, label) {
  el.textContent = '';
  const w = Math.max(120, el.clientWidth);
  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', label || '');
  return { svg, w, h };
}
const narrow = () => innerWidth < 640;
const rows = (...r) => r.filter(Boolean).map(([k, v, c]) => `<div class="r"><span>${c ? `<i style="background:${c}"></i>` : ''}${k}</span><b>${v}</b></div>`).join('');
function nearest(svg, pts, px, py, box, show, click) {
  if (!pts.length) return;
  const del = d3.Delaunay.from(pts, px, py);
  const halo = svg.append('circle').attr('r', 8).attr('fill', 'none').attr('stroke', cssv('--fg')).attr('stroke-width', 2).attr('visibility', 'hidden').style('pointer-events', 'none');
  let cur = 0;
  const at = (i, cx, cy) => { cur = Math.max(0, Math.min(pts.length - 1, i)); const d = pts[cur]; halo.attr('cx', px(d)).attr('cy', py(d)).attr('visibility', 'visible');
    if (cx === undefined) { const r = svg.node().getBoundingClientRect(); cx = r.left + px(d); cy = r.top + py(d); }
    tip(show(d), cx, cy); };
  const hit = svg.append('rect').attr('x', box.l).attr('y', box.t).attr('width', Math.max(1, box.r - box.l)).attr('height', Math.max(1, box.b - box.t)).attr('fill', 'transparent').attr('tabindex', 0)
    .on('pointermove pointerdown', ev => { const [x, y] = d3.pointer(ev, svg.node()); at(del.find(x, y), ev.clientX, ev.clientY); })
    .on('pointerleave blur', () => { halo.attr('visibility', 'hidden'); untip(); })
    .on('focus', () => at(cur)).on('keydown', ev => { const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[ev.key]; if (d) { ev.preventDefault(); at(cur + d); } if (ev.key === 'Enter' && click) click(pts[cur]); });
  if (click) hit.style('cursor', 'pointer').on('click', ev => { const [x, y] = d3.pointer(ev, svg.node()); click(pts[del.find(x, y)]); });
}
function placeLabels(svg, items, bounds, obstacles) {
  const placed = (obstacles || []).map(o => ({ x0: o.x - o.r + 1, x1: o.x + o.r - 1, y0: o.y - o.r + 1, y1: o.y + o.r - 1 }));
  const hitAny = b => placed.some(p => !(b.x1 < p.x0 || b.x0 > p.x1 || b.y1 < p.y0 || b.y0 > p.y1));
  for (const it of items) {
    const w = it.text.length * 12.5 + 4, h = 15, opts = [[it.r + 5, 4, 'start'], [-(it.r + 5), 4, 'end'], [0, -(it.r + 6), 'middle'], [0, it.r + 15, 'middle']];
    for (const [dx, dy, anchor] of opts) {
      const x = it.x + dx, y = it.y + dy, x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2, b = { x0, x1: x0 + w, y0: y - h + 3, y1: y + 3 };
      if (b.x0 < bounds.l || b.x1 > bounds.r || b.y0 < bounds.t || b.y1 > bounds.b || hitAny(b)) continue;
      placed.push(b); svg.append('text').attr('class', 'lab hp' + (it.bold ? ' b' : '')).attr('x', x).attr('y', y).attr('text-anchor', anchor).style('pointer-events', 'none').text(it.text); break;
    }
  }
}
const barPath = (x0, y, w, h) => { const r = Math.min(4, Math.abs(w) / 2, h / 2); return w >= 0 ? `M${x0},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z` : `M${x0},${y}h${w + r}a${r},${r} 0 0 0 ${-r},${r}v${h - 2 * r}a${r},${r} 0 0 0 ${r},${r}h${-(w + r)}z`; };
const colPath = (x, y0, w, hgt) => { const r = Math.min(3, w / 2, Math.abs(hgt) / 2); return hgt >= 0 ? `M${x},${y0}v${-(hgt - r)}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${hgt - r}z` : `M${x},${y0}v${-hgt - r}a${r},${r} 0 0 0 ${r},${r}h${w - 2 * r}a${r},${r} 0 0 0 ${r},${-r}v${hgt + r}z`; };
function seg(el, opts, cur, on) {
  el.innerHTML = opts.map((o, i) => `<button data-i="${i}" aria-pressed="${i === cur}">${o}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); on(+b.dataset.i); });
}

// ================================================================ 港股快照
const FX = HK.fx, HDATE = (() => { const [y, m, d] = HK.date.split('-'); return `${y}年${+m}月${+d}日`; })();
const roeAvg = (o, y0, y1, need) => { const v = d3.range(y0, y1 + 1).map(y => o.roe[yi(y)]).filter(isFinite); return v.length >= need ? mean(v) : NaN; };
function cash5(o) {
  const ys = d3.range(2021, FY1 + 1).filter(y => isFinite(o.ni[yi(y)]) && isFinite(o.ocf[yi(y)]));
  const n = d3.sum(ys, y => o.ni[yi(y)]), c = d3.sum(ys, y => o.ocf[yi(y)]);
  return ys.length >= 3 && n > 0 ? c / n : NaN;
}
const AHL = HK.ah.map(([a, h, hp, ap, dy, tax]) => {
  const o = byCode.get(a); if (!o || o.b !== LAST) return null;
  const p = (ap / (hp * FX) - 1) * 100, c = cap(o, LAST), ni = o.ni[K1], peA = ni > 0 ? c / ni : NaN;
  return { o, a, h, hp, ap, dy, tax, p, r: 1 + p / 100, cap: c, roe10: roeAvg(o, 2016, FY1, 8), peA, peH: peA / (1 + p / 100), cc5: cash5(o), lev: o.lev[K1], fin: isFin(o) };
}).filter(Boolean);
const AHBY = new Map(AHL.map(d => [d.a, d]));
const TYPE_N = { H: 'H股', 红筹: '红筹', 民企: '民企', 外资: '外资', 香港: '香港本地' };
const HKL = HK.hk.map(([code, name, price, mcap, dy, pe, type, sec, flags, con, cat]) => ({ code, name, price, mcap, dy, pe, type, sec, flags, con, cat, si: sec ? SECT.findIndex(s => s.k === sec) : -1 }));
const pctS = v => !isFinite(v) ? '—' : (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)) + '%';
const premWord = p => p >= 0 ? `A股比H股贵 ${Math.round(p)}%` : `H股比A股贵 ${Math.round(-p / (1 + p / 100))}%`;
const hkYi = v => v >= 10000 ? (v / 10000).toFixed(2) + '万亿' : Math.round(v).toLocaleString('zh-CN') + '亿';
const conTag = c => c === 1 ? '在通' : c === 0 ? '<span class="flag no">不在通</span>' : '<span class="flag q">以名单为准</span>';
const FLAGN = { W: '同股不同权', V: '协议控制（VIE）', S: '第二上市' };
const flagTags = f => [...(f || '')].map(k => `<span class="flag" title="${FLAGN[k]}">${k}</span>`).join('');

// ================================================================ 页首：两百多对公司的价差
function drawStrip() {
  const nar = narrow(), D = AHL.slice().sort((a, b) => a.r - b.r);
  const el = $('strip'), w0 = Math.max(120, el.clientWidth), d = nar ? 6.5 : 9, m = { l: 8, r: 8 };
  const x = d3.scaleLog([0.72, 6.2], [m.l, w0 - m.r]).clamp(true);
  const cols = new Map(); let mx = 0;
  for (const it of D) { const c = Math.round((x(it.r) - m.l) / d); const k = (cols.get(c) || 0); cols.set(c, k + 1); it._c = c; it._k = k; mx = Math.max(mx, k + 1); }
  const top = 46, base = top + mx * d + 4, h = base + 46;
  const { svg, w } = svgIn(el, h, 'A+H公司的A股相对H股溢价分布');
  const col = it => it.cap >= 1500 ? cssv('--c1') : it.cap >= 300 ? cssv('--c4') : cssv('--mute');
  const px = it => m.l + it._c * d, py = it => base - it._k * d - d / 2;
  const tk = [[0.8, 'H贵25%'], [1, '持平'], [1.5, '+50%'], [2, '+100%'], [3, '+200%'], [5, '+400%']];
  for (const [v, l] of tk.filter(t => !nar || t[0] !== 0.8)) { svg.append('line').attr('class', v === 1 ? 'zero' : 'grid').attr('x1', x(v)).attr('x2', x(v)).attr('y1', top - 6).attr('y2', base + 4); svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', base + 18).attr('text-anchor', 'middle').text(l); }
  svg.append('text').attr('class', 'tick').attr('x', w - m.r).attr('y', base + 34).attr('text-anchor', 'end').text('A股相对H股的溢价，对数刻度 →');
  for (const it of D) svg.append('circle').attr('cx', px(it)).attr('cy', py(it)).attr('r', d / 2 - 0.6).attr('fill', col(it));
  const md = d3.median(D, it => it.r);
  svg.append('line').attr('x1', x(md)).attr('x2', x(md)).attr('y1', top - 26).attr('y2', base).attr('stroke', cssv('--fg')).attr('stroke-dasharray', '3 3');
  svg.append('text').attr('class', 'lab b hp').attr('x', x(md) + 5).attr('y', top - 16).text(`中位数 ${pctS((md - 1) * 100)}`);
  const lab = (code, dy) => { const it = AHBY.get(code); if (!it) return; const X = px(it), Y = py(it); svg.append('line').attr('x1', X).attr('x2', X).attr('y1', Y - d / 2).attr('y2', top - 10 + dy).attr('stroke', cssv('--fg-3'));
    svg.append('text').attr('class', 'lab dim hp').attr('x', X).attr('y', top - 14 + dy).attr('text-anchor', X > w * 0.75 ? 'end' : 'start').text(`${it.o.name} ${pctS(it.p)}`); };
  lab('300750', 0); if (!nar) lab('600036', 16); lab('000488', 0); if (!nar) lab('688981', 16);
  nearest(svg, D, px, py, { l: 0, r: w, t: top - 8, b: base + 4 }, it => `<div class="t">${it.o.name} <span class="s">${it.a} / ${it.h}</span></div>${rows(['A股', it.ap.toFixed(2) + ' 元'], ['H股', `${it.hp.toFixed(2)} 港元（约${(it.hp * FX).toFixed(2)}元）`], ['A比H', pctS(it.p)], ['A股市值', fmtYi(it.cap)], ['十年平均回报率', pct1(it.roe10)])}`, it => pickAh(it, true));
  $('stripNote').innerHTML = `每个点是一家A+H公司，共 ${AHL.length} 家，${HDATE}收盘。<span style="color:var(--malachite)">●</span> A股市值1,500亿以上 <span style="color:var(--gold)">●</span> 300亿–1,500亿 <span style="color:var(--mute)">●</span> 300亿以下。大公司挤在左边，小公司散在右边。`;
  $('hDate').textContent = HDATE; $('fDate').textContent = HDATE; $('fCap').textContent = $('capMonth').textContent = $('peMonth').textContent = ym(LAST);
}

// ================================================================ 对岸
function drawLand() {
  const add = new Map();
  for (const c of HKL) { const k = c.si; if (!add.has(k)) add.set(k, []); add.get(k).push(c); }
  const R = [...add.entries()].map(([si, L]) => ({ si, L: L.sort((a, b) => b.mcap - a.mcap), hk: d3.sum(L, c => c.mcap) * FX, a: si >= 0 ? DATA.sec[si][LAST] : 0, n: si >= 0 ? SECT[si].n : '综合企业' })).sort((a, b) => b.hk - a.hk).slice(0, 12);
  $('landSub').textContent = `把 ${HKL.length} 家只在港股上市的大公司（${HDATE}收盘市值，按 ${FX} 折成人民币）放到它们最接近的国里，和这个国在A股地图上 ${ym(LAST)} 末的市值比。港股还有大量没有收录的公司，这里只是最大的那些。`;
  const nar = narrow(), rowH = 30, m = { l: nar ? 86 : 118, r: 64, t: 6, b: 18 }, { svg, w, h } = svgIn($('pLand'), m.t + R.length * rowH + m.b, '只在港股上市的公司和A股各国的市值');
  const xMax = d3.max(R, d => d.hk) * 1.35, x = d3.scaleLinear([0, xMax], [m.l, w - m.r]), clip = v => Math.min(v, xMax);
  for (const v of x.ticks(nar ? 3 : 5)) { svg.append('line').attr('class', v ? 'grid' : 'zero').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t).attr('y2', h - m.b); svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', h - 4).attr('text-anchor', 'middle').text(v ? fmtYi(v).replace('.00', '') : '0'); }
  R.forEach((d, i) => {
    const y = m.t + i * rowH;
    svg.append('text').attr('class', 'lab').attr('x', m.l - 8).attr('y', y + 18).attr('text-anchor', 'end').text(d.n);
    if (d.a) { svg.append('path').attr('d', barPath(x(0), y + 4, Math.max(1, x(clip(d.a)) - x(0)), 10)).attr('fill', cssv('--mute')).attr('opacity', .8);
      if (d.a > xMax) { const xe = x(xMax); svg.append('path').attr('d', `M${xe - 14},${y + 2}l5,7l-5,7M${xe - 8},${y + 2}l5,7l-5,7`).attr('fill', 'none').attr('stroke', cssv('--panel')).attr('stroke-width', 2.2); svg.append('text').attr('class', 'lab dim hp').attr('x', xe - 24).attr('y', y + 13).attr('text-anchor', 'end').text(fmtYi(d.a)); } }
    svg.append('path').attr('d', barPath(x(0), y + 15, Math.max(1, x(d.hk) - x(0)), 10)).attr('fill', cssv('--c3')).attr('opacity', .85);
    if (d.a <= xMax) svg.append('text').attr('class', 'lab dim').attr('x', x(Math.max(d.a, d.hk)) + 5).attr('y', y + 18).text(d.a ? `港股是A股的${d.hk / d.a >= 1 ? (d.hk / d.a).toFixed(1) + '倍' : Math.round(d.hk / d.a * 100) + '%'}` : '');
    else svg.append('text').attr('class', 'lab dim').attr('x', x(d.hk) + 5).attr('y', y + 24).text(`${Math.round(d.hk / d.a * 100)}%`);
  });
  nearest(svg, R, d => x(clip(Math.max(d.a, d.hk)) / 2 + 1), d => m.t + R.indexOf(d) * rowH + 14, { l: m.l, r: w - m.r, t: m.t, b: h - m.b },
    d => `<div class="t">${d.n}</div>${rows(d.a ? ['A股地图上', fmtYi(d.a), cssv('--mute')] : null, ['港股大公司合计', fmtYi(d.hk), cssv('--c3')])}<div class="s">${d.L.slice(0, 6).map(c => `${c.name} ${hkYi(c.mcap)}港元`).join('<br>')}${d.L.length > 6 ? '<br>……' : ''}</div>`);
  const med = R.find(d => d.si >= 0 && SECT[d.si].k === 'media'), tr = R.find(d => d.si >= 0 && SECT[d.si].k === 'trade');
  const tot = d3.sum(HKL, c => c.mcap) * FX, topNames = HKL.filter(c => c.cat === '平台').sort((a, b) => b.mcap - a.mcap).slice(0, 4).map(c => c.name.replace(/-W$/, ''));
  $('sLand').innerHTML = `${med ? `A股地图上的传媒互联网今天是 ${fmtYi(med.a)}，港股的腾讯、网易、快手、百度等合计 <b>${fmtYi(med.hk)}</b>，是它的 ${(med.hk / med.a).toFixed(1)} 倍；` : ''}${tr ? `商贸服务加上阿里巴巴、美团、京东等，版图会多出 ${fmtYi(tr.hk)}。` : ''}这 ${HKL.length} 家公司合计约 ${fmtYi(tot)}，相当于整张A股地图的 ${pct1(tot / TOT[LAST] * 100)}。`;
  $('t1').innerHTML = `A股地图的三十个国里，传媒互联网和商贸服务都不大，因为中国最大的互联网公司——${topNames.join('、')}——都不在A股。它们早年连年亏损，用境外注册加协议控制的架构，创始人要求同股不同权，这些在A股上市都有障碍，于是去了香港和美国。消费品牌、香港本地公司和外资金融也是这样。<b>想在中国经济里配齐这些部分，就得过海。</b>`;
  const tiles = [['1.40万亿', '港元，2025年南向资金净买入，创纪录'], ['6.3万亿', '港元，南向持股市值，约占港股总市值12.7%（2025年三季度末）'], [String(AHL.length), `对A+H公司收录在本页快照里（2024年末全市场约150家）`], ['113.6', 'AH溢价指数2026年上半年的最低点；2024年2月一度超过160']];
  $('flowTiles').innerHTML = tiles.map(([v, k]) => `<div class="tile"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
}

// ================================================================ 价差
let AH_SEL = null;
function drawAh() {
  const D = AHL.slice().sort((a, b) => a.cap - b.cap);
  const nar = narrow(), { svg, w, h } = svgIn($('pAh'), nar ? 360 : 440, 'A+H公司的规模和溢价');
  const m = { l: 52, r: nar ? 10 : 20, t: 12, b: 34 };
  const x = d3.scaleLog([20, 40000], [m.l, w - m.r]).clamp(true), y = d3.scaleLog([0.72, 6.2], [h - m.b, m.t]).clamp(true);
  for (const v of [30, 100, 300, 1000, 3000, 10000, 30000]) { svg.append('line').attr('class', 'grid').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t).attr('y2', h - m.b); if (!nar || [100, 1000, 10000].includes(v)) svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', h - m.b + 16).attr('text-anchor', 'middle').text(fmtYi(v).replace('.00', '')); }
  for (const [v, l] of [[0.8, '−20%'], [1, '持平'], [1.5, '+50%'], [2, '+100%'], [3, '+200%'], [5, '+400%']]) { svg.append('line').attr('class', v === 1 ? 'zero' : 'grid').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(v)).attr('y2', y(v)); svg.append('text').attr('class', 'tick').attr('x', m.l - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').text(l); }
  svg.append('text').attr('class', 'tick').attr('x', w - m.r).attr('y', h - 2).attr('text-anchor', 'end').text('A股地图上的总市值 →');
  svg.append('text').attr('class', 'tick').attr('x', m.l).attr('y', m.t - 2).text('↑ A股比H股贵');
  // 滑动中位数
  const k = 31, T = [];
  for (let i = 0; i + k <= D.length; i += 3) { const s = D.slice(i, i + k); T.push([Math.exp(d3.mean(s, d => Math.log(d.cap))), d3.median(s, d => d.r)]); }
  svg.append('path').attr('d', d3.line(p => x(p[0]), p => y(p[1])).curve(d3.curveBasis)(T)).attr('fill', 'none').attr('stroke', cssv('--fg')).attr('stroke-width', 2.2).attr('opacity', .75);
  for (const d of D) svg.append('circle').attr('cx', x(d.cap)).attr('cy', y(d.r)).attr('r', nar ? 3.2 : 4).attr('fill', secColor(d.o.s)).attr('fill-opacity', .72).attr('stroke', AH_SEL === d ? cssv('--fg') : 'none').attr('stroke-width', 2);
  const names = ['300750', '600036', '601398', '601318', '688981', '000488', '002703', '603259', '600941', '300308'];
  placeLabels(svg, names.map(c => AHBY.get(c)).filter(Boolean).map(d => ({ x: x(d.cap), y: y(d.r), r: 4, text: d.o.name })), { l: m.l, r: w - m.r, t: m.t, b: h - m.b }, D.map(d => ({ x: x(d.cap), y: y(d.r), r: 3 })));
  nearest(svg, D, d => x(d.cap), d => y(d.r), { l: m.l, r: w - m.r, t: m.t, b: h - m.b },
    d => `<div class="t">${d.o.name} <span class="s">${SECT[d.o.s].n}</span></div>${rows(['A比H', pctS(d.p)], ['A股市值', fmtYi(d.cap)], ['十年平均回报率', pct1(d.roe10)], ['H股市盈率', isFinite(d.peH) ? d.peH.toFixed(1) + ' 倍' : '亏损'])}<div class="s">点一下，在“选城”里看两地对照</div>`, d => pickAh(d, true));
  const secs = [...new Set(AHL.map(d => d.o.s))].sort((a, b) => AHL.filter(d => d.o.s === b).length - AHL.filter(d => d.o.s === a).length).slice(0, nar ? 6 : 10);
  $('ahLegend').innerHTML = secs.map(s => `<span><i class="dot" style="background:${secColor(s)}"></i>${SECT[s].n}</span>`).join('') + '<span>……</span><span><i style="background:var(--fg);height:3px"></i>按规模滑动的中位数</span>';
  $('ahSub').textContent = `${AHL.length} 对A+H公司，${HDATE}收盘。横轴是A股地图上 ${ym(LAST)} 末的总市值（含H股，按A股价格折算），纵轴是A股相对H股的溢价，都是对数刻度。`;
  const neg = AHL.filter(d => d.p < 0).sort((a, b) => a.p - b.p), md = d3.median(AHL, d => d.p), big = AHL.filter(d => d.p > 100);
  const recent = ['300750', '688008', '300308'].map(c => neg.find(d => d.a === c)).filter(Boolean).map(d => d.o.name);
  $('sAh').innerHTML = `只有 ${neg.length} 家公司的H股比A股还贵：${neg.map(d => `${d.o.name}（${pctS(d.p)}）`).join('、')}，都是受国际资金追捧的大公司${recent.length ? `，其中${recent.join('、')}是近一两年才在香港上市的` : ''}。溢价超过100%的 ${big.length} 家，几乎全在图的左上方。`;
  $('t2').innerHTML = `${HDATE}收盘，${AHL.length} 对A+H公司里，A股的溢价中位数是 <b>${pctS(md)}</b>。但这个“平均数”没什么用：<b>大而赚钱的公司，两地价格接近；小而冷清的公司，H股常常只有A股的三分之一到一半。</b>同一家公司的H股更便宜，未必是机会，更可能是流动性和关注度的折扣。`;
}
function bucketBars(el, G, label) {
  const nar = narrow(), rowH = 30, lw = nar ? 86 : 104, { svg, w } = svgIn(el, 10 + G.length * rowH, label);
  const x = d3.scaleLinear([0, Math.max(160, d3.max(G, g => g.md) * 1.1)], [lw, w - 44]);
  G.forEach((g, i) => {
    const y = 6 + i * rowH;
    svg.append('text').attr('class', 'lab').attr('x', lw - 8).attr('y', y + 12).attr('text-anchor', 'end').text(g.l);
    svg.append('text').attr('class', 'lab dim').attr('x', lw - 8).attr('y', y + 25).attr('text-anchor', 'end').text(g.n + '家');
    svg.append('path').attr('d', barPath(x(0), y + 3, Math.max(2, x(Math.max(0, g.md)) - x(0)), 14)).attr('fill', cssv('--c4')).attr('opacity', .85);
    svg.append('text').attr('class', 'lab b').attr('x', x(Math.max(0, g.md)) + 6).attr('y', y + 14).text(pctS(g.md));
  });
}
function drawAhGroups() {
  const by = (f, B) => B.map(([a, b, l]) => { const L = AHL.filter(d => f(d) >= a && f(d) < b); return { l, n: L.length, md: d3.median(L, d => d.p) }; }).filter(g => g.n);
  const C = by(d => d.cap, [[0, 200, '200亿以下'], [200, 500, '200–500亿'], [500, 1500, '500–1,500亿'], [1500, 1e9, '1,500亿以上']]);
  const R = by(d => d.roe10, [[-1e9, 5, '5%以下'], [5, 10, '5%–10%'], [10, 15, '10%–15%'], [15, 1e9, '15%以上']]);
  bucketBars($('pAhCap'), C, '按规模分组的溢价中位数'); bucketBars($('pAhRoe'), R, '按回报率分组的溢价中位数');
  $('sAhG').innerHTML = `A股市值200亿以下的公司，A股比H股贵的中位数是 <b>${Math.round(C[0].md)}%</b>；1,500亿以上的只贵 <b>${Math.round(C[C.length - 1].md)}%</b>。十年平均回报率不到5%的公司，溢价中位数 ${pctS(R[0].md)}；10%以上的，只有 ${pctS(d3.median(AHL.filter(d => d.roe10 >= 10), d => d.p))}。H股的价格更“挑剔”：港股市场给小公司、差公司的估值，比A股低得多。`;
  const S = SECT.map(s => { const L = AHL.filter(d => d.o.s === s.i).sort((a, b) => a.p - b.p); return L.length ? { s, L, md: d3.median(L, d => d.p) } : null; }).filter(Boolean).sort((a, b) => a.md - b.md);
  $('tAhSec').innerHTML = `<thead><tr><th>国</th><th>家数</th><th>溢价中位数</th><th class="l">最低</th><th class="l">最高</th></tr></thead><tbody>${S.map(r => `<tr><td><i class="sw" style="background:${secColor(r.s.i)}"></i>${r.s.n}</td><td>${r.L.length}</td><td>${pctS(r.md)}</td><td class="l">${esc(r.L[0].o.name)} ${pctS(r.L[0].p)}</td><td class="l">${esc(r.L[r.L.length - 1].o.name)} ${pctS(r.L[r.L.length - 1].p)}</td></tr>`).join('')}</tbody>`;
}

// ================================================================ 落袋
const C = { dy: 6, p: 30, tH: 20, tA: 0 };
function drawCalc() {
  $('cDy').value = C.dy; $('cP').value = C.p;
  $('vDy').textContent = C.dy.toFixed(1) + '%'; $('vP').textContent = pctS(C.p);
  document.querySelectorAll('#cTax button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.t === C.tH));
  document.querySelectorAll('#cHold button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.t === C.tA));
  const dyA = C.dy / (1 + C.p / 100), aNet = dyA * (1 - C.tA / 100), hNet = C.dy * (1 - C.tH / 100), be = ((1 - C.tA / 100) / (1 - C.tH / 100) - 1) * 100;
  const hw = hNet > aNet + 0.005, aw = aNet > hNet + 0.005;
  $('calcOut').innerHTML = `<div class="row${hw ? ' win' : ''}"><span>买H股，每年到手</span><b class="num">${hNet.toFixed(2)}%</b></div><div class="row${aw ? ' win' : ''}"><span>买A股，每年到手</span><b class="num">${aNet.toFixed(2)}%</b></div>
    <p>H股股息率 ${C.dy.toFixed(1)}%，扣 ${C.tH}% 的税剩 ${hNet.toFixed(2)}%；同一笔股息摊到更贵的A股上，股息率是 ${dyA.toFixed(2)}%${C.tA ? `，再扣 ${C.tA}% 剩 ${aNet.toFixed(2)}%` : '，持有一年以上免税'}。${hw ? `<b>H股每年多 ${(hNet - aNet).toFixed(2)} 个百分点。</b>` : aw ? `<b>A股每年多 ${(aNet - hNet).toFixed(2)} 个百分点。</b>` : '两边差不多。'}</p>
    <p>在这组税率下，<b>A股比H股贵 ${be.toFixed(1)}% 以上</b>，收息就该选H股。这里只比股息：价差本身会变，溢价收窄时H股涨得更多，扩大时反过来。</p>`;
}
function initCalc() {
  $('cDy').oninput = e => { C.dy = +e.target.value; drawCalc(); };
  $('cP').oninput = e => { C.p = +e.target.value; drawCalc(); };
  document.querySelectorAll('#cTax button').forEach(b => b.onclick = () => { C.tH = +b.dataset.t; drawCalc(); });
  document.querySelectorAll('#cHold button').forEach(b => b.onclick = () => { C.tA = +b.dataset.t; drawCalc(); });
  const P = AHL.filter(d => d.dy > 0).sort((a, b) => b.cap - a.cap);
  $('calcPick').innerHTML = P.map(d => `<button class="chip" data-c="${d.a}">${esc(d.o.name)}</button>`).join('');
  $('calcPick').querySelectorAll('button').forEach(b => b.onclick = () => { const d = AHBY.get(b.dataset.c); C.dy = Math.round(d.dy * 10) / 10; C.p = Math.round(Math.max(-30, Math.min(150, d.p))); C.tH = d.tax; drawCalc(); $('calcPick').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  drawCalc();
}
function drawYld() {
  const nar = narrow(), { svg, w, h } = svgIn($('pYld'), nar ? 250 : 280, 'H股税后股息与A股股息之比');
  const m = { l: 44, r: 16, t: 14, b: 44 }, x = d3.scaleLinear([-30, 160], [m.l, w - m.r]).clamp(true), y = d3.scaleLinear([0.5, 2.0], [h - m.b, m.t]);
  for (const v of [-25, 0, 25, 50, 100, 150]) { svg.append('line').attr('class', v ? 'grid' : 'zero').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t).attr('y2', h - m.b); svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', h - m.b + 15).attr('text-anchor', 'middle').text(pctS(v)); }
  for (const v of [0.5, 1, 1.5, 2]) { svg.append('line').attr('class', v === 1 ? 'zero' : 'grid').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(v)).attr('y2', y(v)); svg.append('text').attr('class', 'tick').attr('x', m.l - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').text(v.toFixed(1)); }
  svg.append('text').attr('class', 'tick').attr('x', w - m.r).attr('y', h - m.b + 15 + 0).attr('dy', -18).attr('text-anchor', 'end').text('A股比H股贵 →');
  svg.append('text').attr('class', 'tick').attr('x', m.l + 4).attr('y', y(1) - 6).text('线上方：H股到手更多');
  for (const [t, c] of [[20, cssv('--c1')], [28, cssv('--c2')]]) {
    const L = d3.range(-30, 161, 2).map(p => [p, (1 + p / 100) * (1 - t / 100)]);
    svg.append('path').attr('d', d3.line(d => x(d[0]), d => y(d[1]))(L)).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 2);
    const be = (1 / (1 - t / 100) - 1) * 100;
    svg.append('line').attr('x1', x(be)).attr('x2', x(be)).attr('y1', y(1)).attr('y2', h - m.b).attr('stroke', c).attr('stroke-dasharray', '3 3');
    svg.append('text').attr('class', 'lab dim hp').attr('x', x(be) + 4).attr('y', h - m.b - 6 - (t === 28 ? 14 : 0)).text(`${Math.round(be)}%`);
  }
  // 全部A+H公司的溢价：地毯
  for (const d of AHL) svg.append('line').attr('x1', x(d.p)).attr('x2', x(d.p)).attr('y1', h - m.b + 20).attr('y2', h - m.b + 28).attr('stroke', d.p > (d.tax === 28 ? 38.9 : 25) ? cssv('--c1') : cssv('--c2')).attr('opacity', .5);
  const P = AHL.filter(d => d.dy > 0);
  for (const d of P) svg.append('circle').attr('cx', x(d.p)).attr('cy', y(d.r * (1 - d.tax / 100))).attr('r', 4.5).attr('fill', cssv('--c4')).attr('stroke', cssv('--panel')).attr('stroke-width', 1);
  nearest(svg, P, d => x(d.p), d => y(d.r * (1 - d.tax / 100)), { l: m.l, r: w - m.r, t: m.t, b: h - m.b },
    d => `<div class="t">${d.o.name}</div>${rows(['A比H', pctS(d.p)], ['H股股息率', d.dy.toFixed(2) + '%'], [`扣税${d.tax}%后`, (d.dy * (1 - d.tax / 100)).toFixed(2) + '%'], ['A股股息率', (d.dy / d.r).toFixed(2) + '%'])}`);
  const hw = AHL.filter(d => d.p > (d.tax === 28 ? 100 / 0.72 - 100 : 25));
  $('yldSub').textContent = `纵轴：同一家公司，通过港股通买H股的税后股息，是持有一年以上A股股息的几倍。它只取决于价差和税率，和股息多少无关。最下面的短线是 ${AHL.length} 对公司各自的溢价，绿色表示H股收息更划算。`;
  const aw = AHL.filter(d => !hw.includes(d)).sort((a, b) => b.cap - a.cap).slice(0, 5);
  $('sYld').innerHTML = `${AHL.length} 对公司里，<b>${hw.length} 对</b>的溢价超过了临界点，长期收息买H股更划算；其余 ${AHL.length - hw.length} 对，收息还是A股更好，其中包括${aw.map(d => d.o.name).join('、')}。但“收息更划算”不等于值得买——溢价很高的H股，多半正是上一章说的小而冷的公司。`;
  // 扣税后股息率表
  const T = [];
  for (const d of P) T.push({ name: d.o.name, code: d.h, type: d.tax === 28 ? '红筹' : 'H股', dy: d.dy, t0: d.tax, t1: d.tax, pe: d.peH, ah: d });
  for (const c of HKL) if (c.dy > 0) T.push({ name: c.name, code: c.code, type: TYPE_N[c.type], dy: c.dy, t0: 20, t1: c.type === '红筹' ? 28 : 20, pe: c.pe });
  T.sort((a, b) => b.dy * (1 - b.t1 / 100) - a.dy * (1 - a.t1 / 100));
  $('tYld').innerHTML = `<thead><tr><th>公司</th><th class="l">类型</th><th>股息率</th><th>红利税</th><th>扣税后</th><th>市盈率</th></tr></thead><tbody>${T.map(r => `<tr${r.ah ? ` class="pick" data-c="${r.ah.a}"` : ''}><td><span class="co-n">${esc(r.name)}</span><span class="co-c">${r.code}</span></td><td class="l">${r.type}</td><td>${r.dy.toFixed(2)}%</td><td>${r.t0 === r.t1 ? r.t0 + '%' : `${r.t0}–${r.t1}%`}</td><td>${r.t0 === r.t1 ? (r.dy * (1 - r.t1 / 100)).toFixed(2) + '%' : `${(r.dy * (1 - r.t1 / 100)).toFixed(2)}–${(r.dy * (1 - r.t0 / 100)).toFixed(2)}%`}</td><td>${isFinite(r.pe) && r.pe > 0 ? r.pe.toFixed(1) : '—'}</td></tr>`).join('')}</tbody>`;
  $('tYld').querySelectorAll('tr.pick').forEach(r => r.onclick = () => pickAh(AHBY.get(r.dataset.c), true));
}

// ================================================================ 暗礁
const REEFS = [
  { t: '没有涨跌停', what: '港股全天不限涨跌幅，只有部分大中型股设有“市场波动调节机制”，短时间内偏离过大时冷静几分钟。一家公司一天可以跌去大半。', check: '不用杠杆，单只股票的仓位要小；业绩、核数师辞任、做空报告出来的那天最危险。' },
  { t: '流动性折价', what: '很多港股一天只成交几百万港元，买卖价差可能超过1%，大一点的单子就会把价格推开。', check: '看日均成交额和买卖盘的深度，用限价单；成交冷清的“便宜货”，进得去、出不来。' },
  { t: '老千股', what: '先合股（几股并成一股），再大比例供股、配股，小股东的股份被一轮轮稀释，股价从几元跌到几分。多见于港股通以外的小市值公司。', check: '翻过去几年的供股、配股、合股公告；短期内多次融资、股价长期在一元以下的，直接跳过。' },
  { t: '停牌与除牌', what: '年报出不来、核数师辞任、涉嫌违规时会长期停牌；连续停牌18个月，联交所可以取消上市地位，股票还在，但再也不能在交易所买卖。', check: '核数师意见、年报是否按时、有没有清盘呈请。停牌的股票没有退出的路。' },
  { t: '第二上市与新股', what: '名字带“S”的第二上市公司（如京东集团-SW）不在港股通里；新股要等价格稳定期结束、满足条件才会被纳入。', check: '买之前在券商软件里确认“港股通”标识。' },
  { t: '同股不同权与协议控制', what: '名字带“W”的公司，创始人每股投票权是普通股东的许多倍；很多互联网公司通过协议控制（VIE）而不是股权控制内地的经营实体。', check: '看招股书和年报里的“合约安排”“不同投票权架构”章节；这类公司更依赖创始人和政策环境。' },
  { t: '做空与沽空报告', what: '港股可以合法卖空指定股票。做空机构发布报告后，被点名的公司常常当天大跌、随即停牌。', check: '看沽空比例的变化；被点名后先读报告和公司回应，不要急着“抄底”。' },
  { t: '汇率', what: '港股通以港元报价、人民币交收，买入和卖出用的参考汇率不同；港元挂钩美元，人民币对美元的涨跌会直接计入你的回报。', check: '把汇率当成持股的一部分风险；长期持有时，它可能抵消也可能放大股价的涨跌。' },
  { t: '交易日', what: '港股通只在两地都开市的日子交易。内地放长假、港股照常开市时，你看得见行情却不能买卖。', check: '节前减少要“随时进出”的仓位。' },
  { t: '每手股数与碎股', what: '每家公司“一手”的股数不同，买卖要按整手；合股、送股后剩下的零碎股份只能在碎股市场折价卖出。', check: '下单前看清每手股数和入场费。' }
];
function drawReefs() {
  $('reefs').innerHTML = REEFS.map((k, i) => `<div class="reef"><h4><span class="no">${String(i + 1).padStart(2, '0')}</span>${k.t}</h4><p><span class="k">是什么</span><span>${k.what}</span></p><p><span class="k">怎么防</span><span>${k.check}</span></p></div>`).join('');
  const T = AHL.slice().sort((a, b) => b.p - a.p).slice(0, 12), neg = AHL.filter(d => d.p < 0);
  $('cheapSub').textContent = `${HDATE}收盘，H股相对A股折价最深的12家。`;
  $('tCheap').innerHTML = `<thead><tr><th>公司</th><th class="l hide-s">国</th><th>A比H</th><th>A股市值</th><th>十年回报率</th><th class="hide-s">五年含金量</th></tr></thead><tbody>${T.map(d => `<tr class="pick" data-c="${d.a}"><td><span class="co-n">${esc(d.o.name)}</span><span class="co-c">${d.h}</span></td><td class="l hide-s">${SECT[d.o.s].n}</td><td>${pctS(d.p)}</td><td>${fmtYi(d.cap)}</td><td>${pct1(d.roe10)}</td><td class="hide-s">${isFinite(d.cc5) ? x2(d.cc5) : '—'}</td></tr>`).join('')}</tbody>`;
  $('tCheap').querySelectorAll('tr.pick').forEach(r => r.onclick = () => pickAh(AHBY.get(r.dataset.c), true));
  $('sCheap').innerHTML = `这12家的A股市值中位数只有 <b>${fmtYi(d3.median(T, d => d.cap))}</b>，十年平均回报率中位数 ${pct1(d3.median(T, d => d.roe10))}；H股比A股还贵的 ${neg.length} 家，市值中位数是 ${fmtYi(d3.median(neg, d => d.cap))}，十年回报率中位数 ${pct1(d3.median(neg, d => d.roe10))}。H股打了三折、四折，往往不是市场看错了，而是这门生意本来就不值A股的价格。`;
}

// ================================================================ 选城
const S = { roe: 10, pe: 20, p: 0, scope: 'all', nofin: false, cash: false };
let SHOWALL = false;
function passes(d) {
  if (S.scope !== 'all' && d.o.s !== +S.scope) return false;
  if (S.nofin && d.fin) return false;
  if (!(d.roe10 >= S.roe)) return false;
  if (!(d.peH > 0 && d.peH <= S.pe)) return false;
  if (!(d.p >= S.p)) return false;
  if (S.cash && !(d.fin || d.cc5 >= 1)) return false;
  return true;
}
function drawScreen() {
  $('vRoe').textContent = S.roe + '%'; $('vPe').textContent = S.pe + ' 倍'; $('vP2').textContent = pctS(S.p);
  document.querySelectorAll('#ahChips button').forEach(b => b.setAttribute('aria-pressed', !!S[b.dataset.k]));
  const R = AHL.filter(passes).sort((a, b) => b.roe10 - a.roe10);
  $('resSum').innerHTML = `${AHL.length} 对A+H公司里，<b>${R.length}</b> 对符合条件。按十年平均回报率排序。`;
  const show = SHOWALL ? R : R.slice(0, 20);
  $('tAh').innerHTML = `<thead><tr><th>公司</th><th class="l hide-s">国</th><th>十年回报率</th><th>五年含金量</th><th>H股市盈率</th><th>A比H</th><th class="hide-s">A股市值</th></tr></thead><tbody>${show.map(d => `<tr class="pick${AH_SEL === d ? ' sel' : ''}" data-c="${d.a}"><td><span class="co-n">${esc(d.o.name)}</span><span class="co-c">${d.a} · ${d.h}</span></td><td class="l hide-s">${SECT[d.o.s].n}</td><td>${pct1(d.roe10)}</td><td>${d.fin ? '<span class="co-c" style="margin:0">金融</span>' : isFinite(d.cc5) ? x2(d.cc5) : '—'}</td><td>${d.peH.toFixed(1)}</td><td>${pctS(d.p)}</td><td class="hide-s">${fmtYi(d.cap)}</td></tr>`).join('') || '<tr><td colspan="7" style="text-align:left;color:var(--fg-3)">没有公司符合条件，放宽一点试试。</td></tr>'}</tbody>`;
  $('tAh').querySelectorAll('tr.pick').forEach(r => r.onclick = () => pickAh(AHBY.get(r.dataset.c), false));
  const mb = $('moreAh'); mb.hidden = R.length <= 20; mb.textContent = SHOWALL ? '收起' : `显示全部 ${R.length} 对`; mb.onclick = () => { SHOWALL = !SHOWALL; drawScreen(); };
}
function initScreen() {
  const by = SECT.map(s => [s, AHL.filter(d => d.o.s === s.i).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
  $('selScope').innerHTML = `<option value="all">全部（${AHL.length}对）</option>` + by.map(([s, n]) => `<option value="${s.i}">${s.n}（${n}）</option>`).join('');
  $('selScope').onchange = e => { S.scope = e.target.value; SHOWALL = false; drawScreen(); };
  $('ahChips').innerHTML = [['nofin', '不含金融'], ['cash', '含金量1以上']].map(([k, n]) => `<button class="chip" data-k="${k}">${n}</button>`).join('');
  document.querySelectorAll('#ahChips button').forEach(b => b.onclick = () => { S[b.dataset.k] = !S[b.dataset.k]; drawScreen(); });
  [['fRoe', 'roe'], ['fPe', 'pe'], ['fP', 'p']].forEach(([id, k]) => { $(id).value = S[k]; $(id).oninput = e => { S[k] = +e.target.value; SHOWALL = false; drawScreen(); }; });
  const R = AHL.filter(d => d.roe10 >= 10 && d.peH > 0 && d.peH <= 15 && d.p >= 20);
  $('t5').innerHTML = `对两地上市的公司，最省力的办法是：<b>用A股的年报判断生意，用H股的价格决定买哪边</b>。默认条件下，十年平均回报率10%以上、H股市盈率不到20倍的公司都会列出来；再要求A比H贵20%以上、H股市盈率不到15倍，${AHL.length} 对里还剩 ${R.length} 对。只在港股上市的公司没有A股年报可用，下面按类别写了各自该看什么。`;
}
function pickAh(d, scroll) {
  if (!d) return;
  AH_SEL = d; const P = $('ahDetail'); P.hidden = false;
  if (scroll) document.getElementById('xuancheng').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const o = d.o, after = d.dy ? d.dy * (1 - d.tax / 100) : NaN;
  P.innerHTML = `<h3>${esc(o.name)}<small>A股 ${d.a} · H股 ${d.h} · ${SECT[o.s].n}</small><small><a href="index.html#co=${o.code}">在地图上看</a> · <a href="faxian.html#co=${o.code}">财报小传</a> · <a href="zhencha.html#co=${o.code}">财报侦探</a></small></h3>
    <p class="lead">${HDATE}收盘，A股 <b>${d.ap.toFixed(2)}元</b>，H股 <b>${d.hp.toFixed(2)}港元</b>（约${(d.hp * FX).toFixed(2)}元），${premWord(d.p)}。A股地图上的总市值 ${fmtYi(d.cap)}；2016–2025年平均净资产收益率 <b>${pct1(d.roe10)}</b>${d.fin ? '' : `，近五年利润含金量 ${isFinite(d.cc5) ? x2(d.cc5) : '—'}，资产负债率 ${isFinite(d.lev) ? Math.round(d.lev) + '%' : '—'}`}；按2025年利润，A股市盈率 ${isFinite(d.peA) ? d.peA.toFixed(1) + '倍' : '亏损'}，H股 ${isFinite(d.peH) ? d.peH.toFixed(1) + '倍' : '亏损'}。${d.dy ? `H股股息率 ${d.dy.toFixed(2)}%，通过港股通扣 ${d.tax}% 的税后 ${after.toFixed(2)}%，A股持有一年以上是 ${(d.dy / d.r).toFixed(2)}%。` : ''}</p>
    <div class="trio"><div><h5>历年净资产收益率</h5><p class="sub">${FY0}–${FY1}，金线是15%</p><div id="dRoe"></div></div><div><h5>两地价格</h5><p class="sub">把H股价格折成人民币，和A股放在一起</p><div id="dPx"></div></div></div>`;
  { const el = $('dRoe'), { svg, w } = svgIn(el, 96, '历年净资产收益率'), ks = d3.range(NY), vals = o.roe.filter(isFinite), hi = Math.min(60, Math.max(20, ...vals)), lo = Math.max(-30, Math.min(0, ...vals));
    const bx = d3.scaleBand(ks, [2, w - 2]).padding(0.2), y = d3.scaleLinear([lo, hi], [80, 6]).clamp(true);
    svg.append('line').attr('x1', 0).attr('x2', w).attr('y1', y(15)).attr('y2', y(15)).attr('stroke', cssv('--gold')).attr('stroke-dasharray', '3 3');
    for (const k of ks) if (isFinite(o.roe[k])) svg.append('rect').attr('x', bx(k)).attr('y', Math.min(y(o.roe[k]), y(0))).attr('width', bx.bandwidth()).attr('height', Math.max(1, Math.abs(y(o.roe[k]) - y(0)))).attr('rx', 1.5).attr('fill', o.roe[k] >= 0 ? cssv('--c1') : cssv('--c2')).attr('opacity', FY0 + k < o.ly ? .35 : .85);
    svg.append('text').attr('class', 'tick').attr('x', 2).attr('y', 94).text(FY0); svg.append('text').attr('class', 'tick').attr('x', w - 2).attr('y', 94).attr('text-anchor', 'end').text(FY1);
    nearest(svg, ks.filter(k => isFinite(o.roe[k])).map(k => ({ k })), q => bx(q.k) + bx.bandwidth() / 2, q => y(o.roe[q.k]), { l: 0, r: w, t: 0, b: 82 }, q => `<div class="t">${FY0 + q.k}年</div>${rows(['净资产收益率', pct1(o.roe[q.k])], ['归母净利润', fmtYi(o.ni[q.k])])}`); }
  { const el = $('dPx'), { svg, w } = svgIn(el, 96, '两地价格'), hy = d.hp * FX, mx = Math.max(d.ap, hy) * 1.15, x = d3.scaleLinear([0, mx], [52, w - 60]);
    [['A股', d.ap, cssv('--fg-2')], ['H股', hy, cssv('--c3')]].forEach(([l, v, c], i) => { const y = 14 + i * 36;
      svg.append('text').attr('class', 'lab').attr('x', 0).attr('y', y + 12).text(l);
      svg.append('path').attr('d', barPath(x(0), y, Math.max(2, x(v) - x(0)), 18)).attr('fill', c).attr('opacity', .8);
      svg.append('text').attr('class', 'lab b').attr('x', x(v) + 6).attr('y', y + 13).text(v.toFixed(2) + '元'); }); }
  drawScreen(); drawAh();
}
function drawHkCats() {
  const CATS = [
    ['平台', '互联网平台', '看用户和现金', '看核心业务的用户数和变现能力，看<b>经营现金流和自由现金流</b>——平台公司的利润常被投资收益、股权激励和公允价值变动扭曲；看<b>回购加分红</b>的总额，近几年头部平台把大量现金用于回购，这才是股东真正拿到的回报；再看监管和反垄断的风险。'],
    ['科技', '新科技与AI', '看研发能不能变成利润', '看收入增速和毛利率、亏损是不是在收窄、账上的现金能撑几年。2025–2026年上市的AI公司，估值主要建立在预期上；没有利润可看的时候，市值大起大落是常态，仓位要小。'],
    ['消费', '消费品牌', '看复购、渠道和分红', '看同店销售和复购、存货和经销商库存、毛利率能不能守住。不少港股消费公司的分红率比A股同行高，股息率要扣税再比。'],
    ['金融', '香港与国际金融', '看资本和利率', '看资本充足率和回购分红、净息差（随美元利率起落）、保险的新业务价值、港交所的成交额。它们的盈利更多连着美元利率和全球资本流动，和内地经济的关系没有那么直接。'],
    ['香港', '香港本地', '看租金、利率和联系汇率', '看租金和出租率、负债和利息、公用事业受管制的回报、博彩的客流。这些公司赚的多是港元、美元和海外的钱，对内地投资者是一种分散。表里的市值是流通市值，没有股息率数据。'],
    ['红筹', '红筹与资源', '看分红政策和税', '红筹股的股息可能被合计扣掉约28%；资源公司看金属价格、储量和开采成本，利润跟着周期走，不要用高点的市盈率判断便宜。']
  ];
  $('hkSub').textContent = `${HDATE}收盘快照里只在港股上市的 ${HKL.length} 家大公司（A+H公司见上表）。市值单位是港元；W：同股不同权，V：协议控制（VIE），S：第二上市。分类和“该看什么”是 AI 写的。`;
  $('hkCats').innerHTML = CATS.map(([k, n, sub, look]) => { const L = HKL.filter(c => c.cat === k).sort((a, b) => b.mcap - a.mcap); if (!L.length) return '';
    return `<div class="hkcat"><h4>${n}<small>${sub} · ${L.length}家</small></h4><p class="look">${look}</p><div class="scrollx"><table class="dt num"><thead><tr><th>公司</th><th class="l hide-s">类型</th><th>市值</th><th>市盈率</th><th>股息率</th><th class="l">港股通</th></tr></thead><tbody>${L.map(c => `<tr><td><span class="co-n">${esc(c.name)}</span><span class="co-c">${c.code}</span>${flagTags(c.flags)}</td><td class="l hide-s">${TYPE_N[c.type]}</td><td>${hkYi(c.mcap)}</td><td>${c.pe > 0 ? c.pe.toFixed(1) : '—'}</td><td>${c.dy === null || c.dy === undefined ? '—' : c.dy.toFixed(2) + '%'}</td><td class="l">${conTag(c.con)}</td></tr>`).join('')}</tbody></table></div></div>`; }).join('');
}

// ================================================================ 启动
function readTheme() { const a = document.documentElement.getAttribute('data-theme'); DARK = a ? a === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
function drawAll() { readTheme(); drawStrip(); drawLand(); drawAh(); drawAhGroups(); drawCalc(); drawYld(); drawReefs(); drawScreen(); drawHkCats(); if (AH_SEL) pickAh(AH_SEL, false); }
initScreen(); initCalc(); drawAll();
let rsT = 0, lastW = innerWidth;
addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rsT); rsT = setTimeout(drawAll, 160); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawAll);
new MutationObserver(drawAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
function fromHash() { const h = location.hash.slice(1); if (h.startsWith('co=')) { const d = AHBY.get(h.slice(3)); if (d) pickAh(d, true); } }
fromHash(); addEventListener('hashchange', fromHash);
const navA = [...document.querySelectorAll('#bar nav a')], secs = navA.map(a => document.querySelector(a.getAttribute('href')));
const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) navA.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }, { rootMargin: '-45% 0px -50% 0px' });
secs.forEach(s => io.observe(s));
addEventListener('scroll', untip, { passive: true });
