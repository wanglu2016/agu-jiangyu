/* “发现好公司”页面脚本。数据：data.js（市值）、extra.js（GDP与名单）、quality.js（年报摘要与复权价）。 */
"use strict";
// ================================================================ 数据
const DATA = window.AGU_DATA, EX = window.AGU_EXTRA, QD = window.AGU_Q;
const MONTHS = DATA.months, NM = MONTHS.length, LAST = NM - 1, TOT = DATA.tot;
const SECT = DATA.sectors.map(([k, n, f], i) => ({ i, k, n, f }));
const SK = Object.fromEntries(SECT.map(s => [s.k, s.i]));
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
  // 净资产收益率：归母净利润 ÷ 年初年末平均归母净资产
  o.avgEq = o.ni.map((_, k) => { const e0 = o.eq[k], e1 = o.eq[k + 1]; return e1 > 0 ? (e0 > 0 ? (e0 + e1) / 2 : e1) : NaN; });
  o.roe = o.ni.map((n, k) => isFinite(n) && o.avgEq[k] > 0 ? n / o.avgEq[k] * 100 : NaN);
  o.s = secAt(o, o.b); o.ly = +MONTHS[o.a].slice(0, 4);
  return o;
});
const cap = (o, t) => (t < o.a || t > o.b) ? 0 : o.v[t - o.a];
const trAt = (o, t) => t === o.b ? o.tr[NT - 1] : MONTHS[t].slice(5) === '12' ? o.tr[+MONTHS[t].slice(0, 4) - 2000] : NaN;
const byCode = new Map(CO.map(o => [o.code, o]));
const LIVE = CO.filter(o => o.b === LAST);
const GDP = EX.gdp;
const gdpAt = t => { const y = +MONTHS[t].slice(0, 4), m = +MONTHS[t].slice(5); return GDP[y - 1] + (GDP[y] - GDP[y - 1]) * m / 12; };
const SEA = MONTHS.map((_, t) => TOT[t] / gdpAt(t) * 100);
const share = SECT.map(s => DATA.sec[s.i].map((v, t) => v / TOT[t] * 100));
const mean = a => { let s = 0, n = 0; for (const v of a) if (isFinite(v)) { s += v; n++; } return n ? s / n : NaN; };
const med = a => d3.median(a.filter(isFinite));
const avgRoe = (o, y0, y1) => { let s = 0; for (let y = y0; y <= y1; y++) { const v = o.roe[yi(y)]; if (!isFinite(v)) return NaN; s += v; } return s / (y1 - y0 + 1); };

// ================================================================ 格式
const fmtYi = v => v >= 10000 ? (v / 10000).toFixed(v >= 100000 ? 1 : 2) + '万亿' : (v >= 100 ? Math.round(v).toLocaleString('zh-CN') : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + '亿';
const fmtPct = v => (Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2)) + '%';
const pct0 = v => isFinite(v) ? Math.round(v) + '%' : '—';
const pct1 = v => isFinite(v) ? v.toFixed(1).replace('-', '−') + '%' : '—';
const sgn = (v, d = 1) => !isFinite(v) ? '—' : Math.abs(v) < 0.05 ? '0.0%' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%';
const ym = t => { const [y, m] = MONTHS[t].split('-'); return `${y}年${+m}月`; };
const ymS = t => MONTHS[t].replace('-', '.');
const mult = v => !isFinite(v) ? '—' : v >= 100 ? Math.round(v) + ' 倍' : v >= 10 ? v.toFixed(1) + ' 倍' : v.toFixed(2) + ' 倍';
const pe1 = v => !isFinite(v) || v <= 0 ? '亏损' : v >= 100 ? Math.round(v) + '' : v.toFixed(1);
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
function yearAxis(g, x, y, i0, i1, w) {
  const span = (i1 - i0) / 12, step = span > 20 ? (w < 520 ? 5 : w < 800 ? 3 : 2) : span > 8 ? 2 : 1;
  for (let yr = 2000; yr <= 2026; yr += 1) { const i = mi(`${yr}-01`); if (i < i0 || i > i1 || (yr - 2000) % step) continue;
    g.append('text').attr('class', 'tick').attr('x', x(i)).attr('y', y).attr('text-anchor', 'middle').text(yr); }
}
// 时间序列的十字线：指针、触摸、键盘（左右键）都能用
function timeCursor(svg, { x, i0, i1, top, bot, left, right, show }) {
  const line = svg.append('line').attr('y1', top).attr('y2', bot).attr('stroke', cssv('--fg-3')).attr('stroke-width', 1).attr('visibility', 'hidden');
  const hit = svg.append('rect').attr('x', left).attr('y', top).attr('width', Math.max(1, right - left)).attr('height', Math.max(1, bot - top)).attr('fill', 'transparent').attr('tabindex', 0).style('outline-offset', '2px');
  let cur = i1;
  const at = (t, cx, cy) => { cur = Math.max(i0, Math.min(i1, t)); line.attr('x1', x(cur)).attr('x2', x(cur)).attr('visibility', 'visible');
    if (cx === undefined) { const r = svg.node().getBoundingClientRect(); cx = r.left + x(cur); cy = r.top + top + 10; }
    tip(show(cur), cx, cy); };
  const pick = ev => Math.round(x.invert(d3.pointer(ev, svg.node())[0]));
  hit.on('pointermove pointerdown', ev => at(pick(ev), ev.clientX, ev.clientY))
     .on('pointerleave blur', () => { line.attr('visibility', 'hidden'); untip(); })
     .on('focus', () => at(cur))
     .on('keydown', ev => { const d = { ArrowLeft: -1, ArrowRight: 1, PageUp: 12, PageDown: -12 }[ev.key]; if (d) { ev.preventDefault(); at(cur + d); } });
}
// 散点的最近点悬停：指针、触摸、键盘
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
// 标注：按优先级依次放，和已放的重叠就换一边，再不行就不放（悬停可见）
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

// ================================================================ 公司的体检指标
const MET = { 10: new Map(), 5: new Map() };
function metric(o, W) {
  const c = MET[W]; if (c.has(o.j)) return c.get(o.j);
  let m = null; const k0 = K1 - W + 1, t0 = dec(FY1 - W);
  if (o.b === LAST && o.a <= t0) {
    const r = o.roe.slice(k0);
    if (r.every(isFinite)) {
      const fin = SECT[o.s].f === 'fin'; let so = 0, sn = 0;
      for (let k = k0; k <= K1; k++) if (isFinite(o.ocf[k]) && isFinite(o.ni[k])) { so += o.ocf[k]; sn += o.ni[k]; }
      const n0 = o.ni[k0 - 1], n1 = o.ni[K1], pes = [];
      for (let y = Math.max(FY0, o.ly); y <= FY1; y++) { const n = o.ni[yi(y)], cp = cap(o, dec(y)); if (n > 0 && cp > 0) pes.push(cp / n); }
      const pe = n1 > 0 ? cap(o, LAST) / n1 : Infinity;
      m = { o, W, roe: mean(r), min: Math.min(...r), last: r[r.length - 1], n15: r.filter(v => v >= 15).length, loss: o.ni.slice(k0).filter(v => v < 0).length,
        fin, cash: fin ? NaN : sn > 0 ? so / sn : NaN, nig: n0 > 0 && n1 > 0 ? n1 / n0 : NaN, n0, n1, pe, peMed: pes.length ? d3.median(pes) : NaN, peN: pes.length,
        pePct: pes.length >= 5 && isFinite(pe) ? pes.filter(v => v < pe).length / pes.length * 100 : NaN,
        gw: o.gw, lev: o.lev[K1], trM: o.tr[NT - 1] / trAt(o, t0), capM: cap(o, LAST) / cap(o, t0), cap: cap(o, LAST) };
    }
  }
  c.set(o.j, m); return m;
}
const ELIG = W => LIVE.map(o => metric(o, W)).filter(Boolean);

// ================================================================ 各国的土壤
const NAT = SECT.map(s => ({ s, ni: new Float64Array(NY), eq: new Float64Array(NY), cp: new Float64Array(NY) }));
for (let y = FY0; y <= FY1; y++) { const k = yi(y), t = dec(y);
  for (const o of CO) { if (t < o.a || t > o.b || !isFinite(o.ni[k]) || !(o.avgEq[k] > 0)) continue; const N = NAT[secAt(o, t)]; N.ni[k] += o.ni[k]; N.eq[k] += o.avgEq[k]; N.cp[k] += cap(o, t); } }
const MKT = { roe: Array.from({ length: NY }, (_, k) => d3.sum(NAT, N => N.ni[k]) / d3.sum(NAT, N => N.eq[k]) * 100) };
const PEAKS = SECT.map(s => { const ser = share[s.i]; let pk = 24; for (let t = 24; t < NM; t++) if (ser[t] > ser[pk]) pk = t; return pk; });
for (const N of NAT) { const i = N.s.i;
  N.roeY = Array.from(N.ni, (n, k) => N.eq[k] > 0 ? n / N.eq[k] * 100 : NaN);
  N.roe10 = d3.sum(N.ni.slice(K1 - 9)) / d3.sum(N.eq.slice(K1 - 9)) * 100;
  N.peY = Array.from(N.ni, (n, k) => n > 0 ? N.cp[k] / n : NaN);
  const mem = LIVE.filter(o => o.s === i); N.n = mem.length;
  let n = 0, e = 0, c = 0, a = 0, b = 0;
  for (const o of mem) { if (isFinite(o.ni[K1])) { n += o.ni[K1]; c += cap(o, LAST); if (o.eq[K1 + 1] > 0) e += o.eq[K1 + 1]; }
    if (isFinite(o.ni[yi(FY1 - 10)]) && isFinite(o.ni[K1])) { a += o.ni[yi(FY1 - 10)]; b += o.ni[K1]; } }
  N.niNow = n; N.peNow = n > 0 ? c / n : NaN; N.pbNow = c / e; N.ni0 = a; N.ni1 = b; N.cagr = a > 0 && b > 0 ? (Math.pow(b / a, 0.1) - 1) * 100 : NaN;
  const rdm = mem.filter(o => isFinite(o.rd) && o.rev[K1] > 0); N.rdN = rdm.length; N.rd = rdm.length ? d3.sum(rdm, o => o.rd * o.rev[K1]) / d3.sum(rdm, o => o.rev[K1]) : NaN;   // 研发费用合计 ÷ 营收合计
  N.band = N.s.f === 'fin' ? 'fin' : N.s.k === 'ai' ? 'hi' : !(rdm.length >= 8) ? 'lo' : N.rd >= 5 ? 'hi' : N.rd >= 2 ? 'mid' : 'lo';
  const el = mem.map(o => metric(o, 10)).filter(Boolean); N.el = el.length; N.good = el.filter(m => m.roe >= 15).length;
  N.share = share[i][LAST]; N.pk = PEAKS[i]; N.pkv = share[i][N.pk]; N.near = N.share >= 0.9 * N.pkv || LAST - N.pk <= 12;
  const t0 = dec(FY1 - 10), ms = []; for (const o of CO) { if (t0 < o.a || t0 > o.b || secAt(o, t0) !== i) continue; const x = trAt(o, t0), z = o.tr[NT - 1]; if (isFinite(x) && isFinite(z)) ms.push(z / x); }
  N.coh = ms.length; N.cohM = ms.length ? d3.median(ms) : NaN;
}
const NEARPEAK = new Set(NAT.filter(N => N.near).map(N => N.s.i));
const BANDS = [['hi', '研发强度5%以上', '--c1'], ['mid', '2%–5%', '--c4'], ['lo', '不到2%', '--c2'], ['fin', '金融', '--c3']];
const BAND_SER = Object.fromEntries(BANDS.map(([k]) => [k, MONTHS.map((_, t) => d3.sum(NAT.filter(N => N.band === k), N => share[N.s.i][t]))]));

// ================================================================ 页首：筛子
const DEF = { W: 10, roe: 15, last: 12, pe: 100, noLoss: true, grew: true, cash: true, peHist: true, gw: false, notPeak: false, scope: 'all' };
const S = Object.assign({}, DEF);
function passes(m, s) {
  return m.roe >= s.roe && m.last >= s.last && (s.pe >= 100 || m.pe <= s.pe) && (!s.noLoss || m.loss === 0) && (!s.grew || m.nig > 1)
    && (!s.cash || m.fin || m.cash >= 0.8) && (!s.peHist || (isFinite(m.pe) && m.pe <= m.peMed)) && (!s.gw || !(m.gw >= 30)) && (!s.notPeak || !NEARPEAK.has(m.o.s));
}
function drawSieve() {
  const all = ELIG(10), a = all.filter(m => m.roe >= 15), b = a.filter(m => m.loss === 0 && m.last >= 12 && m.nig > 1 && (m.fin || m.cash >= 0.8)), c = b.filter(m => passes(m, DEF));
  const steps = [[LIVE.length, '今天在图上的公司'], [all.length, '上市满十年，2016–2025年的年报齐全'], [a.length, '十年平均净资产收益率不低于 <b>15%</b>'],
    [b.length, '没有一年亏损，最近一年仍不低于12%，利润比十年前高，现金流跟得上'], [c.length, '今天的市盈率不高于它自己十年来的中位数']];
  $('sieve').innerHTML = steps.map(([n, k], i) => `<li><a href="#xuncheng"><span class="n">${cnt(n)}<small>家</small></span><span><div class="bar" style="width:${Math.max(0.6, Math.sqrt(n / steps[0][0]) * 100)}%;background:var(--o${i + 2})"></div><div class="k">${k}</div></span></a></li>`).join('');
  $('sieveNote').innerHTML = `每一层的条件都可以在“<a href="#xuncheng">寻城</a>”里自己改。条的长度按家数的平方根画。`;
  return { all, a, b, c };
}

// ================================================================ 一 源头
function drawBand() {
  const el = $('pBand'), small = narrow(), hgt = small ? 300 : 360, { svg, w } = svgIn(el, hgt, '折线图：按研发强度分档的各组国家占全图的份额');
  const m = { l: 40, r: small ? 12 : 138, t: 12, b: 26 }, x = d3.scaleLinear([0, LAST], [m.l, w - m.r]), y = d3.scaleLinear([0, 60], [hgt - m.b, m.t]);
  for (const v of [0, 20, 40, 60]) { svg.append('line').attr('class', v === 0 ? 'zero' : 'grid').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(v)).attr('y2', y(v));
    svg.append('text').attr('class', 'tick').attr('x', m.l - 7).attr('y', y(v) + 4).attr('text-anchor', 'end').text(v + '%'); }
  yearAxis(svg, x, hgt - 6, 0, LAST, w);
  $('lgBand').innerHTML = BANDS.map(([k, n, c]) => `<span><i style="background:var(${c})"></i>${n}（${NAT.filter(N => N.band === k).length}国）</span>`).join('');
  const ends = [];
  for (const [k, n, c] of BANDS) { const ser = BAND_SER[k], col = cssv(c);
    svg.append('path').attr('d', d3.line().x((d, i) => x(i)).y(d => y(d))(ser)).attr('fill', 'none').attr('stroke', col).attr('stroke-width', 2).attr('stroke-linejoin', 'round');
    svg.append('circle').attr('cx', x(LAST)).attr('cy', y(ser[LAST])).attr('r', 4.5).attr('fill', col).attr('stroke', cssv('--panel')).attr('stroke-width', 2);
    ends.push({ n, v: ser[LAST], yy: y(ser[LAST]) }); }
  if (!small) { ends.sort((a, b) => a.yy - b.yy); for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 30) ends[i].yy = ends[i - 1].yy + 30;
    for (const e of ends) { svg.append('text').attr('class', 'lab').attr('x', x(LAST) + 10).attr('y', e.yy - 1).text(e.n); svg.append('text').attr('class', 'lab dim').attr('x', x(LAST) + 10).attr('y', e.yy + 14).text(fmtPct(e.v)); } }
  timeCursor(svg, { x, i0: 0, i1: LAST, top: m.t, bot: hgt - m.b, left: m.l, right: w - m.r,
    show: t => `<div class="t">${ym(t)}</div>` + rows(...BANDS.map(([k, n, c]) => [n, fmtPct(BAND_SER[k][t]), cssv(c)])) });
  const bn = Object.fromEntries(BANDS.map(b => [b[0], b[1]]));
  $('tBand').innerHTML = '<thead><tr><th>国家</th><th>研发强度</th><th>取到数字的公司</th><th>归档</th><th>2015年底份额</th><th>现在份额</th></tr></thead><tbody>' +
    NAT.slice().sort((a, b) => (isFinite(b.rd) ? b.rd : -1) - (isFinite(a.rd) ? a.rd : -1)).map(N => `<tr><td><i class="sw" style="background:${secColor(N.s.i)}"></i>${esc(N.s.n)}</td><td>${N.s.f === 'fin' ? '—' : isFinite(N.rd) ? N.rd.toFixed(1) + '%' : '—'}</td><td>${N.rdN} / ${N.n}</td><td>${bn[N.band]}${N.s.k === 'ai' ? '（按前身归入）' : ''}</td><td>${fmtPct(share[N.s.i][dec(2015)])}</td><td>${fmtPct(N.share)}</td></tr>`).join('') + '</tbody>';
  // 文字
  const hi = BAND_SER.hi, lo = BAND_SER.lo, t05 = dec(2005); let cross = mi('2008-01'); while (cross < LAST && hi[cross] <= lo[cross]) cross++;
  const names = k => NAT.filter(N => N.band === k && N.s.k !== 'ai').sort((a, b) => b.rd - a.rd).map(N => N.s.n);
  $('t1').innerHTML = `把30国按研发强度分档。${names('hi').join('、')}和AI算力这 ${NAT.filter(N => N.band === 'hi').length} 国，研发费用占到营业收入的5%以上；2005年底它们合计只占全图的 <b>${fmtPct(hi[t05])}</b>，现在占 <b>${fmtPct(hi[LAST])}</b>。研发强度不到2%的 ${NAT.filter(N => N.band === 'lo').length} 国，同期从 ${fmtPct(lo[t05])} 降到 <b>${fmtPct(lo[LAST])}</b>。两条线在${MONTHS[cross].slice(0, 4)}年第一次交叉。二十年来，版图一直朝知识密集的方向长；下一步往哪里长，要看哪些学科正在从论文变成产品。`;
}
// 前沿：学科 → 一组公司
const lens = k => (EX.lens.find(l => l.k === k) || EX.cand.find(l => l.k === k)).codes;
const natCodes = (...ks) => LIVE.filter(o => ks.includes(SECT[o.s].k)).map(o => o.code);
const uniq = a => [...new Set(a)];
const FRONTS = [
  { k: 'aihw', n: 'AI算力', disc: '计算机科学 · 光电子 · 微电子', codes: uniq([...lens('hw'), ...lens('aichip')]), what: '光模块、服务器、PCB、液冷和国产AI芯片', att: 3,
    ms: [['2012-10', '深度学习在图像识别上胜出'], ['2017-06', 'Transformer论文'], ['2022-11', 'ChatGPT发布'], ['2025-01', 'DeepSeek-R1发布']],
    say: '这是眼下唯一一条从学科突破、到订单、再到利润完整走通的前沿，利润是真的，而且集中在少数几家。它的风险不在学科，在周期：客户是全球几家云厂商，资本开支一停，利润和估值会一起掉。',
    sig: '云厂商的资本开支还在不在加速；国产芯片从“能用”到“赚钱”。' },
  { k: 'aiapp', n: 'AI应用', disc: '计算机科学 · 各行各业的知识', codes: lens('app'), what: '办公、金融、工业、安防等软件与内容公司', att: 2,
    ms: [['2022-11', 'ChatGPT发布'], ['2025-01', 'DeepSeek-R1发布']],
    say: '模型越强，软件公司越要回答一个问题：自己是被AI增强，还是被AI替代。A股的软件公司过去十年合计回报率很低，这片土壤本来就薄；真正用AI赚到新钱的公司，可能还没出现在这份名单里。',
    sig: '收入里有多少是AI带来的新钱，而不是老产品改了名字。' },
  { k: 'semi', n: '半导体', disc: '凝聚态物理 · 材料 · 化学', codes: natCodes('semi'), what: '设计、制造、封测、设备和材料', att: 3,
    ms: [['2014-09', '国家集成电路产业基金成立'], ['2018-04', '中兴被禁运'], ['2019-07', '科创板开市'], ['2020-12', '集成电路成为一级学科'], ['2022-10', '美国扩大出口管制']],
    say: '外部管制把“能不能买到”变成了“必须自己造”，需求是确定的。不确定的是回报：这是资本和研发最重的行业之一，过去十年合计的净资产收益率只有个位数，版图扩张主要靠上市融资和估值。',
    sig: '设备和材料公司的利润率能不能随规模上升；先进制程的良率。' },
  { k: 'energy', n: '新能源与储能', disc: '电化学 · 电力电子 · 材料', codes: uniq([...natCodes('power'), ...lens('storage')]), what: '电池、光伏、风电、电网设备和储能', att: 2,
    ms: [['2019-10', '锂电池获诺贝尔化学奖'], ['2020-02', '首个储能本科专业获批'], ['2020-09', '提出“双碳”目标']],
    say: '技术路线已经赢了：光伏和电池成了世界上最便宜的电和最便宜的储能。但赢的是用户，不是股东，产能过剩把利润打回了原形。留下来的会是成本最低、现金流为正的少数几家，而且现在不贵。',
    sig: '行业资本开支收缩之后，龙头的净资产收益率能不能回到两位数。' },
  { k: 'bio', n: '创新药', disc: '分子生物学 · 免疫学 · 化学', codes: lens('innodrug'), what: '以自主研发的新药为主业的公司', att: 3,
    ms: [['2015-08', '药品审评审批改革'], ['2018-12', '首个国产PD-1获批'], ['2019-07', '科创板允许未盈利药企上市']],
    say: '中国的创新药从仿制走到了把授权卖给跨国药企，行业第一次整体盈利。生物学是这个世纪最深的一口井，AI又在加速它。但单家公司的命运常常系在一两个分子上，分散比挑选重要；很多最好的公司只在港股。',
    sig: '授权出去的药在海外三期临床的结果；自己在海外卖药的收入。' },
  { k: 'robot', n: '机器人', disc: '机械 · 控制 · 人工智能', codes: lens('robot'), what: '人形机器人整机和伺服、减速器、丝杠、传感器', att: 2,
    ms: [['2022-09', '特斯拉展示人形机器人原型'], ['2023-10', '工信部人形机器人指导意见'], ['2025-01', '人形机器人登上春晚']],
    say: '把大模型装进身体，是AI之后最自然的一步，也是中国制造业最可能占优的一步。但今天的收入主要来自科研、展示和送样，离“比人工便宜”还远，是典型的版图走在利润前面。',
    sig: '单台成本和连续工作的时间；有没有工厂为它下第二批订单。' },
  { k: 'sky', n: '航空航天与低空', disc: '空气动力学 · 材料 · 通信', codes: uniq([...natCodes('defense'), ...lens('lowalt')]), what: '军工主机和配套，低空的零部件、运营与空管', att: 1,
    ms: [['2023-12', '中央经济工作会议提出低空经济'], ['2024-03', '低空经济写入政府工作报告'], ['2025-04', '低空技术与工程进入本科专业目录']],
    say: '低空的整机厂不在A股，商业航天的主力也大多还没上市，A股里能买到的多是军工配套和零部件。方向是真的，载体不全。',
    sig: '适航取证和空域开放的进度；可回收火箭能不能把发射成本降下来。' },
];
function grpStat(codes) {
  const mem = codes.map(c => byCode.get(c)).filter(Boolean), live = mem.filter(o => o.b === LAST);
  const sh = MONTHS.map((_, t) => { let s = 0; for (const o of mem) s += cap(o, t); return s / TOT[t] * 100; });
  const niY = k => d3.sum(live, o => isFinite(o.ni[k]) ? o.ni[k] : 0);
  let n = 0, e = 0, c = 0; for (const o of live) if (isFinite(o.ni[K1])) { n += o.ni[K1]; c += cap(o, LAST); if (o.avgEq[K1] > 0) e += o.avgEq[K1]; }
  // 同一批公司：2022年底已上市、两年的利润都有
  const t0 = dec(FY1 - 3), k0 = K1 - 3; let a = 0, b = 0, c0 = 0, c1 = 0;
  for (const o of live) if (o.a <= t0 && isFinite(o.ni[k0]) && isFinite(o.ni[K1])) { a += o.ni[k0]; b += o.ni[K1]; c0 += cap(o, t0); c1 += cap(o, LAST); }
  return { n: live.length, sh, ni: n, niPrev: niY(K1 - 3), roe: e > 0 ? n / e * 100 : NaN, pe: n > 0 ? c / n : NaN, ni0: a, ni1: b, shM: c0 > 0 ? (c1 / TOT[LAST]) / (c0 / TOT[t0]) : NaN,
    top: live.slice().sort((p, q) => cap(q, LAST) - cap(p, LAST)).slice(0, 3).map(o => o.name) };
}
FRONTS.forEach(f => { f.st = grpStat(f.codes); });
function sparkEv(el, ser, i0, color, evs, name) {
  const hgt = 76, { svg, w } = svgIn(el, hgt, `${name}占全图份额的走势`);
  const x = d3.scaleLinear([i0, LAST], [2, w - 2]), mx = d3.max(ser.slice(i0)) * 1.18 || 1, y = d3.scaleLinear([0, mx], [hgt - 14, 12]), pts = d3.range(i0, LAST + 1);
  svg.append('line').attr('class', 'grid').attr('x1', 2).attr('x2', w - 2).attr('y1', y(0)).attr('y2', y(0));
  svg.append('path').attr('d', d3.area().x(t => x(t)).y0(y(0)).y1(t => y(ser[t]))(pts)).attr('fill', color).attr('opacity', .12);
  svg.append('path').attr('d', d3.line().x(t => x(t)).y(t => y(ser[t]))(pts)).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('stroke-linejoin', 'round');
  const cin = cssv('--cinnabar');
  for (const [m] of evs) { const t = mi(m); if (t < i0) continue; svg.append('path').attr('d', `M${x(t)},${y(ser[t]) - 5}l-4,-7h8z`).attr('fill', cin); }
  svg.append('circle').attr('cx', x(LAST)).attr('cy', y(ser[LAST])).attr('r', 4).attr('fill', color).attr('stroke', cssv('--panel')).attr('stroke-width', 2);
  svg.append('text').attr('class', 'tick').attr('x', 2).attr('y', hgt - 2).text(MONTHS[i0].slice(0, 4));
  svg.append('text').attr('class', 'tick').attr('x', w - 2).attr('y', hgt - 2).attr('text-anchor', 'end').text(MONTHS[LAST].slice(0, 4));
  svg.append('text').attr('class', 'tick').attr('x', 2).attr('y', 9).text(fmtPct(mx));
  timeCursor(svg, { x, i0, i1: LAST, top: 2, bot: hgt - 14, left: 0, right: w,
    show: t => { const ev = evs.find(([m]) => Math.abs(mi(m) - t) <= 1); return `<div class="t">${esc(name)}</div>` + rows([ym(t), fmtPct(ser[t])]) + (ev ? `<div class="s">▲ ${ev[0].replace('-', '.')} ${esc(ev[1])}</div>` : ''); } });
}
function drawFronts() {
  const box = $('fronts'); box.textContent = ''; const i0 = mi('2015-01'), col = cssv('--c1');
  for (const f of FRONTS) { const st = f.st, el = document.createElement('div'); el.className = 'front';
    el.innerHTML = `<h4>${esc(f.n)}<span class="att" title="AI的注意力：${f.att} / 3">AI的注意力${[1, 2, 3].map(i => `<i class="${i <= f.att ? 'f' : ''}"></i>`).join('')}</span></h4>
      <div class="disc">${esc(f.disc)} → ${esc(f.what)}，${st.n} 家</div><div class="mini"></div>
      <div class="kv num"><div><b>${fmtPct(st.sh[LAST])}</b>占全图</div><div><b>${st.ni >= 0 ? fmtYi(st.ni) : '−' + fmtYi(-st.ni)}</b>${FY1}年利润</div><div><b>${pct1(st.roe)}</b>净资产收益率</div><div><b>${pe1(st.pe)}${st.pe > 0 ? '倍' : ''}</b>市盈率</div></div>
      <p>${esc(f.say)}</p><p class="sig"><b>要看的信号：</b>${esc(f.sig)}</p>
      <ul class="ms">${f.ms.map(([m, k]) => `<li><b>${m.replace('-', '.')}</b> ${esc(k)}</li>`).join('')}</ul>`;
    box.appendChild(el); sparkEv(el.querySelector('.mini'), st.sh, i0, col, f.ms, f.n); }
  const far = document.createElement('div'); far.className = 'front far';
  far.innerHTML = `<h4>远方<span class="att">看论文，不看股价</span></h4><div class="disc">量子信息 · 可控核聚变 · 脑机接口 · 合成生物学</div>
    <p>这些还在“学科”的阶段：论文和实验装置在进步，产业和利润还没有。对一个要选专业的学生，这里可能是最好的去处；对一笔要求回报的钱，现在只需要看，不需要买。A股里没有成形的载体，所以不列名单。</p>
    <p class="sig"><b>要看的信号：</b>有没有人开始为它付钱，而不只是为它拨款。</p>
    <ul class="ms"><li><b>2022.12</b> 激光聚变首次实现净能量增益</li><li><b>2024.12</b> 量子纠错跨过盈亏点</li><li><b>2026.04</b> 具身智能、脑机科学与技术进入本科专业目录</li></ul>`;
  box.appendChild(far);
}
function drawLead() {
  const groups = [...EX.cand, ...EX.lens].map(g => ({ n: g.n, st: grpStat(g.codes) }));
  const ok = groups.filter(g => g.st.ni0 > 0 && g.st.ni1 > 0).map(g => ({ g, x: g.st.ni1 / g.st.ni0, y: g.st.shM })), odd = groups.filter(g => !(g.st.ni0 > 0 && g.st.ni1 > 0));
  const el = $('pLead'), small = narrow(), hgt = small ? 330 : 400, { svg, w } = svgIn(el, hgt, '散点图：各条前沿的利润倍数与版图倍数');
  const m = { l: 50, r: 16, t: 14, b: 44 }, strip = odd.length ? (small ? 78 : 104) : 0;
  const lo = Math.min(0.5, d3.min(ok, d => Math.min(d.x, d.y)) * 0.8, d3.min(odd, g => g.st.shM) * 0.8 || 9), hi = Math.max(4, d3.max(ok, d => Math.max(d.x, d.y)) * 1.25, d3.max(odd, g => g.st.shM) * 1.25 || 0);
  const x = d3.scaleLog([lo, hi], [m.l + strip, w - m.r]), y = d3.scaleLog([lo, hi], [hgt - m.b, m.t]);
  const tk = [0.25, 0.5, 1, 2, 4, 8, 16, 32].filter(v => v >= lo && v <= hi);
  for (const v of tk) { svg.append('line').attr('class', v === 1 ? 'zero' : 'grid').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(v)).attr('y2', y(v));
    svg.append('text').attr('class', 'tick').attr('x', m.l - 7).attr('y', y(v) + 4).attr('text-anchor', 'end').text(v + '倍');
    svg.append('line').attr('class', v === 1 ? 'zero' : 'grid').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t).attr('y2', hgt - m.b);
    svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', hgt - m.b + 16).attr('text-anchor', 'middle').text(v + '倍'); }
  svg.append('line').attr('x1', x(lo)).attr('y1', y(lo)).attr('x2', x(hi)).attr('y2', y(hi)).attr('stroke', cssv('--gold')).attr('stroke-width', 1.5);
  svg.append('text').attr('class', 'quad').attr('x', (x(lo) + x(hi)) / 2 - 20).attr('y', m.t + 16).attr('text-anchor', 'end').text('版图跑在利润前面');
  svg.append('text').attr('class', 'quad').attr('x', w - m.r - 6).attr('y', hgt - m.b - 10).attr('text-anchor', 'end').text('利润跑在版图前面');
  svg.append('text').attr('class', 'tick').attr('x', (m.l + strip + w - m.r) / 2).attr('y', hgt - 6).attr('text-anchor', 'middle').text(`利润：${FY1}年 ÷ ${FY1 - 3}年（同一批公司）`);
  const c1 = cssv('--c1'), ring = cssv('--panel'), pts = [];
  if (strip) { svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', strip - 10).attr('height', hgt - m.b - m.t).attr('fill', cssv('--band'));
    svg.append('text').attr('class', 'tick').attr('x', m.l + (strip - 10) / 2).attr('y', hgt - m.b + 16).attr('text-anchor', 'middle').text(small ? '曾亏损' : `${FY1 - 3}年合计亏损`);
    odd.forEach(g => pts.push({ g, px: m.l + (strip - 10) / 2, py: y(Math.max(lo, Math.min(hi, g.st.shM))), odd: true })); }
  ok.forEach(d => pts.push({ g: d.g, px: x(d.x), py: y(d.y), x: d.x }));
  svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', d => d.px).attr('cy', d => d.py).attr('r', 6).attr('fill', d => d.odd ? ring : c1).attr('stroke', d => d.odd ? c1 : ring).attr('stroke-width', 2);
  placeLabels(svg, pts.map(d => ({ x: d.px, y: d.py, r: 6, text: d.g.n })), { l: m.l, r: w - 2, t: 0, b: hgt - m.b }, pts.map(d => ({ x: d.px, y: d.py, r: 7 })));
  nearest(svg, pts, d => d.px, d => d.py, { l: m.l, t: m.t, r: w - m.r, b: hgt - m.b }, d => `<div class="t">${esc(d.g.n)}</div>` + rows([`${FY1 - 3}年利润`, (d.g.st.ni0 < 0 ? '−' : '') + fmtYi(Math.abs(d.g.st.ni0)) + '元'], [`${FY1}年利润`, (d.g.st.ni1 < 0 ? '−' : '') + fmtYi(Math.abs(d.g.st.ni1)) + '元'], d.odd ? null : ['利润变为', mult(d.x)], ['占全图的份额变为', mult(d.g.st.shM)], ['今天的市盈率', pe1(d.g.st.pe)]));
  const above = ok.filter(d => d.y > d.x * 1.15).sort((a, b) => b.y / b.x - a.y / a.x), below = ok.filter(d => d.x > d.y * 1.15).sort((a, b) => b.x / b.y - a.x / a.y);
  $('sLead').innerHTML = (above.length ? `版图比利润跑得快的有<b>${above.map(d => d.g.n.replace(/、/g, '')).join('、')}</b>：市场已经把以后的增长算进了价格。` : '') + (below.length ? `利润比版图跑得快的有<b>${below.map(d => d.g.n).join('、')}</b>：利润涨了，市场还不肯给更高的价。` : '') + (odd.length ? `${odd.map(g => g.n).join('、')}三年前合计还在亏损，放在左边的色带里。` : '') + '两边都可能是对的：前一种要看利润追不追得上，后一种要看利润保不保得住。';
}
const MAJOR = { years: [2015, 2016, 2017, 2018, 2019, 2020, 2021], big: [3, 32, 250, 196, 138, 62, 34], ai: [null, null, null, 35, 180, 130, null] };
function drawMajor() {
  const el = $('pMajor'), small = narrow(), hgt = small ? 230 : 260, { svg, w } = svgIn(el, hgt, '柱状图：数据科学与大数据技术、人工智能两个本科专业历年新增的高校数');
  const m = { l: 36, r: 8, t: 20, b: 40 }, x = d3.scaleBand(MAJOR.years, [m.l, w - m.r]).paddingInner(0.3).paddingOuter(0.1), y = d3.scaleLinear([0, 280], [hgt - m.b, m.t]);
  for (const v of [0, 100, 200]) { svg.append('line').attr('class', v === 0 ? 'zero' : 'grid').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(v)).attr('y2', y(v)); svg.append('text').attr('class', 'tick').attr('x', m.l - 7).attr('y', y(v) + 4).attr('text-anchor', 'end').text(v); }
  const bw = Math.min(24, (x.bandwidth() - 2) / 2), cols = [cssv('--c3'), cssv('--c1')];
  MAJOR.years.forEach((yr, i) => { const cx = x(yr) + x.bandwidth() / 2;
    [MAJOR.big[i], MAJOR.ai[i]].forEach((v, j) => { if (v == null) return; const xx = cx + (j ? 1 : -bw - 1), g = svg.append('g').attr('tabindex', 0);
      g.append('path').attr('d', colPath(xx, y(0), bw, y(0) - y(v))).attr('fill', cols[j]);
      g.append('text').attr('class', 'lab').attr('x', xx + bw / 2).attr('y', y(v) - 5).attr('text-anchor', 'middle').text(v);
      const show = ev => { const r = svg.node().getBoundingClientRect(); tip(`<div class="t">${yr}年度</div>` + rows([j ? '人工智能' : '数据科学与大数据技术', v + ' 所高校', cols[j]]), ev.clientX || r.left + xx, ev.clientY || r.top + y(v)); };
      g.on('pointermove', show).on('focus', show).on('pointerleave blur', untip); });
    svg.append('text').attr('class', 'tick').attr('x', cx).attr('y', hgt - m.b + 16).attr('text-anchor', 'middle').text(yr);
    if (i === 3) svg.append('text').attr('class', 'tick').attr('x', (m.l + w - m.r) / 2).attr('y', hgt - 6).attr('text-anchor', 'middle').text('获批的年度（结果在次年春天公布）'); });
  const soft = share[SK.soft], pk = PEAKS[SK.soft], ai = share[SK.ai];
  $('sMajor').innerHTML = `大数据专业在2017–2019年度三年里新增了 584 个，占全部的八成；第一批学生2022年前后毕业时，“计算机”国的版图已经从${ymS(pk)}的 ${fmtPct(soft[pk])} 回落到 ${fmtPct(soft[dec(2022)])}，现在是 ${fmtPct(soft[LAST])}。人工智能专业在2019年度一年新增 180 个，到2024年已有约498所高校开设；它的第一批学生毕业时，“AI算力”的版图正从2023年初的 ${fmtPct(ai[mi('2023-01')])} 涨到现在的 <b>${fmtPct(ai[LAST])}</b>。同样是追着热点开专业，一次落在了峰值后面，一次赶在了前面。<b>选专业和选行业一样，是在给四年以后下注</b>；学科告诉你方向，不告诉你时间。2021年度以后人工智能专业各年的数字没有逐一核对，图上不画。2024年度全国新增专业点1,839个，停招2,220个，撤销1,428个；2026年的专业目录又列入了具身智能、脑机科学与技术等38种新专业。`;
}

// ================================================================ 二 沃土
function drawSoil() {
  const el = $('pSoil'), small = narrow(), hgt = small ? 380 : 470, { svg, w } = svgIn(el, hgt, '散点图：三十国的十年净资产收益率与利润年化增长');
  const m = { l: 46, r: 14, t: 14, b: 44 }, strip = 46, yLo = -18, yHi = 34;
  const xmx = Math.max(26, d3.max(NAT, N => N.roe10) + 2), x = d3.scaleLinear([Math.min(0, d3.min(NAT, N => N.roe10) - 1), xmx], [m.l, w - m.r]), y = d3.scaleLinear([yLo, yHi], [hgt - m.b - strip, m.t]);
  for (const v of [-10, 0, 10, 20, 30]) { svg.append('line').attr('class', v === 0 ? 'zero' : 'grid').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(v)).attr('y2', y(v));
    svg.append('text').attr('class', 'tick').attr('x', m.l - 7).attr('y', y(v) + 4).attr('text-anchor', 'end').text((v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%'); }
  for (const v of [0, 5, 10, 15, 20, 25].filter(v => v <= xmx)) svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', hgt - m.b + 16).attr('text-anchor', 'middle').text(v + '%');
  svg.append('text').attr('class', 'tick').attr('x', (m.l + w - m.r) / 2).attr('y', hgt - 6).attr('text-anchor', 'middle').text('2016–2025年合计的净资产收益率');
  // 全图的两条中线
  const mroe = d3.sum(NAT, N => d3.sum(N.ni.slice(K1 - 9))) / d3.sum(NAT, N => d3.sum(N.eq.slice(K1 - 9))) * 100, a = d3.sum(NAT, N => N.ni0), b = d3.sum(NAT, N => N.ni1), mg = (Math.pow(b / a, 0.1) - 1) * 100;
  const gold = cssv('--gold');
  svg.append('line').attr('x1', x(mroe)).attr('x2', x(mroe)).attr('y1', m.t).attr('y2', hgt - m.b - strip).attr('stroke', gold).attr('stroke-width', 1.5);
  svg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(mg)).attr('y2', y(mg)).attr('stroke', gold).attr('stroke-width', 1.5);
  svg.append('text').attr('class', 'tick').attr('x', x(mroe) + 5).attr('y', hgt - m.b - strip - 4).text(`全图 ${mroe.toFixed(1)}%`);
  svg.append('text').attr('class', 'tick').attr('x', w - m.r).attr('y', y(mg) - 5).attr('text-anchor', 'end').text(`全图 ${sgn(mg)}`);
  [['沃土', w - m.r - 6, m.t + 14, 'end'], ['开荒', m.l + 8, m.t + 14, 'start'], ['熟地', w - m.r - 6, hgt - m.b - strip - 8, 'end'], ['瘠地', m.l + 8, hgt - m.b - strip - 8, 'start']]
    .forEach(([t, xx, yy, an]) => svg.append('text').attr('class', 'quad').attr('x', xx).attr('y', yy).attr('text-anchor', an).text(t));
  const sy = hgt - m.b - strip / 2 + 4;
  svg.append('rect').attr('x', m.l).attr('y', hgt - m.b - strip + 8).attr('width', w - m.l - m.r).attr('height', strip - 8).attr('fill', cssv('--band'));
  svg.append('text').attr('class', 'tick').attr('x', w - m.r - 6).attr('y', hgt - m.b - 8).attr('text-anchor', 'end').text('利润由亏转盈或由盈转亏，算不出增长率');
  const rr = d3.scaleSqrt([0, 16], [3, small ? 20 : 26]), ring = cssv('--panel');
  const pts = NAT.map(N => ({ N, px: x(N.roe10), py: isFinite(N.cagr) ? y(Math.max(yLo, Math.min(yHi, N.cagr))) : sy + 4, r: rr(N.share), odd: !isFinite(N.cagr) })).sort((p, q) => q.r - p.r);
  svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', d => d.px).attr('cy', d => d.py).attr('r', d => d.r).attr('fill', d => secColor(d.N.s.i)).attr('fill-opacity', d => d.odd ? .35 : .85).attr('stroke', ring).attr('stroke-width', 2);
  const pri = pts.slice().sort((p, q) => (Math.abs(q.N.roe10 - mroe) / 6 + q.N.share / 4) - (Math.abs(p.N.roe10 - mroe) / 6 + p.N.share / 4));
  placeLabels(svg, pri.slice(0, small ? 12 : 30).map(d => ({ x: d.px, y: d.py, r: d.r, text: d.N.s.n + (d.N.cagr > yHi ? `（${sgn(d.N.cagr, 0)}）` : d.N.cagr < yLo ? `（${sgn(d.N.cagr, 0)}）` : '') })), { l: m.l, r: w - 2, t: 0, b: hgt - m.b }, pts.map(d => ({ x: d.px, y: d.py, r: d.r })));
  nearest(svg, pts, d => d.px, d => d.py, { l: m.l, t: m.t, r: w - m.r, b: hgt - m.b }, d => { const N = d.N; return `<div class="t">${esc(N.s.n)}</div>` + rows(['十年净资产收益率', pct1(N.roe10)], [`${FY1}年`, pct1(N.roeY[K1])], [`利润 ${FY1 - 10}→${FY1}`, `${(N.ni0 < 0 ? '−' : '') + fmtYi(Math.abs(N.ni0))} → ${(N.ni1 < 0 ? '−' : '') + fmtYi(Math.abs(N.ni1))}`], ['年化', sgn(N.cagr)], ['占全图', fmtPct(N.share)], ['研发强度', N.s.f === 'fin' || !isFinite(N.rd) ? '—' : N.rd.toFixed(1) + '%'], ['市盈率', pe1(N.peNow)]); });
  const top = NAT.slice().sort((p, q) => q.roe10 - p.roe10), hiRd = NAT.filter(N => N.band === 'hi' && N.s.k !== 'ai').sort((p, q) => q.rd - p.rd);
  const both = NAT.filter(N => N.roe10 > mroe + 2 && N.cagr > mg + 2).sort((p, q) => q.roe10 - p.roe10), cyc = NAT.filter(N => N.cagr > 30);
  $('sSoil').innerHTML = `回报率高于全图、利润增长也快于全图的“沃土”只有 <b>${both.map(N => N.s.n).join('、') || '很少几国'}</b>${both.length ? ` ${both.length} 国` : ''}。版图大的国多半挤在左边：${NAT.filter(N => N.roe10 < mroe).length} 个国的回报率低于全图的 ${mroe.toFixed(1)}%。${cyc.length ? `${cyc.map(N => N.s.n).join('、')}的利润是从${FY1 - 10}年的周期低点算起的，增长率要打折看。` : ''}没有标出名字的国，把指针移上去可以看到。`;
  $('t2').innerHTML = `把研发强度和股东的回报放在一起，方向几乎是反的。2016–2025年合计，${top[0].s.n}的净资产收益率是 <b>${pct1(top[0].roe10)}</b>，${top[1].s.n} <b>${pct1(top[1].roe10)}</b>；研发最多的${hiRd.slice(0, 3).map(N => `${N.s.n}只有 <b>${pct1(N.roe10)}</b>`).join('，')}。知识密集的行业版图长得快，可是赚来的钱要先交给研发、设备和价格战，留给股东的不多。整张图的净资产收益率也从${FY0}年的 ${pct1(MKT.roe[0])} 降到了${FY1}年的 <b>${pct1(MKT.roe[K1])}</b>。好土壤有两种：一种回报率高，一种增长快；两样都占的很少。`;
}
function drawHit() {
  const list = NAT.filter(N => N.el >= 10).map(N => ({ N, r: N.good / N.el * 100 })).sort((a, b) => b.r - a.r), tot = d3.sum(NAT, N => N.el), good = d3.sum(NAT, N => N.good);
  $('hitSub').innerHTML = `上市满十年、年报齐全的 ${cnt(tot)} 家公司里，十年平均净资产收益率不低于15%的有 ${good} 家，占 ${fmtPct(good / tot * 100)}。下面是每个国里这样的公司占多少（样本不到10家的国不画）。`;
  const sm = narrow(), rh = 24, m = { l: sm ? 104 : 132, r: sm ? 84 : 112, t: 20, b: 6 }, hgt = m.t + list.length * rh + m.b, { svg, w } = svgIn($('pHit'), hgt, '条形图：各国十年平均净资产收益率不低于15%的公司占比');
  const x = d3.scaleLinear([0, Math.max(60, d3.max(list, d => d.r))], [m.l, w - m.r]), col = cssv('--c1'), gold = cssv('--gold'), avg = good / tot * 100;
  for (const v of [0, 20, 40, 60]) { svg.append('line').attr('class', v === 0 ? 'zero' : 'grid').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t - 4).attr('y2', hgt - m.b); svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', 10).attr('text-anchor', 'middle').text(v + '%'); }
  svg.append('line').attr('x1', x(avg)).attr('x2', x(avg)).attr('y1', m.t - 4).attr('y2', hgt - m.b).attr('stroke', gold).attr('stroke-width', 1.5);
  svg.append('text').attr('class', 'tick').attr('x', x(avg) + 4).attr('y', hgt - m.b - 4).text(`全图 ${fmtPct(avg)}`);
  list.forEach((d, i) => { const yy = m.t + i * rh, g = svg.append('g').attr('tabindex', 0), bw = Math.max(d.r > 0 ? 2 : 0, x(d.r) - x(0));
    g.append('text').attr('class', 'lab').attr('x', m.l - 8).attr('y', yy + 16).attr('text-anchor', 'end').text(d.N.s.n.length > 6 ? d.N.s.n.slice(0, sm ? 4 : 6) : d.N.s.n);
    if (bw > 0) g.append('path').attr('d', barPath(x(0), yy + 5, bw, 14)).attr('fill', col);
    g.append('text').attr('class', 'lab hp').attr('x', x(d.r) + 6).attr('y', yy + 16).text(`${Math.round(d.r)}%`);
    g.append('text').attr('class', 'tick').attr('x', w).attr('y', yy + 16).attr('text-anchor', 'end').text(`${d.N.good} / ${d.N.el} 家`);
    g.append('rect').attr('x', 0).attr('y', yy).attr('width', w).attr('height', rh).attr('fill', 'transparent');
    const show = ev => { const r = svg.node().getBoundingClientRect(); tip(`<div class="t">${esc(d.N.s.n)}</div>` + rows(['上市满十年、年报齐全', d.N.el + ' 家'], ['十年平均不低于15%', d.N.good + ' 家'], ['占', fmtPct(d.r)], ['全国合计的十年回报率', pct1(d.N.roe10)]), ev.clientX || r.left + x(d.r), ev.clientY || r.top + yy); };
    g.on('pointermove', show).on('focus', show).on('pointerleave blur', untip); });
  $('tSoil').innerHTML = `<thead><tr><th>国家</th><th>占全图</th><th>十年回报率</th><th>${FY1}年</th><th>利润年化增长</th><th>研发强度</th><th>十年平均≥15%的公司</th><th>市盈率</th><th>历史中位</th><th>${FY1 - 10}年底买入至今（中位）</th></tr></thead><tbody>` +
    NAT.slice().sort((a, b) => b.roe10 - a.roe10).map(N => `<tr><td><i class="sw" style="background:${secColor(N.s.i)}"></i>${esc(N.s.n)}</td><td>${fmtPct(N.share)}</td><td>${pct1(N.roe10)}</td><td>${pct1(N.roeY[K1])}</td><td>${sgn(N.cagr)}</td><td>${N.s.f === 'fin' || !isFinite(N.rd) ? '—' : N.rd.toFixed(1) + '%'}</td><td>${N.good} / ${N.el}</td><td>${pe1(N.peNow)}</td><td>${pe1(med(N.peY))}</td><td>${N.coh ? mult(N.cohM) : '—'}</td></tr>`).join('') + '</tbody>';
}

// ================================================================ 三 城基
const TIER = [[20, 999, '20%以上'], [15, 20, '15%–20%'], [10, 15, '10%–15%'], [5, 10, '5%–10%'], [-999, 5, '不到5%']];
const fateSet = Y => { const t0 = dec(Y), out = []; for (const o of LIVE) { if (o.a > t0) continue; const f = avgRoe(o, Y + 1, FY1), x = trAt(o, t0), z = o.tr[NT - 1]; if (isFinite(f) && isFinite(x) && isFinite(z)) out.push({ o, f, m: z / x, nig: o.ni[yi(Y)] > 0 && o.ni[K1] > 0 ? o.ni[K1] / o.ni[yi(Y)] : NaN, n0: o.ni[yi(Y)] }); } return out; };
const fateStat = Y => { const u = fateSet(Y); return { u, all: d3.median(u, d => d.m), rows: TIER.map(([a, b, nm]) => { const g = u.filter(d => d.f >= a && d.f < b), ms = g.map(d => d.m).sort(d3.ascending); return { nm, n: g.length, p: g.length / u.length * 100, med: d3.median(ms), q1: d3.quantile(ms, .25), q3: d3.quantile(ms, .75), win: g.filter(d => d.m > 1).length / g.length * 100, x3: g.filter(d => d.m >= 3).length / g.length * 100 }; }) }; };
let FY_START = 2015;
function drawFate() {
  document.querySelectorAll('#segFate button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.y === FY_START));
  const st = fateStat(FY_START), n = FY1 - FY_START;
  $('fateSub').innerHTML = `${FY_START}年底已上市、今天还在的 ${cnt(st.u.length)} 家公司，按此后${n === 10 ? '十' : n}年（${FY_START + 1}–${FY1}）实际的平均净资产收益率分成五档，看从那时持有到${ym(LAST)}的回报是当时的几倍。全体的中位数是 ${mult(st.all)}。`;
  const sm = narrow(), rh = 46, m = { l: sm ? 76 : 96, r: sm ? 12 : 150, t: 22, b: 8 }, hgt = m.t + st.rows.length * rh + m.b, { svg, w } = svgIn($('pFate'), hgt, '区间图：按净资产收益率分档的持股回报倍数');
  const lo = Math.min(0.25, d3.min(st.rows, r => r.q1) * 0.85), hi = Math.max(4, d3.max(st.rows, r => r.q3) * 1.3), x = d3.scaleLog([lo, hi], [m.l, w - m.r]);
  for (const v of [0.125, 0.25, 0.5, 1, 2, 4, 8, 16].filter(v => v >= lo && v <= hi)) { svg.append('line').attr('class', v === 1 ? 'zero' : 'grid').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t - 4).attr('y2', hgt - m.b);
    svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', 11).attr('text-anchor', 'middle').text(v === 1 && !sm ? '1倍（不赚不赔）' : v + '倍'); }
  const c1 = cssv('--c1'), fg = cssv('--fg'), ring = cssv('--panel');
  st.rows.forEach((r, i) => { const yy = m.t + i * rh + rh / 2, g = svg.append('g').attr('tabindex', 0);
    g.append('text').attr('class', 'lab b').attr('x', m.l - 10).attr('y', yy + 4).attr('text-anchor', 'end').text(r.nm);
    g.append('line').attr('x1', x(r.q1)).attr('x2', x(r.q3)).attr('y1', yy).attr('y2', yy).attr('stroke', c1).attr('stroke-width', 10).attr('stroke-linecap', 'round').attr('opacity', .55);
    g.append('circle').attr('cx', x(r.med)).attr('cy', yy).attr('r', 6).attr('fill', fg).attr('stroke', ring).attr('stroke-width', 2);
    g.append('text').attr('class', 'lab hp').attr('x', x(r.med)).attr('y', yy - 12).attr('text-anchor', 'middle').text(mult(r.med));
    if (!sm) { g.append('text').attr('class', 'lab dim').attr('x', w - m.r + 14).attr('y', yy - 2).text(`${cnt(r.n)} 家，占 ${fmtPct(r.p)}`); g.append('text').attr('class', 'tick').attr('x', w - m.r + 14).attr('y', yy + 13).text(`${Math.round(r.win)}% 赚到了钱`); }
    g.append('rect').attr('x', 0).attr('y', yy - rh / 2).attr('width', w).attr('height', rh).attr('fill', 'transparent');
    const show = ev => { const b = svg.node().getBoundingClientRect(); tip(`<div class="t">此后平均净资产收益率 ${r.nm}</div>` + rows(['公司', `${r.n} 家（${fmtPct(r.p)}）`], ['回报倍数的中位数', mult(r.med)], ['中间一半', `${r.q1.toFixed(2)} – ${r.q3.toFixed(2)} 倍`], ['赚到钱的', pct0(r.win)], ['涨到3倍以上的', pct0(r.x3)]), ev.clientX || b.left + x(r.med), ev.clientY || b.top + yy); };
    g.on('pointermove', show).on('focus', show).on('pointerleave blur', untip); });
  $('tFate').innerHTML = '<thead><tr><th>此后平均净资产收益率</th><th>公司数</th><th>占比</th><th>回报倍数中位</th><th>中间一半</th><th>赚到钱</th><th>3倍以上</th></tr></thead><tbody>' + st.rows.map(r => `<tr><td>${r.nm}</td><td>${r.n}</td><td>${fmtPct(r.p)}</td><td>${r.med.toFixed(2)}</td><td>${r.q1.toFixed(2)} – ${r.q3.toFixed(2)}</td><td>${pct0(r.win)}</td><td>${pct0(r.x3)}</td></tr>`).join('') + '</tbody>';
}
// 褪色：2011–2015 的回报率 → 此后十年
const FADE = (() => { const y0 = FY0 + 1, y1 = FY0 + 5, u = CO.filter(o => o.a <= dec(FY0) && o.b >= dec(y1)).map(o => ({ o, p: avgRoe(o, y0, y1), f: o.b === LAST ? avgRoe(o, y1 + 1, FY1) : NaN })).filter(d => isFinite(d.p));
  const CAT = [[15, 999, '保持在15%以上', '--o7'], [10, 15, '10%–15%', '--o5'], [5, 10, '5%–10%', '--o3'], [-999, 5, '不到5%', '--o1'], [null, null, '已退市或年报不全', '--mute']];
  return { y0, y1, n: u.length, CAT, rows: TIER.map(([a, b, nm]) => { const g = u.filter(d => d.p >= a && d.p < b); return { nm, n: g.length, seg: CAT.map(([x, z]) => (x === null ? g.filter(d => !isFinite(d.f)) : g.filter(d => d.f >= x && d.f < z)).length) }; }) }; })();
function drawFade() {
  const F = FADE; $('fadeSub').innerHTML = `${FY0}年底前上市的 ${cnt(F.n)} 家公司，先按${F.y0}–${F.y1}年的平均净资产收益率分档（每一行），再看它们${F.y1 + 1}–${FY1}这十年的平均数落在哪里。`;
  $('lgFade').innerHTML = F.CAT.map(c => `<span><i class="box" style="background:var(${c[3]})"></i>${c[2]}</span>`).join('');
  const sm = narrow(), rh = 38, m = { l: sm ? 76 : 96, r: 8, t: 20, b: 4 }, hgt = m.t + F.rows.length * rh + m.b, { svg, w } = svgIn($('pFade'), hgt, '分段条形图：过去的净资产收益率分档与此后十年的去向');
  const x = d3.scaleLinear([0, 100], [m.l, w - m.r]), ring = cssv('--panel');
  for (const v of [0, 25, 50, 75, 100]) svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', 11).attr('text-anchor', v === 100 ? 'end' : v === 0 ? 'start' : 'middle').text(v + '%');
  F.rows.forEach((r, i) => { const yy = m.t + i * rh; svg.append('text').attr('class', 'lab b').attr('x', m.l - 10).attr('y', yy + 19).attr('text-anchor', 'end').text(r.nm);
    let acc = 0; r.seg.forEach((cntv, j) => { const p = cntv / r.n * 100; if (!cntv) return; const x0 = x(acc), x1 = x(acc + p), g = svg.append('g').attr('tabindex', 0);
      g.append('rect').attr('x', x0 + (acc > 0 ? 2 : 0)).attr('y', yy + 6).attr('width', Math.max(1, x1 - x0 - (acc > 0 ? 2 : 0))).attr('height', 20).attr('fill', cssv(F.CAT[j][3])).attr('rx', 2);
      if (j === 0 && x1 - x0 > 40) g.append('text').attr('x', x0 + 7).attr('y', yy + 20).style('font-size', '12.5px').style('font-weight', 700).style('fill', ring).text(Math.round(p) + '%');
      const show = ev => { const b = svg.node().getBoundingClientRect(); tip(`<div class="t">${F.y0}–${F.y1}年：${r.nm}（${r.n} 家）</div>` + rows([`此后十年${F.CAT[j][2]}`, `${cntv} 家`], ['占', fmtPct(p)]), ev.clientX || b.left + x0, ev.clientY || b.top + yy); };
      g.on('pointermove', show).on('focus', show).on('pointerleave blur', untip); acc += p; }); });
  const a = F.rows[0], b = F.rows[1], z = F.rows[4];
  $('sFade').innerHTML = `${F.y0}–${F.y1}年回报率在20%以上的 ${a.n} 家公司，此后十年还能保持在15%以上的只有 <b>${Math.round(a.seg[0] / a.n * 100)}%</b>；15%–20%那一档是 ${Math.round(b.seg[0] / b.n * 100)}%。反过来，当年不到5%的 ${z.n} 家里，后来升到15%以上的只有 ${Math.round(z.seg[0] / z.n * 100)}%。过去的高回报是最好的线索，但多数会褪色；差的公司变好，比好的公司变差难得多。`;
}
function drawTop() {
  const Y = FY1 - 10, u = fateSet(Y), top = u.slice().sort((a, b) => b.m - a.m).slice(0, 50);
  $('topSub').innerHTML = `${Y}年底到${ym(LAST)}，持股回报最高的50家公司（今天还在、十年年报齐全的 ${cnt(u.length)} 家里）。横轴是利润变成了几倍，纵轴是持股回报变成了几倍。斜线上，回报和利润同步；斜线以上，估值也涨了。`;
  const byNat = d3.rollups(top, v => v.length, d => d.o.s).sort((a, b) => b[1] - a[1]), g15 = top.filter(d => d.f >= 15).length, pm = d3.median(top.filter(d => d.nig > 0), d => d.nig);
  $('tilesTop').innerHTML = [[g15 + ' 家', '十年平均净资产收益率在15%以上'], [mult(pm), '利润倍数的中位数（十年前盈利的公司）'], [mult(d3.median(top, d => d.m)), '持股回报倍数的中位数'], [byNat.slice(0, 3).map(([k, n]) => `${SECT[k].n} ${n}`).join('、'), '出得最多的三个国（家数）']]
    .map(([v, k], i) => `<div class="tile"><div class="v" style="${i === 3 ? 'font-size:17px;line-height:1.6' : ''}">${v}</div><div class="k">${k}</div></div>`).join('');
  const el = $('pTop'), small = narrow(), hgt = small ? 340 : 420, { svg, w } = svgIn(el, hgt, '散点图：五十家公司的利润倍数与持股回报倍数');
  const ok = top.filter(d => d.nig > 0), odd = top.filter(d => !(d.nig > 0)), m = { l: 50, r: 16, t: 14, b: 44 }, strip = odd.length ? (small ? 60 : 90) : 0;
  const xlo = Math.min(1, d3.min(ok, d => d.nig) * 0.8), xhi = Math.min(3000, d3.max(ok, d => d.nig) * 1.3), ylo = d3.min(top, d => d.m) * 0.85, yhi = d3.max(top, d => d.m) * 1.25;
  const x = d3.scaleLog([xlo, xhi], [m.l + strip, w - m.r]).clamp(true), y = d3.scaleLog([ylo, yhi], [hgt - m.b, m.t]);
  for (const v of (small ? [1, 10, 100, 1000] : [1, 3, 10, 30, 100, 300, 1000]).filter(v => v >= xlo && v <= xhi)) { svg.append('line').attr('class', 'grid').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t).attr('y2', hgt - m.b); svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', hgt - m.b + 16).attr('text-anchor', 'middle').text(v + '倍'); }
  for (const v of [3, 5, 10, 20, 50].filter(v => v >= ylo && v <= yhi)) { svg.append('line').attr('class', 'grid').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(v)).attr('y2', y(v)); svg.append('text').attr('class', 'tick').attr('x', m.l - 7).attr('y', y(v) + 4).attr('text-anchor', 'end').text(v + '倍'); }
  const d0 = Math.max(xlo, ylo), d1 = Math.min(xhi, yhi);
  if (d1 > d0) svg.append('line').attr('x1', x(d0)).attr('y1', y(d0)).attr('x2', x(d1)).attr('y2', y(d1)).attr('stroke', cssv('--gold')).attr('stroke-width', 1.5);
  svg.append('text').attr('class', 'tick').attr('x', (m.l + strip + w - m.r) / 2).attr('y', hgt - 6).attr('text-anchor', 'middle').text(`${FY1}年利润 ÷ ${Y}年利润`);
  const c1 = cssv('--c1'), ring = cssv('--panel'), pts = [];
  if (strip) { svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', strip - 10).attr('height', hgt - m.b - m.t).attr('fill', cssv('--band'));
    svg.append('text').attr('class', 'tick').attr('x', m.l + (strip - 10) / 2).attr('y', hgt - m.b + 16).attr('text-anchor', 'middle').text(small ? '曾亏损' : `${Y}年亏损`);
    odd.forEach((d, i) => pts.push({ d, px: m.l + 14 + (i % 3) * ((strip - 38) / 2), py: y(d.m), odd: true })); }
  ok.forEach(d => pts.push({ d, px: x(d.nig), py: y(d.m) }));
  svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', d => d.px).attr('cy', d => d.py).attr('r', 5).attr('fill', d => d.odd ? ring : c1).attr('stroke', d => d.odd ? c1 : ring).attr('stroke-width', 2);
  placeLabels(svg, pts.slice().sort((a, b) => b.d.m - a.d.m).slice(0, small ? 8 : 16).map(d => ({ x: d.px, y: d.py, r: 5, text: d.d.o.name })), { l: m.l, r: w - 2, t: 0, b: hgt - m.b }, pts.map(d => ({ x: d.px, y: d.py, r: 6 })));
  nearest(svg, pts, d => d.px, d => d.py, { l: m.l, t: m.t, r: w - m.r, b: hgt - m.b }, p => { const d = p.d; return `<div class="t">${esc(d.o.name)} <span class="s">${SECT[d.o.s].n}</span></div>` + rows(['持股回报', mult(d.m)], [`利润 ${Y}→${FY1}`, `${(d.n0 < 0 ? '−' : '') + fmtYi(Math.abs(d.n0))} → ${fmtYi(Math.abs(d.o.ni[K1]))}`], d.nig > 0 ? ['利润变为', mult(d.nig)] : null, ['十年平均净资产收益率', pct1(d.f)]); }, p => showDetail(p.d.o, true));
  $('tTop').innerHTML = `<thead><tr><th>公司</th><th class="l">国家</th><th>持股回报</th><th>利润倍数</th><th>十年平均净资产收益率</th><th>今天的市盈率</th></tr></thead><tbody>` + top.map(d => `<tr class="pick" data-j="${d.o.j}"><td><span class="co-n">${esc(d.o.name)}</span><span class="co-c">${d.o.code}</span></td><td class="l"><i class="sw" style="background:${secColor(d.o.s)}"></i>${esc(SECT[d.o.s].n)}</td><td>${mult(d.m)}</td><td>${d.nig > 0 ? mult(d.nig) : '由亏转盈'}</td><td>${pct1(d.f)}</td><td>${pe1(d.o.ni[K1] > 0 ? cap(d.o, LAST) / d.o.ni[K1] : NaN)}</td></tr>`).join('') + '</tbody>';
  $('tTop').querySelectorAll('tr.pick').forEach(tr => tr.onclick = () => showDetail(CO[+tr.dataset.j], true));
  // 城基的文字
  const s = fateStat(Y), a = s.rows[0], z = s.rows[4], f = FADE.rows[0];
  $('t3').innerHTML = `${Y}年底已经上市、今天还在的 ${cnt(s.u.length)} 家公司里，此后十年平均净资产收益率在20%以上的 ${a.n} 家，持股回报的中位数是 <b>${mult(a.med)}</b>；不到5%的 ${cnt(z.n)} 家占了 ${Math.round(z.p)}%，中位数是 <b>${mult(z.med)}</b>，只有 ${Math.round(z.win)}% 赚到了钱。换成2012、2018、2020年买入，次序都一样。涨得最多的50家里，${g15} 家的回报率在15%以上，利润的中位数是十年前的 ${mult(pm)}。难处在于这些都是事后才知道的：${FADE.y0}–${FADE.y1}年回报率超过20%的 ${f.n} 家公司，此后十年还能保持15%以上的只有 <b>${Math.round(f.seg[0] / f.n * 100)}%</b>。`;
}

// ================================================================ 四 地价
const QT3 = [[15, 999, '过去五年回报率 15%以上'], [8, 15, '8%–15%'], [-999, 8, '不到8%']], PT4 = [[0, 20, '市盈率 20倍以下'], [20, 40, '20–40倍'], [40, Infinity, '40倍以上'], [null, null, '上一年亏损']];
function backtest(Y, H) {
  const W = 5, t0 = dec(Y), t1 = H ? dec(Y + H) : LAST, yrs = (t1 - t0) / 12, u = [];
  for (const o of CO) { if (t0 < o.a || t0 > o.b || o.a > dec(Y - W)) continue; const q = avgRoe(o, Y - W, Y - 1); if (!isFinite(q)) continue;
    const ni = o.ni[yi(Y - 1)], pe = ni > 0 ? cap(o, t0) / ni : Infinity, a = trAt(o, t0), te = Math.min(t1, o.b), b = trAt(o, te); if (!isFinite(a) || !isFinite(b)) continue;
    u.push({ q, pe, c: (Math.pow(b / a, 1 / yrs) - 1) * 100 }); }
  const all = d3.median(u, d => d.c), inP = (d, [a, b]) => a === null ? d.pe === Infinity : (d.pe > a && d.pe <= b);
  const cell = g => ({ n: g.length, med: g.length ? d3.median(g, d => d.c) : NaN, win: g.length ? g.filter(d => d.c > all).length / g.length * 100 : NaN });
  return { Y, H, t1, n: u.length, all, grid: QT3.map(([a, b]) => { const g = u.filter(d => d.q >= a && d.q < b); return { cells: PT4.map(p => cell(g.filter(d => inP(d, p)))), tot: cell(g) }; }), cols: PT4.map(p => cell(u.filter(d => inP(d, p)))) };
}
let BT_Y = 2020, BT_H = 0;
function drawBt() {
  if (BT_H && dec(BT_Y + BT_H) < 0) BT_H = 0;
  document.querySelectorAll('#btYears button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.y === BT_Y));
  document.querySelectorAll('#segHold button').forEach(b => { b.setAttribute('aria-pressed', +b.dataset.h === BT_H); if (+b.dataset.h) b.disabled = dec(BT_Y + 5) < 0; });
  const r = backtest(BT_Y, BT_H), end = BT_H ? `${BT_Y + BT_H}年底` : ym(LAST);
  $('btSub').innerHTML = `${BT_Y}年底在图上、上市满五年的 ${cnt(r.n)} 家公司，按${BT_Y - 5}–${BT_Y - 1}年的平均净资产收益率分三行，按当时的市盈率分四列，持有到${end}。格子里是这一组公司年化回报的中位数。`;
  const flat = r.grid.flatMap((g, i) => g.cells.map((c, j) => ({ c, i, j }))).filter(d => d.c.n >= 5), best = d3.greatest(flat, d => d.c.med), worst = d3.least(flat, d => d.c.med);
  const nm = d => `${QT3[d.i][2].replace('过去五年回报率 ', '回报率')}、${PT4[d.j][2].replace('市盈率 ', '')}`;
  $('tilesBt').innerHTML = [[sgn(r.all), '全体公司年化回报的中位数'], [sgn(best.c.med), `最好的一格：${nm(best)}`], [sgn(worst.c.med), `最差的一格：${nm(worst)}`], [pct0(r.grid[0].cells[2].win), '“高回报率、40倍以上”那一格里，跑赢全体中位数的公司']]
    .map(([v, k]) => `<div class="tile"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
  const td = (c, cls) => c.n < 5 ? `<td class="na">${c.n ? c.n + ' 家，太少' : '—'}</td>` : `<td class="${cls || ''}" style="${cls ? '' : `background:rgba(var(${c.med >= 0 ? '--pos' : '--neg'}), ${Math.min(.55, Math.abs(c.med) / 12 * .55 + .04).toFixed(3)})`}" title="${Math.round(c.win)}% 的公司跑赢全体中位数"><b>${sgn(c.med)}</b><span>${cnt(c.n)} 家</span></td>`;
  $('tBt').innerHTML = `<thead><tr><th></th>${PT4.map(p => `<th>${p[2]}</th>`).join('')}<th>这一行全部</th></tr></thead><tbody>` + r.grid.map((g, i) => `<tr><th class="r">${QT3[i][2]}</th>${g.cells.map(c => td(c)).join('')}${td(g.tot, 'all')}</tr>`).join('') + `<tr><th class="r">这一列全部</th>${r.cols.map(c => td(c, 'all')).join('')}<td class="all"><b>${sgn(r.all)}</b><span>${cnt(r.n)} 家</span></td></tr></tbody>`;
}
function drawPe() {
  const list = NAT.map(N => { const h = N.peY.filter(v => v > 0); return { N, lo: d3.min(h), hi: d3.max(h), md: d3.median(h), now: N.peNow, ratio: N.peNow > 0 ? N.peNow / d3.median(h) : Infinity }; }).sort((a, b) => b.ratio - a.ratio);
  const above = list.filter(d => d.ratio > 1.1 && isFinite(d.ratio)), below = list.filter(d => d.ratio < 0.9);
  $('peSub').innerHTML = `市盈率 = 一国公司的市值合计 ÷ 利润合计。灰条是2010–2025年各年年末的最低到最高，竖线是中位数，金点是${ym(LAST)}（用${FY1}年的利润）。按“现在 ÷ 历史中位数”从贵到便宜排列：比自己的历史贵一成以上的有 ${above.length} 国，便宜一成以上的有 ${below.length} 国。横轴是对数刻度。`;
  const sm = narrow(), rh = 22, m = { l: sm ? 104 : 132, r: sm ? 64 : 150, t: 20, b: 6 }, hgt = m.t + list.length * rh + m.b, { svg, w } = svgIn($('pPe'), hgt, '区间图：各国今天的市盈率与历史范围');
  const x = d3.scaleLog([5, 300], [m.l, w - m.r]).clamp(true), mute = cssv('--mute'), fg = cssv('--fg'), gold = cssv('--gold'), ring = cssv('--panel');
  for (const v of sm ? [5, 20, 100] : [5, 10, 20, 50, 100, 300]) { svg.append('line').attr('class', 'grid').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t - 4).attr('y2', hgt - m.b); svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', 10).attr('text-anchor', 'middle').text(v + (v === 300 ? '倍以上' : '倍')); }
  list.forEach((d, i) => { const yy = m.t + i * rh + rh / 2, g = svg.append('g').attr('tabindex', 0);
    g.append('text').attr('class', 'lab').attr('x', m.l - 8).attr('y', yy + 4).attr('text-anchor', 'end').text(d.N.s.n.length > 6 ? d.N.s.n.slice(0, sm ? 4 : 6) : d.N.s.n);
    g.append('line').attr('x1', x(d.lo)).attr('x2', x(d.hi)).attr('y1', yy).attr('y2', yy).attr('stroke', mute).attr('stroke-width', 6).attr('stroke-linecap', 'round').attr('opacity', .6);
    g.append('line').attr('x1', x(d.md)).attr('x2', x(d.md)).attr('y1', yy - 7).attr('y2', yy + 7).attr('stroke', fg).attr('stroke-width', 2);
    if (d.now > 0) g.append('circle').attr('cx', x(d.now)).attr('cy', yy).attr('r', 5).attr('fill', gold).attr('stroke', ring).attr('stroke-width', 2);
    g.append('text').attr('class', 'lab dim').attr('x', w - m.r + 12).attr('y', yy + 4).text(d.now > 0 ? (sm ? pe1(d.now) + '倍' : `${pe1(d.now)}倍，中位 ${pe1(d.md)}倍`) : '合计亏损');
    g.append('rect').attr('x', 0).attr('y', yy - rh / 2).attr('width', w).attr('height', rh).attr('fill', 'transparent');
    const show = ev => { const b = svg.node().getBoundingClientRect(); tip(`<div class="t">${esc(d.N.s.n)}</div>` + rows(['现在的市盈率', pe1(d.now)], ['历史中位数', pe1(d.md)], ['最低 – 最高', `${pe1(d.lo)} – ${pe1(d.hi)}`], [`${FY1}年回报率`, pct1(d.N.roeY[K1])], d.N.near ? ['版图', '一年内刚创新高'] : null), ev.clientX || b.left + x(d.md), ev.clientY || b.top + yy); };
    g.on('pointermove', show).on('focus', show).on('pointerleave blur', untip); });
  const a = backtest(2020, 5), b = backtest(2015, 5);
  $('t4').innerHTML = `2020年底，过去五年净资产收益率在15%以上、市盈率又在40倍以上的公司有 ${a.grid[0].cells[2].n} 家，正是当时人人称道的“核心资产”。持有五年，年化回报的中位数是 <b>${sgn(a.grid[0].cells[2].med)}</b>，只有 ${Math.round(a.grid[0].cells[2].win)}% 跑赢了全体公司的中位数；同样是高回报率的公司，市盈率在20倍以下的 ${a.grid[0].cells[0].n} 家，中位数是 <b>${sgn(a.grid[0].cells[0].med)}</b>。2015年底的情形一样：贵的 ${sgn(b.grid[0].cells[2].med)}，便宜的 ${sgn(b.grid[0].cells[0].med)}。回报率高的公司谁都看得见，所以常常很贵；把图切到2018年底，那时什么都便宜，买哪一格差别都不大。`;
}

// ================================================================ 五 寻城
const SCOPES = [['all', '全部公司', null], ['hi', '研发强度5%以上的国', o => NAT[o.s].band === 'hi'], ...FRONTS.map(f => ['f:' + f.k, '前沿：' + f.n, (set => o => set.has(o.code))(new Set(f.codes))]), ...SECT.map(s => ['s:' + s.k, s.n, o => o.s === s.i])];
const TOG = [['noLoss', '没有亏损的年份'], ['grew', '利润比期初高'], ['cash', '现金流不少于利润的八成'], ['peHist', '市盈率不高于自己的历史中位'], ['gw', '商誉不到净资产的三成'], ['notPeak', '避开一年内版图刚创新高的国']];
let SORT = { k: 'cap', d: -1 }, SHOWALL = false, SEL = null;
const COLS = [['name', '公司', m => m.o.name, 'l'], ['nat', '国家', m => SECT[m.o.s].n, 'l'], ['cap', '市值', m => m.cap], ['roe', '平均回报率', m => m.roe], ['bars', '逐年', null, 'hide-s'], ['nig', '利润倍数', m => isFinite(m.nig) ? m.nig : -1], ['cash', '现金含量', m => isFinite(m.cash) ? m.cash : -9, 'hide-s'], ['pe', '市盈率', m => isFinite(m.pe) ? m.pe : 1e9], ['peMed', '历史中位', m => m.peMed, 'hide-s'], ['trM', '持股回报', m => m.trM]];
function miniBars(o, W) {
  const k0 = K1 - W + 1, bw = W === 10 ? 5 : 8, h = 22, r = o.roe.slice(k0), mx = Math.max(30, d3.max(r)), mn = Math.min(0, d3.min(r)), y = v => h - 1 - (Math.max(mn, Math.min(mx, v)) - mn) / (mx - mn) * (h - 2);
  return `<svg class="mini" width="${W * (bw + 1)}" height="${h}" aria-hidden="true">${r.map((v, i) => `<rect x="${i * (bw + 1)}" y="${Math.min(y(v), y(0))}" width="${bw}" height="${Math.max(1, Math.abs(y(v) - y(0)))}" fill="var(--c1)" opacity="${v >= 15 ? 1 : .45}"></rect>`).join('')}<line x1="0" x2="${W * (bw + 1)}" y1="${y(15)}" y2="${y(15)}" stroke="var(--gold)" stroke-width="1"></line></svg>`;
}
function runScreen() {
  const sc = SCOPES.find(s => s[0] === S.scope) || SCOPES[0], all = ELIG(S.W).filter(m => !sc[2] || sc[2](m.o)), pass = all.filter(m => passes(m, S));
  return { all, pass };
}
function drawScreen() {
  $('vRoe').textContent = S.roe + '%'; $('vLast').textContent = S.last + '%'; $('vPe').textContent = S.pe >= 100 ? '不限' : S.pe + '倍';
  document.querySelectorAll('#segW button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.w === S.W));
  document.querySelectorAll('#chips button').forEach(b => b.setAttribute('aria-pressed', !!S[b.dataset.k]));
  const { all, pass } = runScreen(), yrs = S.W === 10 ? '十' : '五';
  const nats = d3.rollups(pass, v => v.length, m => m.o.s).sort((a, b) => b[1] - a[1]);
  $('resSum').innerHTML = pass.length ? `有${yrs}年完整年报的 ${cnt(all.length)} 家里，通过的有 <b>${pass.length} 家</b>，市值合计 ${fmtYi(d3.sum(pass, m => m.cap))}元，占全图 ${fmtPct(d3.sum(pass, m => m.cap) / TOT[LAST] * 100)}；分布在 ${nats.length} 个国，最多的是${nats.slice(0, 3).map(([k, n]) => `${SECT[k].n}（${n}）`).join('、')}。` : `有${yrs}年完整年报的 ${cnt(all.length)} 家里，没有公司通过。把条件放宽一些试试。`;
  // 图：回报率 × 价格
  { const el = $('pMap'), small = narrow(), hgt = small ? 340 : 440, { svg, w } = svgIn(el, hgt, '散点图：公司的平均净资产收益率与市盈率');
    const m = { l: 50, r: 14, t: 30, b: 44 }, x = d3.scaleLinear([-10, 45], [m.l, w - m.r]).clamp(true), y = d3.scaleLog([4, 200], [hgt - m.b, m.t + 18]).clamp(true), topY = m.t + 2;
    for (const v of [5, 10, 20, 50, 100, 200]) { svg.append('line').attr('class', 'grid').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(v)).attr('y2', y(v)); svg.append('text').attr('class', 'tick').attr('x', m.l - 7).attr('y', y(v) + 4).attr('text-anchor', 'end').text(v + '倍'); }
    svg.append('text').attr('class', 'tick').attr('x', m.l - 7).attr('y', topY + 4).attr('text-anchor', 'end').text('亏损');
    for (const v of [-10, 0, 10, 20, 30, 40]) { svg.append('line').attr('class', v === 0 ? 'zero' : 'grid').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t - 6).attr('y2', hgt - m.b); svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', hgt - m.b + 16).attr('text-anchor', 'middle').text(v + '%'); }
    svg.append('text').attr('class', 'tick').attr('x', (m.l + w - m.r) / 2).attr('y', hgt - 6).attr('text-anchor', 'middle').text(small ? `${yrs}年平均净资产收益率；纵轴是市盈率` : `${yrs}年平均净资产收益率（越往右越好）；纵轴是市盈率，越往下越便宜`);
    const gold = cssv('--gold'); svg.append('line').attr('x1', x(S.roe)).attr('x2', x(S.roe)).attr('y1', m.t - 6).attr('y2', hgt - m.b).attr('stroke', gold).attr('stroke-width', 1.5);
    if (S.pe < 100) svg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(S.pe)).attr('y2', y(S.pe)).attr('stroke', gold).attr('stroke-width', 1.5);
    const ps = new Set(pass), pt = mm => ({ m: mm, px: x(mm.roe), py: isFinite(mm.pe) ? y(mm.pe) : topY, on: ps.has(mm) }), pts = all.map(pt), c1 = cssv('--c1'), mute = cssv('--mute'), ring = cssv('--panel');
    svg.append('g').selectAll('circle').data(pts.filter(d => !d.on)).join('circle').attr('cx', d => d.px).attr('cy', d => d.py).attr('r', 2.2).attr('fill', mute).attr('opacity', .55);
    const rr = d3.scaleSqrt([0, 20000], [3.5, 16]).clamp(true), on = pts.filter(d => d.on).sort((a, b) => b.m.cap - a.m.cap);
    svg.append('g').selectAll('circle').data(on).join('circle').attr('cx', d => d.px).attr('cy', d => d.py).attr('r', d => rr(d.m.cap)).attr('fill', c1).attr('fill-opacity', .85).attr('stroke', ring).attr('stroke-width', 1.5);
    if (SEL) { const d = pts.find(p => p.m.o === SEL); if (d) svg.append('circle').attr('cx', d.px).attr('cy', d.py).attr('r', 9).attr('fill', 'none').attr('stroke', gold).attr('stroke-width', 2.5); }
    placeLabels(svg, on.slice(0, small ? 6 : 14).map(d => ({ x: d.px, y: d.py, r: rr(d.m.cap), text: d.m.o.name })), { l: m.l, r: w - 2, t: m.t, b: hgt - m.b }, on.map(d => ({ x: d.px, y: d.py, r: rr(d.m.cap) })));
    const hov = on.length ? on.concat(pts.filter(d => !d.on)) : pts;
    nearest(svg, hov, d => d.px, d => d.py, { l: m.l, t: m.t - 6, r: w - m.r, b: hgt - m.b }, d => `<div class="t">${esc(d.m.o.name)} <span class="s">${SECT[d.m.o.s].n}</span></div>` + rows([`${yrs}年平均回报率`, pct1(d.m.roe)], ['市盈率', pe1(d.m.pe)], ['市值', fmtYi(d.m.cap) + '元'], [`${yrs}年持股回报`, mult(d.m.trM)]) + `<div class="s">${d.on ? '通过筛选' : '没有通过'}，点一下看它的小传</div>`, d => showDetail(d.m.o, true)); }
  // 表
  const col = COLS.find(c => c[0] === SORT.k), val = col[2], list = pass.slice().sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y, 'zh') : x - y) * SORT.d; }), shown = SHOWALL ? list : list.slice(0, 30);
  $('tRes').innerHTML = `<thead><tr>${COLS.map(c => `<th class="${c[3] || ''}"${c[0] === SORT.k ? ` aria-sort="${SORT.d < 0 ? 'descending' : 'ascending'}"` : ''}>${c[2] ? `<button data-k="${c[0]}">${c[1]}</button>` : c[1]}</th>`).join('')}</tr></thead><tbody>` + shown.map(m => `<tr class="pick${m.o === SEL ? ' sel' : ''}" data-j="${m.o.j}"><td><span class="co-n">${esc(m.o.name)}</span><span class="co-c hide-s">${m.o.code}</span></td><td class="l"><i class="sw" style="background:${secColor(m.o.s)}"></i>${esc(SECT[m.o.s].n)}${NEARPEAK.has(m.o.s) ? ' <span class="pill warn hide-s" title="这个国的版图在最近一年里刚创下历史最高">峰</span>' : ''}</td><td>${fmtYi(m.cap)}</td><td>${pct1(m.roe)}</td><td class="hide-s">${miniBars(m.o, S.W)}</td><td>${isFinite(m.nig) ? m.nig.toFixed(1) + '倍' : '—'}</td><td class="hide-s">${m.fin ? '金融' : isFinite(m.cash) ? m.cash.toFixed(2) : '—'}</td><td>${pe1(m.pe)}</td><td class="hide-s">${pe1(m.peMed)}</td><td>${mult(m.trM)}</td></tr>`).join('') + '</tbody>';
  $('tRes').querySelectorAll('th button').forEach(b => b.onclick = () => { SORT = { k: b.dataset.k, d: SORT.k === b.dataset.k ? -SORT.d : (b.dataset.k === 'name' || b.dataset.k === 'nat' || b.dataset.k === 'pe' ? 1 : -1) }; drawScreen(); });
  $('tRes').querySelectorAll('tr.pick').forEach(tr => tr.onclick = () => showDetail(CO[+tr.dataset.j], false));
  const more = $('moreRes'); more.hidden = list.length <= 30; more.textContent = SHOWALL ? '只显示前30家' : `显示全部 ${list.length} 家`;
  const first = d3.rollups(runDefault(), v => v.length, m => m.o.s).sort((a, b) => b[1] - a[1]);
  $('t5').innerHTML = `默认的条件是：十年平均净资产收益率不低于15%，没有一年亏损，最近一年不低于12%，利润比十年前高，经营现金流不少于利润的八成，市盈率不高于它自己十年来的中位数。今天通过的有 <b>${runDefault().length} 家</b>，分布在 ${first.length} 个国，最多的是${first.slice(0, 3).map(([k, n]) => `${SECT[k].n}（${n} 家）`).join('、')}。上市不满十年的公司不在里面，可以切到“五年”去看。`;
}
let _def = null; const runDefault = () => _def || (_def = ELIG(10).filter(m => passes(m, DEF)));
function initScreen() {
  $('selScope').innerHTML = SCOPES.map(s => `<option value="${s[0]}">${esc(s[1])}</option>`).join('');
  $('selScope').onchange = e => { S.scope = e.target.value; SHOWALL = false; drawScreen(); };
  $('chips').innerHTML = TOG.map(([k, n]) => `<button class="chip" data-k="${k}">${n}</button>`).join('');
  document.querySelectorAll('#chips button').forEach(b => b.onclick = () => { S[b.dataset.k] = !S[b.dataset.k]; drawScreen(); });
  document.querySelectorAll('#segW button').forEach(b => b.onclick = () => { S.W = +b.dataset.w; drawScreen(); });
  [['fRoe', 'roe'], ['fLast', 'last'], ['fPe', 'pe']].forEach(([id, k]) => { $(id).value = S[k]; $(id).oninput = e => { S[k] = +e.target.value; drawScreen(); }; });
  $('moreRes').onclick = () => { SHOWALL = !SHOWALL; drawScreen(); };
  // 直接查一家公司
  const q = $('q'), box = $('suggest'); let items = [], on = -1;
  const KEYS = CO.map(o => ({ o, k: [o.name, ...o.ren.map(r => r[1]), o.code].join(' ').toLowerCase() }));
  q.addEventListener('input', () => { const s = q.value.trim().toLowerCase(); if (!s) { box.hidden = true; return; }
    items = KEYS.filter(x => x.k.includes(s)).map(x => x.o).sort((a, b) => ((b.b === LAST) - (a.b === LAST)) || (cap(b, b.b) - cap(a, a.b))).slice(0, 8); on = -1;
    box.innerHTML = items.length ? items.map((o, i) => `<button data-i="${i}">${esc(o.name)}<span>${o.code} · ${SECT[o.s].n}${o.b < LAST ? ' · 已退市' : ''}</span></button>`).join('') : '<div style="padding:8px 12px;color:var(--fg-3);font-size:13px">没有找到</div>';
    box.hidden = false; box.querySelectorAll('button').forEach(b => b.onclick = () => { box.hidden = true; q.value = ''; showDetail(items[+b.dataset.i], true); }); });
  q.addEventListener('keydown', e => { if (box.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); on = (on + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; box.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === on)); }
    if (e.key === 'Enter') { e.preventDefault(); box.hidden = true; q.value = ''; showDetail(items[Math.max(0, on)], true); }
    if (e.key === 'Escape') box.hidden = true; });
  document.addEventListener('click', e => { if (!q.parentNode.contains(e.target)) box.hidden = true; });
}
// 一家公司的财报小传
function showDetail(o, scroll, quiet) {
  SEL = o; const P = $('detail'); P.hidden = false;
  const m10 = metric(o, 10), m5 = metric(o, 5), m = m10 || m5, N = NAT[o.s], alive = o.b === LAST, yrs = m ? (m.W === 10 ? '十' : '五') : '';
  const ks = d3.range(NY).filter(k => isFinite(o.ni[k]) || isFinite(o.roe[k])), pe = alive && o.ni[K1] > 0 ? cap(o, LAST) / o.ni[K1] : NaN;
  const rank = alive ? LIVE.filter(x => cap(x, LAST) > cap(o, LAST)).length + 1 : null;
  let lead;
  if (!ks.length) lead = '数据集里没有取到这家公司的年报。';
  else if (!alive) lead = `这家公司已经退市或被合并，最后在图上是${ym(o.b)}。下面是它留下的年报。`;
  else if (m) lead = `${m.W === 10 ? '2016' : '2021'}–${FY1}年，它的净资产收益率平均 <b>${pct1(m.roe)}</b>，其中 ${m.n15} 年在15%以上${m.loss ? `，${m.loss} 年亏损` : ''}；${isFinite(m.nig) ? `利润是${m.W === 10 ? '十' : '五'}年前的 <b>${mult(m.nig)}</b>` : `${m.W === 10 ? '十' : '五'}年前或最近一年没有盈利`}；从${FY1 - m.W}年底持有到今天，含分红的回报是 <b>${mult(m.trM)}</b>，同期市值变成了 ${mult(m.capM)}。`;
  else lead = `它${ym(o.a)}才出现在图上，上市还不满五年，或者年报不全，所以不参加筛选。下面的年报里，浅色的年份来自上市前的招股书。`;
  const tiles = [[alive ? fmtYi(cap(o, LAST)) : '—', alive ? `${ym(LAST)}市值，全图第 ${rank} 位` : '已不在图上'], [m ? pct1(m.roe) : pct1(o.roe[K1]), m ? `${yrs}年平均净资产收益率` : `${FY1}年净资产收益率`],
    [isFinite(o.ni[K1]) ? (o.ni[K1] < 0 ? '−' : '') + fmtYi(Math.abs(o.ni[K1])) : '—', `${FY1}年归母净利润`], [isFinite(pe) ? pe1(pe) + '倍' : alive && o.ni[K1] <= 0 ? '亏损' : '—', m && isFinite(m.peMed) ? `市盈率，它自己历年的中位数是 ${pe1(m.peMed)}倍` : '市盈率'], [m ? mult(m.trM) : '—', m ? `${FY1 - m.W}年底持有至今的回报（含分红）` : '持股回报']];
  // 体检
  const ck = [];
  if (m) {
    if (m.roe >= 15 && m.loss === 0) ck.push(['g', `${yrs}年平均净资产收益率 <b>${pct1(m.roe)}</b>，没有一年亏损。`]);
    if (m.last < m.roe * 0.6 && m.roe >= 10) ck.push(['w', `最近一年的净资产收益率（${pct1(m.last)}）明显低于${yrs}年平均（${pct1(m.roe)}）：高回报可能正在褪色。`]);
    if (!m.fin && isFinite(m.cash) && (m.loss === 0 || m.cash < 0.8)) ck.push([m.cash >= 0.8 ? 'g' : 'w', `${yrs}年经营现金流合计是利润的 <b>${m.cash.toFixed(2)} 倍</b>${m.cash >= 0.8 ? '，利润收得回现金。' : '：利润里有不少没有变成现金。'}`]);
    if (m.capM / m.trM > 1.5) ck.push(['w', `${yrs}年里市值变成了 ${mult(m.capM)}，持股回报只有 ${mult(m.trM)}：差出来的部分主要是增发或重组带来的新股本。`]);
    if (isFinite(m.pePct)) ck.push([m.pePct >= 80 ? 'w' : m.pePct <= 40 ? 'g' : '', `今天的市盈率（${pe1(m.pe)}倍）${m.pePct <= 0 ? '比它自己历史上<b>所有的年末都低</b>' : m.pePct >= 100 ? '比它自己历史上<b>所有的年末都高</b>' : `比它自己历史上 <b>${Math.round(m.pePct)}%</b> 的年末要高`}（上市以来 ${m.peN} 个盈利的年末）。`]);
    else if (!isFinite(m.pe)) ck.push(['w', `${FY1}年亏损，算不出市盈率。`]);
  }
  if (o.gw >= 30) ck.push(['w', `商誉相当于归母净资产的 <b>${Math.round(o.gw)}%</b>，并购来的资产一旦减值，会一次吃掉很多利润。`]);
  if (SECT[o.s].f !== 'fin' && o.lev[K1] >= 70) ck.push(['w', `资产负债率 <b>${Math.round(o.lev[K1])}%</b>，杠杆不低；回报率里有借来的成分。`]);
  if (isFinite(o.rd)) ck.push(['', `${FY1}年研发费用占营业收入的 ${o.rd >= 49.9 ? '50%以上' : o.rd.toFixed(1) + '%'}；所在的国中位数是 ${isFinite(N.rd) ? N.rd.toFixed(1) + '%' : '—'}。`]);
  if (alive) ck.push([N.near ? 'w' : '', `所在的“${N.s.n}”国，十年合计净资产收益率 ${pct1(N.roe10)}，今天占全图 ${fmtPct(N.share)}${N.near ? `，<b>版图在${ymS(N.pk)}刚创下历史最高</b>（${fmtPct(N.pkv)}）：历史上版图到顶之后，份额多半回落。` : `，是最高时（${ymS(N.pk)}）的 ${Math.round(N.share / N.pkv * 100)}%。`}`]);
  P.innerHTML = `<h3>${esc(o.name)}<small>${o.code} · <i class="sw" style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${secColor(o.s)};margin-right:4px"></i>${esc(N.s.n)}${alive && m && passes(m, S) ? ' · 通过当前筛选' : ''}</small><small><a href="index.html#co=${o.code}">在地图上看这座城</a></small></h3>
    <p class="lead">${lead}</p><div class="tiles num">${tiles.map(([v, k]) => `<div class="tile"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('')}</div>
    ${ks.length ? `<div class="trio"><div><h5>净资产收益率</h5><p class="sub">每年一根，金线是15%</p><div class="plot" id="dRoe"></div></div><div><h5>利润和经营现金流</h5><p class="sub">柱是归母净利润，点是经营现金流，亿元</p><div class="plot" id="dNi"></div></div><div><h5>年末市盈率</h5><p class="sub">金点是现在，横线是中位数，150倍封顶</p><div class="plot" id="dPe"></div></div></div>` : ''}
    <ul class="check">${ck.map(([c, t]) => `<li class="${c}">${t}</li>`).join('')}</ul>`;
  if (ks.length) drawDetailCharts(o, ks, m);
  if (!quiet) drawScreen();
  if (scroll) P.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', '#co=' + o.code);
}
function drawDetailCharts(o, ks, m) {
  const k0 = ks[0], k1 = ks[ks.length - 1], years = d3.range(k0, k1 + 1), hgt = 170, mg = { l: 36, r: 6, t: 10, b: 20 };
  const c1 = cssv('--c1'), c3 = cssv('--c3'), gold = cssv('--gold'), ring = cssv('--panel'), fg = cssv('--fg');
  const frame = (id, label) => { const { svg, w } = svgIn($(id), hgt, label), x = d3.scaleBand(years, [mg.l, w - mg.r]).paddingInner(0.25);
    [k0, k1].forEach((k, i) => svg.append('text').attr('class', 'tick').attr('x', i ? w - mg.r : mg.l).attr('y', hgt - 4).attr('text-anchor', i ? 'end' : 'start').text(FY0 + k)); return { svg, w, x }; };
  const yAxis = (svg, w, y, tk, f) => { for (const v of tk) { svg.append('line').attr('class', v === 0 ? 'zero' : 'grid').attr('x1', mg.l).attr('x2', w - mg.r).attr('y1', y(v)).attr('y2', y(v)); svg.append('text').attr('class', 'tick').attr('x', mg.l - 5).attr('y', y(v) + 4).attr('text-anchor', 'end').text(f(v)); } };
  const hover = (svg, x, w, show) => years.forEach(k => svg.append('rect').attr('x', x(k) - 1).attr('y', mg.t).attr('width', x.bandwidth() + 2).attr('height', hgt - mg.t - mg.b).attr('fill', 'transparent').attr('tabindex', 0)
    .on('pointermove focus', ev => { const r = svg.node().getBoundingClientRect(); tip(show(k), ev.clientX || r.left + x(k), ev.clientY || r.top + mg.t); }).on('pointerleave blur', untip));
  const pre = k => FY0 + k < o.ly;
  { const { svg, w, x } = frame('dRoe', '柱状图：历年净资产收益率'), v = years.map(k => o.roe[k]).filter(isFinite), lo = Math.max(-40, Math.min(0, d3.min(v) || 0)), hi = Math.min(80, Math.max(20, d3.max(v) || 20)), y = d3.scaleLinear([lo, hi], [hgt - mg.b, mg.t]).clamp(true);
    yAxis(svg, w, y, y.ticks(4), t => t + '%');
    years.forEach(k => { if (isFinite(o.roe[k])) svg.append('path').attr('d', colPath(x(k), y(0), x.bandwidth(), y(0) - y(o.roe[k]))).attr('fill', c1).attr('opacity', pre(k) ? .35 : 1); });
    svg.append('line').attr('x1', mg.l).attr('x2', w - mg.r).attr('y1', y(15)).attr('y2', y(15)).attr('stroke', gold).attr('stroke-width', 1.5);
    hover(svg, x, w, k => `<div class="t">${FY0 + k}年${pre(k) ? '（上市前）' : ''}</div>` + rows(['净资产收益率', pct1(o.roe[k])], ['资产负债率', isFinite(o.lev[k]) ? Math.round(o.lev[k]) + '%' : '—'])); }
  { const { svg, w, x } = frame('dNi', '柱状图：历年归母净利润与经营现金流'), v = years.flatMap(k => [o.ni[k], o.ocf[k]]).filter(isFinite), y = d3.scaleLinear([Math.min(0, d3.min(v)), Math.max(0.01, d3.max(v))], [hgt - mg.b, mg.t]).nice(4);
    yAxis(svg, w, y, y.ticks(4), t => Math.abs(t) >= 10000 ? t / 10000 + '万' : t);
    years.forEach(k => { if (isFinite(o.ni[k])) svg.append('path').attr('d', colPath(x(k), y(0), x.bandwidth(), y(0) - y(o.ni[k]))).attr('fill', c1).attr('opacity', pre(k) ? .35 : 1); });
    years.forEach(k => { if (isFinite(o.ocf[k])) svg.append('circle').attr('cx', x(k) + x.bandwidth() / 2).attr('cy', y(o.ocf[k])).attr('r', 3.6).attr('fill', c3).attr('stroke', ring).attr('stroke-width', 1.5); });
    hover(svg, x, w, k => `<div class="t">${FY0 + k}年${pre(k) ? '（上市前）' : ''}</div>` + rows(['归母净利润', isFinite(o.ni[k]) ? (o.ni[k] < 0 ? '−' : '') + fmtYi(Math.abs(o.ni[k])) + '元' : '—', c1], ['经营现金流', isFinite(o.ocf[k]) ? (o.ocf[k] < 0 ? '−' : '') + fmtYi(Math.abs(o.ocf[k])) + '元' : '—', c3], ['营业收入', isFinite(o.rev[k]) ? fmtYi(o.rev[k]) + '元' : '—'])); }
  { const { svg, w, x } = frame('dPe', '折线图：历年年末市盈率'), pes = years.map(k => { const c = cap(o, dec(FY0 + k)); return o.ni[k] > 0 && c > 0 ? c / o.ni[k] : NaN; }), now = o.b === LAST && o.ni[K1] > 0 ? cap(o, LAST) / o.ni[K1] : NaN;
    const v = pes.filter(isFinite).concat(isFinite(now) ? [now] : []), hi = Math.min(150, Math.max(20, (d3.max(v) || 20) * 1.1)), y = d3.scaleLinear([0, hi], [hgt - mg.b, mg.t]).clamp(true);
    yAxis(svg, w, y, y.ticks(4), t => t);
    if (!v.length) svg.append('text').attr('class', 'tick').attr('x', (mg.l + w) / 2).attr('y', hgt / 2).attr('text-anchor', 'middle').text('上市以来没有盈利的年末');
    const md = d3.median(pes.filter(isFinite)); if (isFinite(md)) svg.append('line').attr('x1', mg.l).attr('x2', w - mg.r).attr('y1', y(md)).attr('y2', y(md)).attr('stroke', fg).attr('stroke-width', 1.5);
    const cx = k => x(k) + x.bandwidth() / 2;
    svg.append('path').attr('d', d3.line().defined((d, i) => isFinite(pes[i])).x(k => cx(k)).y((k, i) => y(pes[i]))(years)).attr('fill', 'none').attr('stroke', c1).attr('stroke-width', 2).attr('stroke-linejoin', 'round');
    years.forEach((k, i) => { if (isFinite(pes[i])) svg.append('circle').attr('cx', cx(k)).attr('cy', y(pes[i])).attr('r', 3).attr('fill', c1).attr('stroke', ring).attr('stroke-width', 1.5); });
    if (isFinite(now)) { svg.append('circle').attr('cx', w - mg.r - 4).attr('cy', y(now)).attr('r', 5).attr('fill', gold).attr('stroke', ring).attr('stroke-width', 2); svg.append('text').attr('class', 'lab hp').attr('x', w - mg.r - 12).attr('y', y(now) + (y(now) < 30 ? 16 : -9)).attr('text-anchor', 'end').text(`现在 ${pe1(now)}`); }
    hover(svg, x, w, k => `<div class="t">${FY0 + k}年末</div>` + rows(['市盈率', isFinite(pes[k - k0]) ? pe1(pes[k - k0]) : cap(o, dec(FY0 + k)) > 0 ? '亏损' : '未上市'], ['市值', cap(o, dec(FY0 + k)) > 0 ? fmtYi(cap(o, dec(FY0 + k))) + '元' : '—'])); }
}

// ================================================================ 六 分配
function drawAtt() {
  const el10 = ELIG(10), good = el10.filter(m => m.roe >= 15), list = NAT.map(N => ({ N, a: N.n / LIVE.length * 100, b: N.share, c: N.good / good.length * 100 })).sort((p, q) => (q.c - q.a) - (p.c - p.a));
  $('attSub').innerHTML = `每一行是一个国，三个点是它在三种分法里各占多少：按公司家数（每家公司看一样久），按市值（指数的分法），按“十年平均净资产收益率不低于15%的 ${good.length} 家公司”出自哪里。绿点在圆圈右边越远，平均分配错过的越多。`;
  const sm = narrow(), rh = 22, m = { l: sm ? 104 : 132, r: 14, t: 20, b: 6 }, hgt = m.t + list.length * rh + m.b, { svg, w } = svgIn($('pAtt'), hgt, '点图：各国在公司家数、市值、好公司三种口径下的占比');
  const x = d3.scaleLinear([0, Math.max(16, d3.max(list, d => Math.max(d.a, d.b, d.c)) * 1.05)], [m.l, w - m.r]), c1 = cssv('--c1'), c3 = cssv('--c3'), fg2 = cssv('--fg-2'), ring = cssv('--panel'), line = cssv('--line-2');
  for (const v of x.ticks(5)) { svg.append('line').attr('class', v === 0 ? 'zero' : 'grid').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t - 4).attr('y2', hgt - m.b); svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', 10).attr('text-anchor', 'middle').text(v + '%'); }
  list.forEach((d, i) => { const yy = m.t + i * rh + rh / 2, g = svg.append('g').attr('tabindex', 0);
    g.append('text').attr('class', 'lab').attr('x', m.l - 8).attr('y', yy + 4).attr('text-anchor', 'end').text(d.N.s.n.length > 6 ? d.N.s.n.slice(0, sm ? 4 : 6) : d.N.s.n);
    g.append('line').attr('x1', x(Math.min(d.a, d.b, d.c))).attr('x2', x(Math.max(d.a, d.b, d.c))).attr('y1', yy).attr('y2', yy).attr('stroke', line).attr('stroke-width', 2);
    g.append('circle').attr('cx', x(d.a)).attr('cy', yy).attr('r', 4.5).attr('fill', ring).attr('stroke', fg2).attr('stroke-width', 1.5);
    g.append('circle').attr('cx', x(d.b)).attr('cy', yy).attr('r', 4.5).attr('fill', c3).attr('stroke', ring).attr('stroke-width', 1.5);
    g.append('circle').attr('cx', x(d.c)).attr('cy', yy).attr('r', 5.5).attr('fill', c1).attr('stroke', ring).attr('stroke-width', 1.5);
    g.append('rect').attr('x', 0).attr('y', yy - rh / 2).attr('width', w).attr('height', rh).attr('fill', 'transparent');
    const show = ev => { const b = svg.node().getBoundingClientRect(); tip(`<div class="t">${esc(d.N.s.n)}</div>` + rows(['公司家数占比', `${fmtPct(d.a)}（${d.N.n} 家）`], ['市值占比', fmtPct(d.b), c3], ['十年一直赚钱的公司占比', `${fmtPct(d.c)}（${d.N.good} 家）`, c1]), ev.clientX || b.left + x(d.c), ev.clientY || b.top + yy); };
    g.on('pointermove', show).on('focus', show).on('pointerleave blur', untip); });
  const low = el10.filter(m => m.roe < 5).length, top3 = list.slice(0, 3), last3 = list.slice(-3).reverse(), rt = d3.greatest(list.filter(d => d.N.good >= 5), d => d.c / d.a);
  $('t6').innerHTML = `上市满十年的 ${cnt(el10.length)} 家公司里，十年平均净资产收益率不低于15%的只有 <b>${good.length} 家</b>，不到一成；不到5%的有 ${cnt(low)} 家，占 <b>${Math.round(low / el10.length * 100)}%</b>。把注意力平均分给每一家公司，一半花在了十年没给股东赚到什么钱的公司上。好公司比家数多出最多的是${top3.map(d => d.N.s.n).join('、')}；最悬殊的是${rt.N.s.n}：只有 ${rt.N.n} 家公司，占家数的 ${fmtPct(rt.a)}，却出了 ${fmtPct(rt.c)} 的好公司。反过来，${last3.map(d => d.N.s.n).join('、')}的公司最多，好公司的比例最低。`;
}
function drawTiers() {
  const grp = ks => { const ns = ks.map(k => NAT[SK[k]]); let n = 0, c = 0; for (const N of ns) for (const o of LIVE) if (o.s === N.s.i && isFinite(o.ni[K1])) { n += o.ni[K1]; c += cap(o, LAST); }
    return { names: ns.map(N => N.s.n).join('、'), share: d3.sum(ns, N => N.share), pe: c / n, roe: d3.sum(ns, N => d3.sum(N.ni.slice(K1 - 9))) / d3.sum(ns, N => d3.sum(N.eq.slice(K1 - 9))) * 100, near: ns.filter(N => N.near).map(N => N.s.n) }; };
  const A = grp(['baijiu', 'appl', 'insur', 'bank', 'util', 'coal']), B = grp(['ai', 'semi', 'elec', 'pharma', 'power', 'mach']);
  const rest = ELIG(10).filter(m => m.roe < 5).length / ELIG(10).length * 100;
  $('tiers').innerHTML = `<div class="tier"><h4>熟地</h4><div class="w num">${esc(A.names)} · 占全图 ${fmtPct(A.share)}</div>
      <p>生意不怎么变，回报率高或者稳，十年合计 <b>${pct1(A.roe)}</b>，今天的市盈率 <b>${pe1(A.pe)}倍</b>。这里不需要预测未来，只需要回答两个问题：回报率还守不守得住，价格够不够便宜。<b>注意力放在价格和分红上</b>，不必天天看。</p></div>
    <div class="tier"><h4>新陆</h4><div class="w num">${esc(B.names)} · 占全图 ${fmtPct(B.share)}</div>
      <p>学科正在变成产品，版图在扩张，十年合计回报率只有 <b>${pct1(B.roe)}</b>，今天的市盈率 <b>${pe1(B.pe)}倍</b>${B.near.length ? `，其中${B.near.join('、')}的版图在最近一年里刚创下历史最高` : ''}。这里的钱是少数公司赚走的。<b>注意力放在“谁的利润跟上了版图”</b>，并且记住版图最大的时候往往也最贵。大部分精力应该花在这里，但出手要少。</p></div>
    <div class="tier"><h4>远方</h4><div class="w">量子、聚变、脑机接口、合成生物学 · 还不在图上</div>
      <p>还没有利润可看。<b>注意力放在科学本身</b>：读论文，看装置，等它出现第一批肯自己掏钱的客户。对选专业的人，这里的优先级最高；对一笔钱，现在的优先级最低。</p></div>
    <div class="tier"><h4>其余</h4><div class="w num">有十年记录的公司里，${Math.round(rest)}% 的十年回报率不到5%</div>
      <p>不在前三类里、也过不了“寻城”筛子的公司，<b>可以不看</b>。这不是说它们里面没有机会，而是在这里找到机会的把握太小，注意力有更好的去处。</p></div>`;
}
function drawGates() {
  const since = mi('2010-01'), s10 = SEA.slice(since), rank = s10.filter(v => v < SEA[LAST]).length / s10.length * 100;
  const near = NAT.filter(N => N.near).sort((a, b) => b.share - a.share), keep = SECT.map(s => { const ser = share[s.i], pk = PEAKS[s.i]; return ser[pk] >= 3 && pk + 24 <= LAST ? ser[pk + 24] / ser[pk] * 100 : null; }).filter(v => v !== null);
  const top10 = LIVE.slice().sort((a, b) => cap(b, LAST) - cap(a, LAST)).slice(0, 10), f = FADE.rows[0];
  $('gates').innerHTML = `<li><b class="h">水位</b><span>全图市值是GDP的 <b>${Math.round(SEA[LAST])}%</b>，比2010年以来 ${Math.round(rank)}% 的月份都高。水位高的时候，好公司也贵，后面几年整体更难赚钱。 <a href="guanchao.html#shuiwei">看水位</a></span></li>
    <li><b class="h">峰值</b><span>${near.length ? `<b>${near.map(N => N.s.n).join('、')}</b>的版图，在最近一年里刚创下各自的历史最高。` : '最近一年没有哪个国的版图创下历史最高。'}历史上 ${keep.length} 个国到顶两年后，份额平均只剩 ${Math.round(d3.mean(keep))}%。看好一个行业，和在它最大的时候买进，是两件事。 <a href="guanchao.html#fengzhi">看峰值</a></span></li>
    <li><b class="h">巨头</b><span>今天市值最大的十家公司（${top10.slice(0, 3).map(o => o.name).join('、')}等）合计占全图 <b>${fmtPct(d3.sum(top10, o => cap(o, LAST)) / TOT[LAST] * 100)}</b>。历史上多数月份的前十，后来都走得比整张图慢。 <a href="guanchao.html#jutou">看巨头</a></span></li>
    <li><b class="h">褪色</b><span>过去五年回报率超过20%的公司，此后十年还能保持15%以上的只有 <b>${Math.round(f.seg[0] / f.n * 100)}%</b>。筛子筛的是过去，买的是以后：每一家都要问，它凭什么还能再好十年。 <a href="#chengji">看城基</a></span></li>`;
}

// ================================================================ 启动
function readTheme() { const a = document.documentElement.getAttribute('data-theme'); DARK = a ? a === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
function drawAll() { readTheme(); drawSieve(); drawBand(); drawFronts(); drawLead(); drawMajor(); drawSoil(); drawHit(); drawFate(); drawFade(); drawTop(); drawBt(); drawPe(); drawScreen(); if (SEL) showDetail(SEL, false, true); drawAtt(); drawTiers(); drawGates(); }
$('hN').textContent = cnt(LIVE.length);
$('segFate').innerHTML = [2012, 2015, 2018, 2020].map(y => `<button data-y="${y}">${y}年底</button>`).join('');
document.querySelectorAll('#segFate button').forEach(b => b.onclick = () => { FY_START = +b.dataset.y; drawFate(); });
$('btYears').innerHTML = [2015, 2016, 2017, 2018, 2019, 2020, 2021].map(y => `<button class="chip" data-y="${y}">${y}年底</button>`).join('');
document.querySelectorAll('#btYears button').forEach(b => b.onclick = () => { BT_Y = +b.dataset.y; drawBt(); });
document.querySelectorAll('#segHold button').forEach(b => b.onclick = () => { BT_H = +b.dataset.h; drawBt(); });
initScreen(); drawAll();
let rsT = 0, lastW = innerWidth;
addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rsT); rsT = setTimeout(drawAll, 160); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawAll);
new MutationObserver(drawAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
// 链接：#co=代码 直接打开一家公司
function fromHash() { const h = location.hash.slice(1); if (h.startsWith('co=')) { const o = byCode.get(h.slice(3)); if (o) showDetail(o, true); } }
fromHash(); addEventListener('hashchange', fromHash);
// 顶栏：标出当前章节
const navA = [...document.querySelectorAll('#bar nav a')], secs = navA.map(a => document.querySelector(a.getAttribute('href')));
const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) navA.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }, { rootMargin: '-45% 0px -50% 0px' });
secs.forEach(s => io.observe(s));
addEventListener('scroll', untip, { passive: true });
