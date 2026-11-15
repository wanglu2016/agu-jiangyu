/* “财报侦探”页面脚本。数据：data.js（市值）、quality.js（年报摘要与复权价）、hk.js（A+H 对照，可缺）。 */
"use strict";
// ================================================================ 数据
const DATA = window.AGU_DATA, QD = window.AGU_Q, HK = window.AGU_HK || null;
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
// A+H 对照（港股通页的快照）
const AH = new Map();
if (HK) for (const r of HK.ah) AH.set(r[0], { h: r[1], hp: r[2], ap: r[3], p: (r[3] / (r[2] * HK.fx) - 1) * 100 });

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

// ================================================================ 疑点与此后的命运
// 观察五年（y0–y1），看此后：y1+1 到 FY1 有没有亏损年份、净资产收益率、从 y1 年底到最后一个月的年化回报
const WINS = [{ y0: 2011, y1: 2015 }, { y0: 2016, y1: 2020 }];
const WLAB = WINS.map(w => `${w.y0}–${w.y1}年`);
const JUD = WINS.map(w => CO.map(o => judge(o, w.y0, w.y1)).filter(Boolean));
const GONE = WINS.map(w => CO.filter(o => !isFin(o) && o.a <= dec(w.y0 - 1) && o.b >= dec(w.y1) && o.b < LAST).length);
function judge(o, y0, y1) {
  if (isFin(o) || o.b !== LAST || o.a > dec(y0 - 1)) return null;
  let sNi = 0, sOc = 0, allPos = true;
  for (let y = y0; y <= y1; y++) { const n = o.ni[yi(y)], c = o.ocf[yi(y)]; if (!isFinite(n) || !isFinite(c)) return null; sNi += n; sOc += c; if (n <= 0) allPos = false; }
  const e0 = o.eq[yi(y0)], e1 = o.eq[yi(y1) + 1]; if (!(e0 > 0) || !isFinite(e1)) return null;
  const r0 = o.tr[y1 - 2000], r1 = o.tr[NT - 1]; if (!(r0 > 0 && r1 > 0)) return null;
  const yrs = (LAST - dec(y1)) / 12, ret = (Math.pow(r1 / r0, 1 / yrs) - 1) * 100;
  let later = false; const after = [], before = [];
  for (let y = y1 + 1; y <= FY1; y++) { const n = o.ni[yi(y)]; if (n < 0) later = true; after.push(o.roe[yi(y)]); }
  for (let y = y0; y <= y1; y++) before.push(o.roe[yi(y)]);
  const cc = sNi > 0 ? sOc / sNi : NaN, ext = (e1 - e0 - sNi) / e0, lev = o.lev[yi(y1)], estate = SECT[o.s].k === 'estate';
  const f = { cash: allPos && cc < 0.5, loss: !allPos, ext: ext > 1, lev: !estate && lev >= 70 };
  return { o, allPos, cc, ext, lev, estate, ret, later, roeA: mean(before), roeB: mean(after), f, nf: f.cash + f.loss + f.ext + f.lev };
}
function group(list, label) {
  return { label, n: list.length, later: list.length ? list.filter(d => d.later).length / list.length * 100 : NaN,
    ret: med(list.map(d => d.ret)), roeA: med(list.map(d => d.roeA)), roeB: med(list.map(d => d.roeB)) };
}
// 一组公司的命运：横条是此后亏损的比例，右边是回报率前后对比
function drawOutcome(el, G, label) {
  const nar = narrow(), rowH = nar ? 52 : 46, top = 24, h = top + G.length * rowH + 4;
  const { svg, w } = svgIn(el, h, label);
  const lw = nar ? 112 : 172, rw = nar ? 0 : 210, bx0 = lw, bx1 = w - rw - (nar ? 36 : 48);
  const x = d3.scaleLinear([0, 100], [bx0, bx1]);
  svg.append('text').attr('class', 'tick').attr('x', bx0).attr('y', 11).text('此后出现亏损年份的比例');
  for (const v of [0, 25, 50, 75, 100]) svg.append('line').attr('class', v ? 'grid' : 'zero').attr('x1', x(v)).attr('x2', x(v)).attr('y1', top - 4).attr('y2', h - 2);
  const rx = d3.scaleLinear([-5, 25], [w - rw + 16, w - 10]).clamp(true);
  if (!nar) {
    for (const v of [0, 10, 20]) { svg.append('line').attr('class', v ? 'grid' : 'zero').attr('x1', rx(v)).attr('x2', rx(v)).attr('y1', top - 4).attr('y2', h - 2);
      svg.append('text').attr('class', 'tick').attr('x', rx(v)).attr('y', 11).attr('text-anchor', 'middle').text(v + '%'); }
  }
  const red = cssv('--c2'), fg = cssv('--fg'), pan = cssv('--panel');
  G.forEach((g, i) => {
    const y = top + i * rowH;
    svg.append('text').attr('class', 'lab b').attr('x', 0).attr('y', y + 15).text(g.label);
    svg.append('text').attr('class', 'lab dim').attr('x', 0).attr('y', y + 32).text(g.n ? `${cnt(g.n)}家 · 年化${sgn(g.ret)}` : '没有公司');
    if (!g.n) return;
    svg.append('path').attr('d', barPath(x(0), y + 4, Math.max(2, x(g.later) - x(0)), 16)).attr('fill', red).attr('opacity', .82);
    svg.append('text').attr('class', 'lab b').attr('x', x(g.later) + 6).attr('y', y + 17).text(Math.round(g.later) + '%');
    if (nar) svg.append('text').attr('class', 'lab dim').attr('x', x(0)).attr('y', y + 38).text(`回报率 ${pct1(g.roeA)} → ${pct1(g.roeB)}`);
    else {
      const cy = y + 12;
      svg.append('line').attr('x1', rx(g.roeA)).attr('x2', rx(g.roeB)).attr('y1', cy).attr('y2', cy).attr('stroke', fg).attr('stroke-width', 1.5).attr('opacity', .6);
      svg.append('circle').attr('cx', rx(g.roeA)).attr('cy', cy).attr('r', 4).attr('fill', pan).attr('stroke', fg).attr('stroke-width', 1.5);
      svg.append('circle').attr('cx', rx(g.roeB)).attr('cy', cy).attr('r', 4.2).attr('fill', fg);
      svg.append('text').attr('class', 'lab dim').attr('x', w - rw + 16).attr('y', y + 32).text(`${pct1(g.roeA)} → ${pct1(g.roeB)}`);
    }
  });
}
const WSTATE = { lev: 1, cash: 1, ext: 1 };
const winText = w => `观察${WINS[w].y0}–${WINS[w].y1}年；“此后”指${WINS[w].y1 + 1}–${FY1}年的年报，年化回报从${WINS[w].y1}年底算到${ym(LAST)}，含分红。`;

// ================================================================ 页首：疑点阶梯
function drawLadder() {
  const J = JUD[1], G = [[0, '没有疑点'], [1, '一个疑点'], [2, '两个以上']].map(([k, l]) => group(J.filter(d => k < 2 ? d.nf === k : d.nf >= 2), l));
  const c = cssv('--c2');
  $('ladder').innerHTML = G.map(g => `<li><div class="n red">${Math.round(g.later)}<small>%</small></div><div><div class="bar" style="width:${Math.max(1, g.later)}%;background:${c};opacity:${0.35 + g.later / 160}"></div><div class="k"><b>${g.label}</b> · ${cnt(g.n)}家 · <span class="r">此后年化回报中位数 ${sgn(g.ret)}</span></div></div></li>`).join('');
  $('ladderNote').textContent = `左边的数字：此后（${WINS[1].y1 + 1}–${FY1}年）出现过亏损年份的公司占比。观察期${WLAB[1]}，统计2016年前上市、今天仍在图上的 ${cnt(J.length)} 家非金融公司；同期另有 ${cnt(GONE[1])} 家后来退市，结局通常更差，没有算进去。四个疑点：利润含金量不到一半，有亏损年份，外部融资超过期初净资产，资产负债率70%以上。`;
  $('hN').textContent = cnt(LIVE.length);
}

// ================================================================ 第一课：杜邦
function dupontOf(list, k0, k1) {
  let ni = 0, rev = 0, ae = 0, A = 0;
  for (const o of list) for (let k = k0; k <= k1; k++) {
    const n = o.ni[k], r = o.rev[k], e = o.avgEq[k], l = o.lev[k];
    if (!isFinite(n) || !(r > 0) || !(e > 0) || !isFinite(l) || l >= 100) continue;
    ni += n; rev += r; ae += e; A += e / (1 - l / 100);
  }
  return { roe: ni / ae * 100, m: ni / rev * 100, t: rev / A, em: A / ae, roa: ni / A * 100 };
}
let DUP = null;
function drawDupont() {
  if (!DUP) DUP = SECT.map(s => ({ s, ...dupontOf(LIVE.filter(o => o.s === s.i), yi(2016), K1), cap: DATA.sec[s.i][LAST] }));
  const P = DUP.filter(d => !FINK.has(d.s.k) && d.m > 0);
  const nar = narrow(), { svg, w, h } = svgIn($('pDupont'), nar ? 360 : 440, '三十国的净利率和周转率');
  const m = { l: 42, r: nar ? 12 : 86, t: 14, b: 34 };
  const x = d3.scaleLog([1, 50], [m.l, w - m.r]).clamp(true), y = d3.scaleLog([0.25, 2], [h - m.b, m.t]).clamp(true);
  const r = d3.scaleSqrt([0, d3.max(P, d => d.cap)], [3, nar ? 22 : 30]);
  for (const v of [1, 2, 5, 10, 20, 50]) { svg.append('line').attr('class', 'grid').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t).attr('y2', h - m.b); svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', h - m.b + 16).attr('text-anchor', 'middle').text(v + '%'); }
  for (const v of [0.25, 0.5, 1, 2]) { svg.append('line').attr('class', 'grid').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(v)).attr('y2', y(v)); svg.append('text').attr('class', 'tick').attr('x', m.l - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').text(v); }
  svg.append('text').attr('class', 'tick').attr('x', w - m.r).attr('y', h - 2).attr('text-anchor', 'end').text('净利率 →');
  svg.append('text').attr('class', 'tick').attr('x', m.l).attr('y', m.t - 2).text('↑ 周转率（次/年）');
  // 等总资产收益率线：净利率 × 周转率 = 常数
  for (const roa of [1, 2, 4, 8, 16]) {
    const pts = d3.range(0, 1.0001, 0.02).map(f => { const mm = Math.exp(Math.log(1) + f * Math.log(50)); return [mm, roa / mm]; }).filter(([mm, t]) => t >= 0.25 && t <= 2);
    if (pts.length < 2) continue;
    svg.append('path').attr('d', d3.line(p => x(p[0]), p => y(p[1]))(pts)).attr('fill', 'none').attr('stroke', cssv('--fg-3')).attr('stroke-dasharray', '3 4').attr('opacity', .7);
    const e = pts[pts.length - 1]; if (!nar || roa >= 4) svg.append('text').attr('class', 'tick').attr('x', x(e[0]) + 4).attr('y', y(e[1]) + (e[1] <= 0.26 ? -4 : 4)).text(`${roa}%`);
  }
  if (!nar) svg.append('text').attr('class', 'tick').attr('x', w - m.r + 4).attr('y', m.t + 10).text('虚线：总资产收益率');
  const S = P.slice().sort((a, b) => b.cap - a.cap);
  for (const d of S) svg.append('circle').attr('cx', x(d.m)).attr('cy', y(d.t)).attr('r', r(d.cap)).attr('fill', secColor(d.s.i)).attr('fill-opacity', .55).attr('stroke', secColor(d.s.i)).attr('stroke-width', 1.2);
  placeLabels(svg, S.map(d => ({ x: x(d.m), y: y(d.t), r: r(d.cap), text: d.s.n, bold: d.cap > 30000 })), { l: m.l, r: w - 4, t: 0, b: h - m.b }, S.map(d => ({ x: x(d.m), y: y(d.t), r: Math.min(8, r(d.cap)) })));
  nearest(svg, S, d => x(d.m), d => y(d.t), { l: m.l, r: w - m.r, t: m.t, b: h - m.b },
    d => `<div class="t">${d.s.n}</div>${rows(['净资产收益率', pct1(d.roe)], ['净利率', pct1(d.m)], ['周转率', d.t.toFixed(2) + ' 次'], ['权益乘数', d.em.toFixed(2) + ' 倍'], ['总资产收益率', pct1(d.roa)])}<div class="s">2016–${FY1}年合计</div>`);
  $('tDupont').innerHTML = `<thead><tr><th>国</th><th>净资产收益率</th><th>净利率</th><th>周转率</th><th>权益乘数</th><th>总资产收益率</th></tr></thead><tbody>${DUP.slice().sort((a, b) => b.roe - a.roe).map(d => `<tr><td><i class="sw" style="background:${secColor(d.s.i)}"></i>${d.s.n}</td><td>${pct1(d.roe)}</td><td>${pct1(d.m)}</td><td>${d.t.toFixed(2)}</td><td>${d.em.toFixed(2)}</td><td>${pct1(d.roa)}</td></tr>`).join('')}</tbody>`;
  const nf = DUP.filter(d => !FINK.has(d.s.k)), hiM = nf.slice().sort((a, b) => b.m - a.m)[0], hiT = nf.slice().sort((a, b) => b.t - a.t)[0], hiE = nf.slice().sort((a, b) => b.em - a.em)[0], top = nf.slice().sort((a, b) => b.roe - a.roe);
  const bank = DUP.find(d => d.s.k === 'bank');
  $('sDupont').innerHTML = `回报率最高的${top[0].s.n}（${pct1(top[0].roe)}）几乎全靠利润率：每卖一块钱剩 ${Math.round(hiM.s.k === top[0].s.k ? hiM.m : top[0].m)} 分，周转率只有 ${top[0].t.toFixed(2)}，权益乘数 ${top[0].em.toFixed(2)}。${top[1].s.n}（${pct1(top[1].roe)}）的净利率只有 ${pct1(top[1].m)}，靠的是周转（${top[1].t.toFixed(2)}次）和别人的钱（权益乘数 ${top[1].em.toFixed(2)}）。周转最快的是${hiT.s.n}（${hiT.t.toFixed(2)}次），非金融行业里杠杆最高的是${hiE.s.n}（${hiE.em.toFixed(2)}倍）。银行的净利率高达 ${pct1(bank.m)}，周转率却只有 ${bank.t.toFixed(2)}，回报几乎全部来自 ${bank.em.toFixed(1)} 倍的杠杆。`;
  $('t1').innerHTML = `一家公司的回报率高，可能是因为东西卖得贵，可能是因为卖得快，也可能是因为借了很多钱。三者带来的回报一样花，<b>风险却完全不同</b>：利润率靠的是定价权，周转靠的是管理，杠杆靠的是别人的钱。拆开看，才知道这15%从哪里来、能不能持续。`;
}
function drawDriver() {
  const pool = LIVE.filter(o => !isFin(o) && o.a <= dec(2010));
  const L = [];
  for (const o of pool) {
    const ks = d3.range(yi(2011), yi(2015) + 1);
    if (!ks.every(k => isFinite(o.roe[k]))) continue;
    const a = mean(ks.map(k => o.roe[k])); if (a < 15) continue;
    const d = dupontOf([o], yi(2011), yi(2015)); if (!isFinite(d.em)) continue;
    const g = d.m >= 15 ? 'm' : d.em >= 2.5 ? 'e' : d.t >= 1 ? 't' : 'x';
    const after = mean(d3.range(yi(2016), NY).map(k => o.roe[k]));
    L.push({ o, g, after, ok: after >= 15 });
  }
  const NAME = { m: '利润率型', t: '周转型', e: '杠杆型', x: '其余' }, DESC = { m: '净利率15%以上', t: '周转率1次以上', e: '负债率60%以上', x: '三项都不突出' };
  const G = ['m', 't', 'e', 'x'].map(k => { const l = L.filter(d => d.g === k); return { k, n: l.length, ok: l.filter(d => d.ok).length / Math.max(1, l.length) * 100, after: med(l.map(d => d.after)), ex: l.slice().sort((a, b) => cap(b.o, LAST) - cap(a.o, LAST)).slice(0, 3).map(d => d.o.name) }; }).filter(g => g.n);
  G.sort((a, b) => b.ok - a.ok);
  $('drvSub').textContent = `2011–2015年平均净资产收益率在15%以上的 ${L.length} 家非金融公司（2010年底前上市、今天还在图上），按这五年的杜邦拆解归类：净利率15%以上算利润率型；其余里负债率60%以上（权益乘数2.5倍以上）算杠杆型；再其余周转率1次以上算周转型。看它们此后十年（2016–${FY1}）平均回报率还在15%以上的比例。`;
  const nar = narrow(), rowH = nar ? 58 : 50, { svg, w } = svgIn($('pDriver'), 18 + G.length * rowH, '高回报的来源和此后十年');
  const lw = nar ? 108 : 190, x = d3.scaleLinear([0, 60], [lw, w - 44]);
  for (const v of [0, 20, 40, 60]) { svg.append('line').attr('class', v ? 'grid' : 'zero').attr('x1', x(v)).attr('x2', x(v)).attr('y1', 14).attr('y2', 18 + G.length * rowH); svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', 10).attr('text-anchor', 'middle').text(v + '%'); }
  G.forEach((g, i) => {
    const y = 18 + i * rowH;
    svg.append('text').attr('class', 'lab b').attr('x', 0).attr('y', y + 15).text(`${NAME[g.k]} · ${g.n}家`);
    svg.append('text').attr('class', 'lab dim').attr('x', 0).attr('y', y + 32).text(DESC[g.k]);
    svg.append('path').attr('d', barPath(x(0), y + 4, Math.max(2, x(g.ok) - x(0)), 16)).attr('fill', cssv('--c1')).attr('opacity', .85);
    svg.append('text').attr('class', 'lab b').attr('x', x(g.ok) + 6).attr('y', y + 17).text(Math.round(g.ok) + '%');
    svg.append('text').attr('class', 'lab dim').attr('x', x(0)).attr('y', y + (nar ? 38 : 36)).text(`此后十年回报率中位数 ${pct1(g.after)}${nar ? '' : ' · 如 ' + g.ex.join('、')}`);
  });
  const best = G[0], worst = G[G.length - 1];
  $('sDriver').innerHTML = `高回报会褪色，但褪色的速度不一样：<b>${NAME[best.k]}</b>的公司里，十年后还有 ${Math.round(best.ok)}% 守在15%以上；<b>${NAME[worst.k]}</b>只有 ${Math.round(worst.ok)}%。靠借钱撑起来的回报，最怕的是行业一转冷、利息一上升；靠管理和定价权挣来的回报，竞争者要花更长时间才能追上。`;
}
function drawLev() {
  const w = WSTATE.lev, J = JUD[w].filter(d => !d.estate && isFinite(d.lev));
  const B = [[0, 40, '40%以下'], [40, 60, '40%–60%'], [60, 70, '60%–70%'], [70, 80, '70%–80%'], [80, 999, '80%以上']];
  drawOutcome($('pLev'), B.map(([a, b, l]) => group(J.filter(d => d.lev >= a && d.lev < b), '负债率 ' + l)), '负债率和此后的亏损');
  $('levSub').textContent = `按观察期最后一年的资产负债率分组，不含金融和房地产。${winText(w)}`;
}

// ================================================================ 第二课：含金量
function drawCash() {
  const w = WSTATE.cash, J = JUD[w], P = J.filter(d => d.allPos);
  const B = [[-1e9, 0, '含金量为负'], [0, 0.5, '0 – 0.5'], [0.5, 1, '0.5 – 1'], [1, 1e9, '1 以上']];
  const G = B.map(([a, b, l]) => group(P.filter(d => d.cc >= a && d.cc < b), l)).concat([group(J.filter(d => !d.allPos), '有亏损年份')]);
  drawOutcome($('pCash'), G, '利润含金量和此后的亏损');
  $('cashSub').textContent = `观察期内每年归母净利润都为正的公司，按五年经营现金流合计 ÷ 利润合计分组；最后一行是观察期内就亏过的公司，作为对照。${winText(w)}`;
  const neg = G[0], hi = G[3], lossG = G[4];
  $('sCash').innerHTML = `五年年年盈利、经营现金流合计却是负数的 ${cnt(neg.n)} 家公司，此后 <b>${Math.round(neg.later)}%</b> 出现过亏损，回报率从 ${pct1(neg.roeA)} 掉到 ${pct1(neg.roeB)}；含金量在1以上的公司，这个比例是 ${Math.round(hi.later)}%。账面利润一直赚、现金一直不进来的公司，后来的样子和观察期内就亏过的公司（${Math.round(lossG.later)}%）差不多。`;
  if (w === 1) $('t2').innerHTML = `利润表按“权责发生制”记账：货发出去、开了票，就算收入，钱什么时候收回来是另一回事。所以利润里可以有大量还没收到的应收账款、还没卖掉的存货，甚至虚构的交易。<b>现金流量表只记真金白银的进出</b>，造假要难得多。连续几年利润都在、现金都不来，要么是生意本身要垫太多钱，要么是利润本身有问题。`;
}
const TWO = [['600518', '康美药业', 2016], ['002069', '獐子岛', 2019], ['000892', '欢瑞世纪'], ['600519', '贵州茅台'], ['000333', '美的集团']];
let TWO_SEL = '600518';
const TWO_NOTE = { '600518': '这里只画到2016年，也就是造假曝光之前投资者能看到的样子；2017年及以后的数字是会计差错更正之后的，2019、2020年的巨亏是在清理此前虚增的资产。', '002069': '2016、2017年的利润后来被证监会认定一年虚增、一年虚减。' };
function drawTwo() {
  $('twoPick').innerHTML = TWO.map(([c, n]) => `<button class="chip" data-c="${c}" aria-pressed="${c === TWO_SEL}">${n}</button>`).join('');
  $('twoPick').querySelectorAll('button').forEach(b => b.onclick = () => { TWO_SEL = b.dataset.c; drawTwo(); });
  const o = byCode.get(TWO_SEL), y0 = Math.max(FY0, o.ly), yEnd = (TWO.find(t => t[0] === TWO_SEL) || [])[2] || FY1;
  const pts = []; let cn = 0, cc = 0, last = y0;
  for (let y = y0; y <= yEnd; y++) { const n = o.ni[yi(y)], c = o.ocf[yi(y)]; if (!isFinite(n)) continue; cn += n; const okc = isFinite(c); if (okc) { cc += c; last = y; } pts.push({ y, cn, cc: okc ? cc : NaN, n, c }); }
  const nar = narrow(), { svg, w, h } = svgIn($('pTwo'), nar ? 230 : 260, '累计利润与累计经营现金流');
  const m = { l: 52, r: 16, t: 12, b: 26 };
  const x = d3.scaleLinear([y0, yEnd], [m.l, w - m.r]);
  const lo = Math.min(0, d3.min(pts, d => Math.min(d.cn, isFinite(d.cc) ? d.cc : d.cn))), hi = Math.max(1, d3.max(pts, d => Math.max(d.cn, isFinite(d.cc) ? d.cc : 0)));
  const y = d3.scaleLinear([lo, hi], [h - m.b, m.t]).nice();
  for (const v of y.ticks(4)) { svg.append('line').attr('class', v ? 'grid' : 'zero').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(v)).attr('y2', y(v)); svg.append('text').attr('class', 'tick').attr('x', m.l - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').text(fmtYi(v).replace('.00', '')); }
  for (let yr = y0; yr <= yEnd; yr++) if ((yr - y0) % (nar ? 5 : yEnd - y0 > 10 ? 3 : 1) === 0 || yr === yEnd) svg.append('text').attr('class', 'tick').attr('x', x(yr)).attr('y', h - 6).attr('text-anchor', 'middle').text(yr);
  const both = pts.filter(d => isFinite(d.cc));
  svg.append('path').attr('d', d3.area(d => x(d.y), d => y(d.cn), d => y(d.cc))(both)).attr('fill', cssv('--c2')).attr('opacity', .12);
  svg.append('path').attr('d', d3.line(d => x(d.y), d => y(d.cn))(pts)).attr('fill', 'none').attr('stroke', cssv('--c4')).attr('stroke-width', 2.4);
  svg.append('path').attr('d', d3.line(d => x(d.y), d => y(d.cc))(both)).attr('fill', 'none').attr('stroke', cssv('--c1')).attr('stroke-width', 2.4);
  nearest(svg, pts, d => x(d.y), d => y(d.cn), { l: m.l, r: w - m.r, t: m.t, b: h - m.b },
    d => `<div class="t">${o.name} · ${d.y}年</div>${rows(['当年归母净利润', fmtYi(d.n), cssv('--c4')], ['当年经营现金流', isFinite(d.c) ? fmtYi(d.c) : '没有取到', cssv('--c1')], ['累计利润', fmtYi(d.cn)], ['累计现金', isFinite(d.cc) ? fmtYi(d.cc) : '—'])}`);
  const e = both[both.length - 1];
  $('sTwo').innerHTML = `${esc(o.name)}从${y0}年到${last}年累计归母净利润 <b>${fmtYi(e.cn)}</b>，经营现金流 <b>${fmtYi(e.cc)}</b>，含金量 ${e.cn > 0 ? x2(e.cc / e.cn) : '—'}。${TWO_NOTE[o.code] || ''}`;
}
function drawCcSec() {
  const by = SECT.map(() => []);
  for (const o of LIVE) {
    if (isFin(o) || o.a > dec(2015)) continue;
    let sn = 0, sc = 0, ok = true;
    for (let y = 2016; y <= 2024; y++) { const n = o.ni[yi(y)], c = o.ocf[yi(y)]; if (!isFinite(n) || !isFinite(c)) { ok = false; break; } sn += n; sc += c; }
    if (ok && sn > 0) by[o.s].push(sc / sn);
  }
  const S = SECT.filter(s => !FINK.has(s.k) && by[s.i].length >= 8).map(s => { const a = by[s.i].slice().sort(d3.ascending); return { s, n: a.length, md: d3.quantile(a, .5), q1: d3.quantile(a, .25), q3: d3.quantile(a, .75) }; }).sort((a, b) => a.md - b.md);
  $('ccSecSub').textContent = `2016–2024年合计（2025年的现金流量表约一半公司没有取到），只算这九年利润合计为正、2015年底前上市的非金融公司。`;
  const nar = narrow(), rowH = 19, m = { l: nar ? 92 : 110, r: 18, t: 20, b: 6 }, { svg, w, h } = svgIn($('pCcSec'), m.t + S.length * rowH + m.b, '各国利润含金量的分布');
  const x = d3.scaleLinear([-0.5, 4], [m.l, w - m.r]).clamp(true);
  for (const v of [0, 1, 2, 3, 4]) { svg.append('line').attr('class', v === 0 || v === 1 ? 'zero' : 'grid').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t - 4).attr('y2', h - m.b); svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', 11).attr('text-anchor', 'middle').text(v); }
  S.forEach((d, i) => {
    const y = m.t + i * rowH + rowH / 2;
    svg.append('text').attr('class', 'lab').attr('x', m.l - 8).attr('y', y + 4).attr('text-anchor', 'end').text(d.s.n);
    svg.append('line').attr('x1', x(d.q1)).attr('x2', x(d.q3)).attr('y1', y).attr('y2', y).attr('stroke', secColor(d.s.i)).attr('stroke-width', 6).attr('stroke-linecap', 'round').attr('opacity', .45);
    svg.append('circle').attr('cx', x(d.md)).attr('cy', y).attr('r', 4).attr('fill', cssv('--fg'));
  });
  nearest(svg, S, d => x(d.md), (d, i) => m.t + S.indexOf(d) * rowH + rowH / 2, { l: m.l, r: w - m.r, t: m.t, b: h - m.b },
    d => `<div class="t">${d.s.n}</div>${rows(['中位数', x2(d.md)], ['中间一半', `${x2(d.q1)} – ${x2(d.q3)}`], ['公司数', d.n + '家'])}`);
}

// ================================================================ 第三课：输血
let PAY = null;
function payOf(o) {   // 上市后各年：累计利润、净资产增加
  let ni = 0, de = 0, n = 0;
  for (let k = 0; k < NY; k++) { if (FY0 + k <= o.ly) continue; const a = o.ni[k], e0 = o.eq[k], e1 = o.eq[k + 1]; if (!isFinite(a) || !isFinite(e0) || !isFinite(e1)) continue; ni += a; de += e1 - e0; n++; }
  return { ni, de, n };
}
function drawPay() {
  if (!PAY) {
    const per = LIVE.map(o => ({ o, ...payOf(o) })).filter(d => d.n >= 3);
    const sec = SECT.map(s => { const l = per.filter(d => d.o.s === s.i); const ni = d3.sum(l, d => d.ni), de = d3.sum(l, d => d.de); return { s, ni, de, r: ni > 0 ? (ni - de) / ni * 100 : NaN }; });
    const ni = d3.sum(per, d => d.ni), de = d3.sum(per, d => d.de);
    PAY = { per, sec, all: { ni, de, r: (ni - de) / ni * 100 } };
  }
  const S = PAY.sec.filter(d => isFinite(d.r)).sort((a, b) => b.r - a.r), A = PAY.all;
  $('paySub').textContent = `今天在图上的公司，上市以后的每一年（2010–${FY1}）：净回馈 = 累计归母净利润 − 归母净资产的增加，除以累计利润。正数是把利润的这一部分还给了股东；负数是净资产比利润涨得还多，多出来的是向股东要来的钱。`;
  const nar = narrow(), rowH = 19, m = { l: nar ? 92 : 112, r: 40, t: 24, b: 4 }, { svg, w, h } = svgIn($('pPay'), m.t + (S.length + 1) * rowH + m.b, '各国十六年的净回馈率');
  const x = d3.scaleLinear([-150, 70], [m.l, w - m.r]).clamp(true);
  for (const v of [-150, -100, -50, 0, 50]) { svg.append('line').attr('class', v ? 'grid' : 'zero').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t - 4).attr('y2', h - m.b); svg.append('text').attr('class', 'tick').attr('x', x(v)).attr('y', 12).attr('text-anchor', 'middle').text(v + '%'); }
  const L = [{ s: { n: '全图', i: -1 }, r: A.r, ni: A.ni, de: A.de, all: true }].concat(S);
  L.forEach((d, i) => {
    const y = m.t + i * rowH;
    svg.append('text').attr('class', 'lab' + (d.all ? ' b' : '')).attr('x', m.l - 8).attr('y', y + 13).attr('text-anchor', 'end').text(d.s.n);
    const c = d.all ? cssv('--fg') : d.r >= 0 ? cssv('--c1') : cssv('--c2');
    svg.append('path').attr('d', barPath(x(0), y + 3, x(d.r) - x(0), 12)).attr('fill', c).attr('opacity', d.all ? .9 : .78);
    svg.append('text').attr('class', 'lab dim').attr('x', d.r >= 0 ? x(d.r) + 5 : x(d.r) - 5).attr('y', y + 13).attr('text-anchor', d.r >= 0 ? 'start' : 'end').text(pct0(d.r));
  });
  nearest(svg, L, d => x(d.r), d => m.t + L.indexOf(d) * rowH + 9, { l: m.l, r: w - m.r, t: m.t, b: h - m.b },
    d => `<div class="t">${d.s.n}</div>${rows(['累计归母净利润', fmtYi(d.ni)], ['归母净资产增加', fmtYi(d.de)], ['净回馈', fmtYi(d.ni - d.de)], ['净回馈率', pct0(d.r)])}`);
  const top = S.slice(0, 3), bot = S.slice(-3).reverse();
  $('sPay').innerHTML = `${top.map(d => d.s.n).join('、')}把利润的 ${pct0(top[2].r)}–${pct0(top[0].r)} 净还给了股东；${bot.map(d => d.s.n).join('、')}的净资产增加比利润还多，等于一边赚钱、一边向股东要钱。`;
  $('t3').innerHTML = `${2010}–${FY1}年，今天在图上的公司合计赚了 <b>${fmtYi(A.ni)}</b> 归母净利润，归母净资产增加了 ${fmtYi(A.de)}。两者相减，净回到股东手里的只有 <b>${pct0(A.r)}</b>：分红和回购，大多被增发、配股和上市后的再融资抵掉了。一家公司是在给股东分钱，还是在向股东要钱，是比利润增速更难伪装的事实。`;
  // 公司排行
  const per = PAY.per.map(d => ({ ...d, net: d.ni - d.de }));
  const tb = (title, L) => `<h4 style="margin:12px 0 4px;font-size:13px">${title}</h4><table class="dt num"><thead><tr><th>公司</th><th class="l">国</th><th>累计利润</th><th>净资产增加</th><th>净回馈</th></tr></thead><tbody>${L.map(d => `<tr class="pick" data-c="${d.o.code}"><td><span class="co-n">${esc(d.o.name)}</span><span class="co-c">${d.o.code}</span></td><td class="l">${SECT[d.o.s].n}</td><td>${fmtYi(d.ni)}</td><td>${fmtYi(d.de)}</td><td>${fmtYi(d.net)}</td></tr>`).join('')}</tbody></table>`;
  $('payTables').innerHTML = tb('净融资最多的15家（净资产增加减去累计利润）', per.slice().sort((a, b) => a.net - b.net).slice(0, 15)) + tb('净回馈最多的15家', per.slice().sort((a, b) => b.net - a.net).slice(0, 15));
  $('payTables').querySelectorAll('tr.pick').forEach(r => r.onclick = () => showReport(byCode.get(r.dataset.c), true));
}
function drawExt() {
  const w = WSTATE.ext, J = JUD[w];
  const B = [[-1e9, 0, '净回馈'], [0, 0.3, '0 – 30%'], [0.3, 1, '30% – 100%'], [1, 1e9, '100% 以上']];
  drawOutcome($('pExt'), B.map(([a, b, l]) => group(J.filter(d => d.ext >= a && d.ext < b), l)), '外部融资和此后的亏损');
  $('extSub').textContent = `外部融资 =（期末净资产 − 期初净资产 − 五年利润）÷ 期初净资产。“净回馈”是这个数为负：分出去的比要进来的多。${winText(w)}`;
}

// ================================================================ 第四课：商誉
function drawGw() {
  const L = LIVE.filter(o => isFinite(o.gw));
  const B = [[0, 0, '没有'], [0.0001, 10, '10%以内'], [10, 30, '10%–30%'], [30, 50, '30%–50%'], [50, 100, '50%–100%'], [100, 1e9, '超过净资产']];
  const G = B.map(([a, b, l]) => ({ l, a, n: L.filter(o => a === 0 && b === 0 ? o.gw === 0 : o.gw >= a && o.gw < b).length }));
  const has = L.filter(o => o.gw > 0).length, n30 = L.filter(o => o.gw >= 30).length, n50 = L.filter(o => o.gw >= 50).length, n100 = L.filter(o => o.gw >= 100).length;
  $('gwSub').textContent = `${FY1}年报，商誉 ÷ 归母净资产。共 ${cnt(L.length)} 家公司取到了数据。`;
  $('gwTiles').innerHTML = [[cnt(has), '家公司有商誉'], [cnt(n30), '家超过净资产30%'], [cnt(n50), '家超过一半'], [cnt(n100), '家超过净资产本身']].map(([v, k]) => `<div class="tile"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
  const nar = narrow(), { svg, w, h } = svgIn($('pGw'), 200, '商誉占净资产比例的分布');
  const m = { l: 40, r: 10, t: 16, b: 34 }, x = d3.scaleBand(G.map(d => d.l), [m.l, w - m.r]).padding(0.28), y = d3.scaleSqrt([0, d3.max(G, d => d.n)], [h - m.b, m.t]);
  for (const v of [100, 1000, 3000]) if (v < d3.max(G, d => d.n)) { svg.append('line').attr('class', 'grid').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(v)).attr('y2', y(v)); svg.append('text').attr('class', 'tick').attr('x', m.l - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').text(cnt(v)); }
  G.forEach((d, i) => {
    const c = d.a >= 30 ? cssv('--c2') : d.a > 0 ? cssv('--c4') : cssv('--mute');
    svg.append('path').attr('d', colPath(x(d.l), h - m.b, x.bandwidth(), Math.max(1, h - m.b - y(d.n)))).attr('fill', c).attr('opacity', .82);
    svg.append('text').attr('class', 'lab b').attr('x', x(d.l) + x.bandwidth() / 2).attr('y', y(d.n) - 4).attr('text-anchor', 'middle').text(cnt(d.n));
    svg.append('text').attr('class', 'tick').attr('x', x(d.l) + x.bandwidth() / 2).attr('y', h - m.b + 15).attr('text-anchor', 'middle').text(nar ? d.l.replace('超过净资产', '>100%') : d.l);
  });
  svg.append('text').attr('class', 'tick').attr('x', m.l).attr('y', h - 4).text('纵轴为平方根刻度');
  const bySec = SECT.map(s => { const l = L.filter(o => o.s === s.i); return { s, n: l.length, k: l.filter(o => o.gw >= 30).length }; }).filter(d => d.n >= 15).sort((a, b) => b.k / b.n - a.k / a.n);
  const tops = bySec.slice(0, 3);
  $('sGw').innerHTML = `商誉占净资产30%以上的公司，比例最高的是 ${tops.map(d => `${d.s.n}（${d.k}/${d.n}家）`).join('、')}——正是2015年前后并购最多的几个国。`;
  $('t4').innerHTML = `2013–2016年，A股公司用股票和现金大量收购游戏、影视、教育和互联网公司，标的往往按十几倍、几十倍市盈率作价，并许下三年的业绩承诺。按 Wind 的统计，到2018年三季度末全市场商誉达到1.45万亿元，18家公司的商誉比净资产还多。承诺期一过，业绩变脸：全市场商誉减值2016年还只有114亿元，2018年猛增到约1,660亿元，传媒一个行业就占了481亿元。<b>今天还有 ${cnt(n30)} 家公司的商誉超过净资产的30%。</b>`;
  const T = L.filter(o => o.gw >= 50).sort((a, b) => b.gw - a.gw);
  $('tGw').innerHTML = `<thead><tr><th>公司</th><th class="l">国</th><th>商誉/净资产</th><th>${FY1}年回报率</th><th>五年里亏损</th><th>市值</th></tr></thead><tbody>${T.map(o => { const s = sig(o); return `<tr class="pick" data-c="${o.code}"><td><span class="co-n">${esc(o.name)}</span><span class="co-c">${o.code}</span></td><td class="l">${SECT[o.s].n}</td><td>${o.gw >= 250 ? '≥250%' : o.gw + '%'}</td><td>${pct1(o.roe[K1])}</td><td>${s ? s.loss + ' 年' : '—'}</td><td>${fmtYi(cap(o, LAST))}</td></tr>`; }).join('')}</tbody>`;
  $('tGw').querySelectorAll('tr.pick').forEach(r => r.onclick = () => showReport(byCode.get(r.dataset.c), true));
}

// ================================================================ 卷宗
const CASES = [
  { c: '600518', n: '康美药业', y: '2016–2018', tag: '存贷双高，A股最大的现金造假',
    q: o => { const s = sumNiOcf(o, 2010, 2016); return `账上的货币资金越堆越多，有息负债也越借越多；利润年年增长，2010–2016年的经营现金流合计却只有利润的 <b>${Math.round(s.cc * 100)}%</b>；上市后不断增发、配股、发债。2012年就有媒体质疑它虚增资产，2018年10月又被质疑存贷双高、大股东高比例质押。`; },
    t: '证监会查明，2016–2018年累计虚增营业收入291.28亿元、虚增货币资金886亿元。2021年11月，首单特别代表人诉讼判决公司赔偿投资者24.59亿元，实际控制人、高管、独立董事和签字会计师承担连带责任。' },
  { c: '002450', n: '康得新', y: '2015–2018', tag: '122亿存款，银行说余额为零', gone: true,
    q: () => '2018年报显示货币资金153亿元，2019年1月却兑付不了15亿元短期融资券。其中122亿元存放在北京银行西单支行，银行回函称账户余额为0，资金通过“联动账户”被归集到大股东。年报被出具无法表示意见，三名独立董事公开质疑这笔存款。',
    t: '证监会认定，2015–2018年虚增利润总额约115亿元；122亿元存款是造假的结果，而不是被大股东占用。2021年因重大违法强制退市。' },
  { c: '002069', n: '獐子岛', y: '2014–2017', tag: '扇贝跑了，又饿死了',
    q: o => `2014年秋测称遭遇冷水团、扇贝几近绝收，全年亏损 <b>${fmtYi(-o.ni[yi(2014)])}</b>；2015年再亏，2016年微利扭亏，2017年又以扇贝饿死为由亏损 ${fmtYi(-o.ni[yi(2017)])}。最大的资产是海底的扇贝，没有人能盘点。`,
    t: '证监会用北斗导航记录的采捕船航迹，比出公司少报采捕面积、重复结转成本：2016年虚增利润1.31亿元，占当年披露利润总额的158%，实际应为亏损；2017年又虚减利润2.79亿元。不造假的话，2014–2017年将连亏四年。' },
  { c: '300104', n: '乐视网', y: '2007–2016', tag: '连续十年造假', gone: true,
    q: () => '收入高速增长，却长期依赖增发、借款和关联方；大量关联交易和对外担保没有披露；大股东承诺把减持所得借给公司，钱进来不久又被抽走。',
    t: '证监会认定，2007–2016年连续十年财务造假，累计虚增收入18.72亿元、虚增利润13.37亿元；2016年定向增发募资47.99亿元构成欺诈发行。公司和实际控制人各被罚约2.4亿元。2020年退市。' },
  { c: '000413', n: '东旭光电', y: '2019', tag: '手握183亿，还不起20亿', gone: true,
    q: () => '2019年三季度末账面货币资金183亿元，短期借款和应付债券合计却超过200亿元，相当一部分资金存放在集团财务公司或受限。2018年末，深交所就问询过它为什么钱这么多还要借这么多。',
    t: '2019年11月，两期中期票据违约，应付本息约20亿元。此后五年累计亏损约110亿元，2024年退市。' },
  { c: '002354', n: '天神娱乐', y: '2015–2018', tag: '并购买来的利润',
    q: o => `2015年起连续收购游戏、影视公司，多用股票支付，商誉从2014年末的0元三年涨到约65亿元；利润跟着并表大涨，归母净资产从 ${fmtYi(o.eq[yi(2014) + 1])} 膨胀到 ${fmtYi(o.eq[yi(2017) + 1])}。`,
    t: o => `被收购公司业绩不达预期，2018年计提商誉减值约40.6亿元，加上其他减值，全年归母净利润 <b>${fmtYi(o.ni[yi(2018)])}</b>（上年盈利 ${fmtYi(o.ni[yi(2017)])}），年报被出具保留意见。公司现名天娱数科。` }
];
function sumNiOcf(o, y0, y1) { let n = 0, c = 0; for (let y = y0; y <= y1; y++) { n += o.ni[yi(y)] || 0; c += o.ocf[yi(y)] || 0; } return { n, c, cc: c / n }; }
function drawCases() {
  const el = $('cases');
  el.innerHTML = CASES.map((k, i) => `<div class="case${k.gone ? ' gone' : ''}"><h4>${k.n}<small>${k.c} · ${k.y}${k.gone ? ' · 已退市' : ''}</small></h4><div class="tag">${k.tag}</div><div class="mini" id="cm${i}"></div><div class="cap" id="cc${i}"></div>
    <dl><dt>疑点</dt><dd>${typeof k.q === 'function' ? k.q(byCode.get(k.c)) : k.q}</dd><dt>真相</dt><dd>${typeof k.t === 'function' ? k.t(byCode.get(k.c)) : k.t}</dd></dl>
    ${k.gone ? '' : `<p style="margin:8px 0 0;font-size:13px"><button class="chip" data-c="${k.c}">在“侦查”里看它的报告</button></p>`}</div>`).join('');
  el.querySelectorAll('button[data-c]').forEach(b => b.onclick = () => showReport(byCode.get(b.dataset.c), true));
  CASES.forEach((k, i) => miniCase($('cm' + i), $('cc' + i), byCode.get(k.c)));
}
function miniCase(el, capEl, o) {
  const hasF = o.ni.some(isFinite) && o.b === LAST, H = hasF ? 166 : 96, { svg, w } = svgIn(el, H, o.name + '的市值和年报');
  const t0 = Math.max(o.a, mi('2005-01')), t1 = o.b, yTop = 6, yBot = hasF ? 84 : 80;
  const x = d3.scaleLinear([t0, t1], [2, w - 2]);
  const vals = d3.range(t0, t1 + 1).map(t => cap(o, t)), pk = d3.maxIndex(vals);
  const y = d3.scaleLinear([0, vals[pk] * 1.08], [yBot, yTop]);
  svg.append('line').attr('class', 'zero').attr('x1', 2).attr('x2', w - 2).attr('y1', yBot).attr('y2', yBot);
  svg.append('path').attr('d', d3.area((_, i) => x(t0 + i), yBot, v => y(v))(vals)).attr('fill', cssv('--c3')).attr('opacity', .12);
  svg.append('path').attr('d', d3.line((_, i) => x(t0 + i), v => y(v))(vals)).attr('fill', 'none').attr('stroke', cssv('--c3')).attr('stroke-width', 1.6);
  svg.append('circle').attr('cx', x(t0 + pk)).attr('cy', y(vals[pk])).attr('r', 3).attr('fill', cssv('--c3'));
  const lx = x(t0 + pk), anchor = lx > w * 0.6 ? 'end' : 'start';
  svg.append('text').attr('class', 'lab dim hp').attr('x', lx + (anchor === 'end' ? -6 : 6)).attr('y', Math.max(14, y(vals[pk]) + 4)).attr('text-anchor', anchor).text(`最高 ${fmtYi(vals[pk])}`);
  const lastV = vals[vals.length - 1];
  svg.append('text').attr('class', 'tick').attr('x', 2).attr('y', yBot + 13).text(MONTHS[t0].slice(0, 4));
  svg.append('text').attr('class', 'tick').attr('x', w - 2).attr('y', yBot + 13).attr('text-anchor', 'end').text(o.b === LAST ? `今天 ${fmtYi(lastV)}` : `${MONTHS[o.b].replace('-', '.')} 退市前 ${fmtYi(lastV)}`);
  if (hasF) {
    const by = 100, bh = 50, ks = d3.range(NY), av = ks.flatMap(k => [Math.abs(o.ni[k]), Math.abs(o.ocf[k])]).filter(isFinite).sort(d3.ascending), mx = (d3.quantile(av, 0.85) || 1) * 1.25;
    const bx = d3.scaleBand(ks, [2, w - 2]).padding(0.18), yb = v => Math.max(-1, Math.min(1, v / mx)) * (bh / 2);
    const mid = by + bh / 2;
    svg.append('line').attr('class', 'zero').attr('x1', 2).attr('x2', w - 2).attr('y1', mid).attr('y2', mid);
    for (const k of ks) {
      const bw = bx.bandwidth() / 2;
      if (isFinite(o.ni[k])) svg.append('path').attr('d', colPath(bx(k), mid, bw, Math.max(0.6, Math.abs(yb(o.ni[k]))) * Math.sign(o.ni[k] || 1))).attr('fill', cssv('--c4'));
      if (isFinite(o.ocf[k])) svg.append('path').attr('d', colPath(bx(k) + bw, mid, bw, Math.max(0.6, Math.abs(yb(o.ocf[k]))) * Math.sign(o.ocf[k] || 1))).attr('fill', cssv('--c1'));
    }
    svg.append('text').attr('class', 'tick').attr('x', 2).attr('y', by + bh + 12).text(FY0);
    svg.append('text').attr('class', 'tick').attr('x', w - 2).attr('y', by + bh + 12).attr('text-anchor', 'end').text(FY1);
    nearest(svg, ks.map(k => ({ k })), d => bx(d.k) + bx.bandwidth() / 2, () => mid, { l: 0, r: w, t: by - 4, b: by + bh + 4 },
      d => `<div class="t">${o.name} · ${FY0 + d.k}年</div>${rows(['归母净利润', isFinite(o.ni[d.k]) ? fmtYi(o.ni[d.k]) : '—', cssv('--c4')], ['经营现金流', isFinite(o.ocf[d.k]) ? fmtYi(o.ocf[d.k]) : '—', cssv('--c1')])}`);
  }
  capEl.textContent = hasF ? '上：每月末总市值；下：每年归母净利润（金）、经营现金流（绿），同一刻度。' : '每月末总市值。已退市，年报没有收录。';
}

// ================================================================ 附注：十六条线索
const CLUES = [
  { c: '资产', t: '存贷双高', can: false, see: '货币资金很多，短期借款、债券也很多，财务费用居高不下。', where: '附注“货币资金”（受限资金、存放在哪家银行、是否放在集团财务公司）；“短期借款”“应付债券”；财务费用里的“利息收入”。', how: '利息收入 ÷ 平均货币资金，明显低于活期存款利率就要追问；货币资金 ÷ 有息负债。', ex: '康美药业、康得新、东旭光电' },
  { c: '现金', t: '利润有，现金没有', can: true, see: '净利润年年为正，经营现金流长期很少甚至为负。', where: '现金流量表补充资料“将净利润调节为经营活动现金流量”：差额来自应收增加、存货增加，还是经营性应付减少。', how: '多年经营现金流合计 ÷ 归母净利润合计，和同行、和自己的过去比。', ex: '康美药业2010–2016年只有一半多' },
  { c: '资产', t: '应收账款跑得比收入快', can: false, see: '营收增长20%，应收账款增长60%；或者大量商业承兑汇票。', where: '附注“应收账款”：账龄分布、坏账计提比例、前五名欠款方及是否关联方；“应收票据”里商业承兑汇票的金额。', how: '应收账款周转天数 = 平均应收账款 ÷ 营收 × 365；坏账计提比例和同行比。', ex: '先发货、后收款的放松信用，是最常见的“做大收入”' },
  { c: '资产', t: '存货越堆越多', can: false, see: '存货增速远超营收，周转天数逐年拉长，却很少计提跌价准备。', where: '附注“存货”：原材料、在产品、库存商品、消耗性生物资产各多少；存货跌价准备计提比例。', how: '存货周转天数 = 平均存货 ÷ 营业成本 × 365。', ex: '獐子岛：海底的扇贝无法盘点' },
  { c: '资产', t: '预付款和其他应收款', can: false, see: '钱付出去了，货和服务迟迟没回来；“其他应收款”金额大、说不清用途。', where: '附注“预付款项”“其他应收款”：按款项性质分类、前五名、账龄、是否关联方。', how: '（预付款 + 其他应收款）÷ 总资产；同比增速。', ex: '大股东非经营性占用资金，常藏在这里' },
  { c: '资产', t: '在建工程迟迟不转固', can: false, see: '在建工程连年增加、进度说明含糊，一直不转为固定资产。', where: '附注“在建工程”：重要项目的预算、工程进度、本期转固金额；“借款费用资本化”金额。', how: '在建工程 ÷ 固定资产；资本化利息 ÷ 利息支出总额。不转固就不计折旧，利息还能资本化，利润因此虚高。', ex: '康美药业2018年报虚增固定资产、在建工程等约36亿元' },
  { c: '利润', t: '研发支出资本化', can: false, see: '研发投入大，计入费用的却很少，资产里的“开发支出”“无形资产”越来越多。', where: '附注“研发支出”“开发支出”：本期资本化金额、资本化的项目和依据。', how: '资本化率 = 资本化研发 ÷ 研发投入合计。同行都全部费用化而它大量资本化，就要问。', ex: '把费用变成资产，是美化利润最安静的方法之一' },
  { c: '资产', t: '商誉与业绩承诺', can: true, see: '商誉占净资产很大；被收购公司的业绩刚好踩线完成承诺。', where: '附注“商誉”：减值测试的预测增长率、毛利率、折现率；重大资产重组的“业绩承诺完成情况”。', how: '商誉 ÷ 归母净资产；承诺期结束后的第一年最危险。', ex: '天神娱乐2018年计提商誉减值约40.6亿元' },
  { c: '利润', t: '非经常性损益撑场面', can: false, see: '净利润不错，扣除非经常性损益后却很少，甚至亏损。', where: '“非经常性损益项目及金额”：政府补助、资产处置收益、公允价值变动、债务重组。', how: '扣非净利润 ÷ 净利润；连续几年靠卖资产、拿补助达标，是主业不行的信号。', ex: '保壳的年份最常见' },
  { c: '利润', t: '毛利率远超同行', can: false, see: '同样的产品，它的毛利率比同行高出一截，还年年稳定。', where: '“主营业务分行业、分产品、分地区”的收入、成本和毛利率；与同行年报对比。', how: '毛利率高 + 现金流差 + 应收多，是虚构收入的经典组合。', ex: '真有定价权的公司，现金流也会跟着好' },
  { c: '治理', t: '客户和供应商又集中又神秘', can: false, see: '前五名客户占了大半收入；大客户是新成立的小公司，或者和公司是“邻居”。', where: '“前五名客户/供应商”的销售额、采购额及占比；必要时查工商信息。', how: '前五名客户销售额 ÷ 营收；客户名单年年大换血也要问。', ex: '虚构交易需要“配合”的对手方' },
  { c: '治理', t: '关联交易与对外担保', can: false, see: '和大股东旗下公司的买卖、借款、担保金额大。', where: '“关联方及关联交易”“承诺及或有事项”（对外担保、未决诉讼）。', how: '关联交易金额 ÷ 营收；对外担保 ÷ 净资产。', ex: '乐视网：关联交易和对外担保未披露' },
  { c: '治理', t: '审计意见与更换会计师', can: false, see: '非标准审计意见；频繁更换会计师事务所；年报推迟披露。', where: '审计报告首页的意见类型、“关键审计事项”“强调事项”；董事会关于更换会计师的公告。', how: '不需要算：保留意见、无法表示意见本身就是红灯。', ex: '康得新2018年报被出具无法表示意见' },
  { c: '治理', t: '大股东质押与减持', can: false, see: '控股股东把大部分股份质押出去，或者一解禁就减持。', where: '“股东和实际控制人情况”里的质押、冻结数量；交易所的质押公告和减持公告。', how: '质押股份 ÷ 大股东持股；高比例质押 + 存贷双高要格外小心。', ex: '康美药业2018年被质疑大股东质押比例高' },
  { c: '现金', t: '一直在向股东要钱', can: true, see: '上市以来融资远远多于分红，募投项目一个接一个。', where: '“募集资金使用情况”：项目进度、是否达到预计收益、是否变更用途；历年分红。', how: '本页的“净回馈”= 累计利润 − 净资产增加；五年外部融资 ÷ 期初净资产。', ex: '康美药业上市以来累计募资约834亿元（含发债）' },
  { c: '资产', t: '高杠杆与短债长投', can: true, see: '资产负债率很高；用短期借款支撑长期资产，每年都要借新还旧。', where: '“短期借款”“一年内到期的非流动负债”与货币资金（扣除受限部分）对比；利息保障倍数。', how: '资产负债率；现金短债比 =（货币资金 − 受限资金）÷ 短期有息负债。', ex: '违约往往发生在一笔债到期却借不到新债的时候' }
];
let CLUE_CAT = '全部';
function drawClues() {
  const cats = ['全部', '资产', '利润', '现金', '治理', '本页能算'];
  $('clueChips').innerHTML = cats.map(c => `<button class="chip" data-c="${c}" aria-pressed="${c === CLUE_CAT}">${c}</button>`).join('');
  $('clueChips').querySelectorAll('button').forEach(b => b.onclick = () => { CLUE_CAT = b.dataset.c; drawClues(); });
  $('clues').innerHTML = CLUES.map((k, i) => ({ k, i })).filter(({ k }) => CLUE_CAT === '全部' || (CLUE_CAT === '本页能算' ? k.can : k.c === CLUE_CAT)).map(({ k, i }) => `<div class="clue"><h4><span class="no">${String(i + 1).padStart(2, '0')}</span>${k.t}${k.can ? '<span class="can">本页能算</span>' : ''}</h4>
    <p><span class="k">看到</span>${k.see}</p><p><span class="k">去查</span>${k.where}</p><p><span class="k">算法</span>${k.how}</p><p><span class="k">案例</span>${k.ex}</p></div>`).join('');
}

// ================================================================ 侦查：一家公司的报告
const SY0 = 2021, SY1 = FY1;
const SIG = new Map();
function sig(o) {
  if (SIG.has(o.code)) return SIG.get(o.code);
  let r = null;
  if (o.b === LAST && !isFin(o)) {
    const ys = d3.range(Math.max(SY0, o.ly + 1), SY1 + 1).filter(y => isFinite(o.ni[yi(y)]));
    if (ys.length >= 3) {
      const yc = ys.filter(y => isFinite(o.ocf[yi(y)]));
      const sn = d3.sum(yc, y => o.ni[yi(y)]), sc = d3.sum(yc, y => o.ocf[yi(y)]), cc = yc.length >= 3 && sn > 0 ? sc / sn : NaN;
      const loss = ys.filter(y => o.ni[yi(y)] < 0).length, negOcf = yc.filter(y => o.ocf[yi(y)] < 0).length;
      const e0 = o.eq[yi(ys[0])], e1 = o.eq[yi(ys[ys.length - 1]) + 1], sNi = d3.sum(ys, y => o.ni[yi(y)]);
      const ext = e0 > 0 && isFinite(e1) ? (e1 - e0 - sNi) / e0 : NaN;
      const lev = o.lev[K1], estate = SECT[o.s].k === 'estate', roe5 = mean(ys.map(y => o.roe[yi(y)]));
      const f = { cash: yc.length >= 3 && sn > 0 && cc < 0.5, loss: loss > 0, ext: ext > 1, lev: !estate && lev >= 70, gw: o.gw >= 30 };
      r = { ys, yc, sn, sc, cc, loss, negOcf, e0, e1, sNi, ext, lev, estate, roe5, f, nf: f.cash + f.loss + f.ext + f.lev + f.gw };
    }
  }
  SIG.set(o.code, r); return r;
}
const PEERS = new Map();
function peerRank(o, key, v) {   // 同一个国里，数值比它小的公司占比
  const k = o.s + key; if (!PEERS.has(k)) PEERS.set(k, LIVE.filter(x => x.s === o.s).map(x => { const s = sig(x); return s ? (key === 'gw' ? x.gw : s[key]) : NaN; }).filter(isFinite).sort(d3.ascending));
  const a = PEERS.get(k); if (!a.length || !isFinite(v)) return NaN;
  return d3.bisectLeft(a, v) / a.length * 100;
}
const HINT = { build: '合同资产和应收账款（工程款）的账龄，PPP项目的回款', pharma: '销售费用率、研发支出资本化比例、集采对毛利率的影响', estate: '剔除预收款后的资产负债率、净负债率、现金短债比（“三道红线”），以及表外的合作项目', soft: '研发支出资本化、应收账款周转天数、政府和国企客户的回款', media: '商誉减值测试、影视剧和版权存货的减值', agri: '生物资产（存栏、林木、海底养殖）的盘点和减值', semi: '在建工程转固的时间、折旧年限、存货跌价准备', power: '应收补贴款、存货跌价、产能利用率', defense: '应收账款和应收票据（军方回款周期长）', elec: '大客户集中度、存货跌价、汇兑损益', mach: '应收账款和分期收款、产品质保金', auto: '经销商库存、应付账款和票据（对供应商的账期）', trade: '预付款项、其他应收款、供应链金融业务', chem: '在建工程、环保支出、周期高点的利润能否持续', metal: '套期保值损益、存货跌价、资源储量', steel: '周期高点的利润能否持续、债务结构', coal: '周期高点的利润、分红承诺能否兑现', oil: '油价假设与资产减值', transp: '固定资产折旧政策、在建工程', util: '应收电费、补贴，在建工程和有息负债', telecom: '资本开支与折旧、存货', food: '经销商预收款（合同负债）、渠道库存', baijiu: '合同负债（经销商预付款）的变化、渠道库存', appl: '应付账款和票据（占用上下游资金是优势）、海外收入的汇兑', light: '存货跌价、外销客户集中度', ai: '大客户集中度、存货、应收账款', bmat: '应收账款（房地产客户）、商业承兑汇票' };
let REP = null;
function showReport(o, scroll) {
  REP = o; const P = $('report');
  if (scroll) document.getElementById('zhencha').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const ah = AH.get(o.code), links = `<small><a href="index.html#co=${o.code}">在地图上看</a> · <a href="faxian.html#co=${o.code}">财报小传</a>${ah ? ` · <a href="ganggu.html#co=${o.code}">H股 ${ah.h}</a>` : ''}</small>`;
  const head = `<h3>${esc(o.name)}<small>${o.code} · <i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${secColor(o.s)};margin-right:4px"></i>${SECT[o.s].n}${o.b < LAST ? ` · ${ym(o.b)}退市` : ''}</small>${links}</h3>`;
  if (isFin(o)) { P.innerHTML = head + `<p class="lead">银行、证券、保险的报表结构和实业公司不同：负债是它们的原料，经营现金流随存贷款、客户资金大幅波动，本页的五盏灯都不适用。看银行，要看不良贷款率、拨备覆盖率、资本充足率和净息差；看保险，要看新业务价值、内含价值和投资收益率；看券商，要看自营和杠杆。</p>`; return; }
  const s = sig(o);
  if (!s) { P.innerHTML = head + `<p class="lead">${o.b < LAST ? '这家公司已经退市，年报没有收录。' : '这家公司上市不满三年，或者年报不全，暂时无法给出报告。'}</p>`; drawRepCharts(o, null); return; }
  const lamps = ['cash', 'loss', 'ext', 'lev', 'gw'].map(k => `<i class="${s.f[k] ? 'on' : ''}"></i>`).join('');
  const span = `${s.ys[0]}–${s.ys[s.ys.length - 1]}年`, yc = s.yc.length ? `${s.yc[0]}–${s.yc[s.yc.length - 1]}年` : '';
  const pr = (key, v, better) => { const p = peerRank(o, key, v); if (!isFinite(p)) return ''; const q = better === 'hi' ? 100 - p : p; return `<span class="pv">同行里约 ${Math.max(1, Math.round(q))}% 的公司${better === 'hi' ? '比它高' : '比它低'}</span>`; };
  const items = [];
  if (s.yc.length >= 3) {
    const v = s.cc, cls = s.f.cash ? 'w' : v >= 1 ? 'g' : 'm';
    items.push(`<li class="${cls}"><b>含金量 ${s.sn > 0 ? x2(v) : '—'}</b>：${yc}经营现金流合计 ${fmtYi(s.sc)}，归母净利润合计 ${fmtYi(s.sn)}${s.negOcf >= 2 ? `；其中 ${s.negOcf} 年经营现金流为负` : ''}。${pr('cc', v, 'hi')}</li>`);
  }
  items.push(`<li class="${s.loss ? 'w' : 'g'}"><b>${s.loss ? `${s.loss} 年亏损` : '没有亏损'}</b>：${span}的归母净利润${s.ys.map(y => fmtYi(o.ni[yi(y)])).join('、')}；平均净资产收益率 ${pct1(s.roe5)}${s.roe5 < 5 ? '，低于5%，算是平庸' : ''}。</li>`);
  if (isFinite(s.ext)) { const ex = s.e1 - s.e0 - s.sNi; items.push(`<li class="${s.f.ext ? 'w' : s.ext > 0.3 ? 'm' : 'g'}"><b>${ex >= 0 ? `外部融资约 ${fmtYi(ex)}` : `净回馈约 ${fmtYi(-ex)}`}</b>：五年里归母净资产从 ${fmtYi(s.e0)} 变成 ${fmtYi(s.e1)}，利润合计 ${fmtYi(s.sNi)}${ex >= 0 ? `，多出来的部分相当于期初净资产的 ${pct0(s.ext * 100)}` : '，分出去的比要进来的多'}。</li>`); }
  if (isFinite(s.lev)) items.push(`<li class="${s.f.lev ? 'w' : s.lev >= 60 && !s.estate ? 'm' : 'g'}"><b>资产负债率 ${Math.round(s.lev)}%</b>${s.estate ? '：房地产的负债里有大量预收房款，要看剔除预收款后的口径' : ''}。${pr('lev', s.lev, 'lo')}</li>`);
  if (isFinite(o.gw)) items.push(`<li class="${s.f.gw ? 'w' : o.gw >= 10 ? 'm' : 'g'}"><b>${o.gw ? `商誉占净资产 ${o.gw >= 250 ? '250%以上' : o.gw + '%'}` : '没有商誉'}</b>${o.gw ? '：每一分商誉都是为“被收购公司将来会赚钱”预付的溢价。' : '。'}</li>`);
  const pay = payOf(o); if (pay.n >= 5 && pay.ni > 0) items.push(`<li class="${pay.ni - pay.de >= 0 ? 'g' : 'm'}"><b>上市以来净回馈率 ${pct0((pay.ni - pay.de) / pay.ni * 100)}</b>：${Math.max(FY0, o.ly + 1)}–${FY1}年累计利润 ${fmtYi(pay.ni)}，净资产增加 ${fmtYi(pay.de)}。</li>`);
  const next = [];
  if (s.f.cash) next.push('现金流量表补充资料：利润和现金的差额，是应收增加、存货增加，还是应付减少？应收账款的账龄和前五名欠款方。');
  if (s.f.loss) next.push('非经常性损益：扣非以后是不是亏得更多；亏损来自主业，还是来自减值。');
  if (s.f.ext) next.push('募集资金使用情况：募来的钱投到了哪里、项目是否达到预期收益；历年分红合计多少。');
  if (s.f.lev || s.lev >= 60) next.push('短期借款、一年内到期的非流动负债，和扣除受限部分后的货币资金比一比；利息收入和利息支出是否匹配（存贷双高）。');
  if (s.f.gw || o.gw >= 10) next.push('“商誉”附注：减值测试用的增长率、折现率是否乐观；被收购公司的业绩承诺完成得怎样。');
  if (HINT[SECT[o.s].k]) next.push(`${SECT[o.s].n}行业特别要看：${HINT[SECT[o.s].k]}。`);
  next.push('审计报告的意见类型和“关键审计事项”；前五名客户的占比。');
  const verdict = s.nf === 0 ? '五盏灯都没亮。这只说明它没有落进本页能识别的几种常见陷阱，不等于它是一家好公司——那是“发现好公司”要回答的问题。' : s.nf === 1 ? '亮了一盏灯。单独一个信号常有合理解释，但值得去附注里找到那个解释。' : s.nf === 2 ? '亮了两盏灯。历史上，同时出现两个疑点的公司，此后多半出现过亏损。' : `亮了${CN[s.nf]}盏灯。疑点叠加到这个程度，多数投资者需要的不是查清，而是走开。`;
  P.innerHTML = head + `<p class="lead"><span class="lamps" aria-label="亮了${s.nf}盏灯">${lamps}</span> ${verdict}</p><ul class="check">${items.join('')}</ul>
    <div class="trio" style="margin-top:14px"><div><h5>利润与现金</h5><p class="sub">每年归母净利润（金）、经营现金流（绿）</p><div id="rc1"></div></div><div><h5>杜邦三因子</h5><p class="sub">净利率、周转率、权益乘数，${FY0}–${FY1}</p><div id="rc2"></div></div><div><h5>净资产从哪里来</h5><p class="sub">实际的净资产，和“只靠自己赚”的净资产</p><div id="rc3"></div></div></div>
    <h5 style="margin:14px 0 0;font-size:13px">下一步，打开年报查这些</h5><ul class="next">${next.map(t => `<li>${t}</li>`).join('')}</ul>${ah ? `<p class="say">它也在港股上市（H股 ${ah.h}），${HK.date}收盘时A股比H股${ah.p >= 0 ? '贵' : '便宜'} ${pct0(Math.abs(ah.p))}。<a href="ganggu.html#co=${o.code}">在“港股通”里看</a></p>` : ''}`;
  drawRepCharts(o, s);
}
function drawRepCharts(o, s) {
  const e1 = $('rc1'), e2 = $('rc2'), e3 = $('rc3'); if (!e1) return;
  const ks = d3.range(NY), H = 120;
  { // 利润与现金
    const { svg, w } = svgIn(e1, H, '每年的利润与经营现金流'); const mx = d3.max(ks, k => Math.max(Math.abs(o.ni[k]) || 0, Math.abs(o.ocf[k]) || 0)) || 1;
    const bx = d3.scaleBand(ks, [2, w - 2]).padding(0.16), mid = H / 2 - 4, yb = v => v / mx * (H / 2 - 14);
    svg.append('line').attr('class', 'zero').attr('x1', 0).attr('x2', w).attr('y1', mid).attr('y2', mid);
    for (const k of ks) { const bw = bx.bandwidth() / 2, pre = FY0 + k < o.ly ? .35 : 1;
      if (isFinite(o.ni[k])) svg.append('path').attr('d', colPath(bx(k), mid, bw, Math.max(0.6, Math.abs(yb(o.ni[k]))) * Math.sign(o.ni[k] || 1))).attr('fill', cssv('--c4')).attr('opacity', pre);
      if (isFinite(o.ocf[k])) svg.append('path').attr('d', colPath(bx(k) + bw, mid, bw, Math.max(0.6, Math.abs(yb(o.ocf[k]))) * Math.sign(o.ocf[k] || 1))).attr('fill', cssv('--c1')).attr('opacity', pre); }
    svg.append('text').attr('class', 'tick').attr('x', 2).attr('y', H - 2).text(FY0); svg.append('text').attr('class', 'tick').attr('x', w - 2).attr('y', H - 2).attr('text-anchor', 'end').text(FY1);
    nearest(svg, ks.map(k => ({ k })), d => bx(d.k) + bx.bandwidth() / 2, () => mid, { l: 0, r: w, t: 0, b: H - 12 }, d => `<div class="t">${FY0 + d.k}年</div>${rows(['归母净利润', isFinite(o.ni[d.k]) ? fmtYi(o.ni[d.k]) : '—', cssv('--c4')], ['经营现金流', isFinite(o.ocf[d.k]) ? fmtYi(o.ocf[d.k]) : '—', cssv('--c1')])}`);
  }
  { // 杜邦三因子
    const D = ks.map(k => { const d = dupontOf([o], k, k); return { k, m: d.m, t: d.t, em: d.em }; });
    const { svg, w } = svgIn(e2, H, '杜邦三因子'); const rowsH = (H - 14) / 3;
    [['m', '净利率', v => pct1(v), cssv('--c4')], ['t', '周转率', v => x2(v), cssv('--c3')], ['em', '权益乘数', v => x2(v), cssv('--c2')]].forEach(([key, lab, f, c], i) => {
      const vals = D.map(d => d[key]).filter(isFinite); if (!vals.length) return;
      const y0 = 2 + i * rowsH, lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1;
      const x = d3.scaleLinear([0, NY - 1], [64, w - 34]), y = d3.scaleLinear([lo - pad, hi + pad], [y0 + rowsH - 6, y0 + 4]);
      svg.append('text').attr('class', 'lab dim').attr('x', 0).attr('y', y0 + rowsH / 2 + 2).text(lab);
      svg.append('path').attr('d', d3.line().defined(d => isFinite(d[key])).x(d => x(d.k)).y(d => y(d[key]))(D)).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 1.8);
      const lastD = D.slice().reverse().find(d => isFinite(d[key])); if (lastD) svg.append('text').attr('class', 'lab').attr('x', w - 30).attr('y', y(lastD[key]) + 4).text(f(lastD[key]));
    });
    svg.append('text').attr('class', 'tick').attr('x', 64).attr('y', H - 1).text(FY0); svg.append('text').attr('class', 'tick').attr('x', w - 34).attr('y', H - 1).attr('text-anchor', 'end').text(FY1);
  }
  { // 净资产从哪里来
    const k0 = ks.find(k => isFinite(o.eq[k]) && o.eq[k] > 0 && FY0 + k > o.ly - 1);
    const { svg, w } = svgIn(e3, H, '净资产与只靠利润积累的净资产');
    if (k0 === undefined) { svg.append('text').attr('class', 'lab dim').attr('x', 0).attr('y', 20).text('数据不足'); return; }
    const pts = []; let own = o.eq[k0];
    for (let k = k0; k < NY; k++) { const n = o.ni[k]; if (isFinite(n)) own += n; pts.push({ y: FY0 + k, eq: o.eq[k + 1], own }); }
    const x = d3.scaleLinear([FY0 + k0, FY1], [4, w - 4]), mx = d3.max(pts, d => Math.max(d.eq || 0, d.own)), mn = Math.min(0, d3.min(pts, d => Math.min(d.eq || 0, d.own)));
    const y = d3.scaleLinear([mn, mx * 1.05], [H - 16, 4]);
    svg.append('line').attr('class', 'zero').attr('x1', 0).attr('x2', w).attr('y1', y(0)).attr('y2', y(0));
    svg.append('path').attr('d', d3.line().defined(d => isFinite(d.eq)).x(d => x(d.y)).y(d => y(d.eq))(pts)).attr('fill', 'none').attr('stroke', cssv('--fg')).attr('stroke-width', 2);
    svg.append('path').attr('d', d3.line(d => x(d.y), d => y(d.own))(pts)).attr('fill', 'none').attr('stroke', cssv('--c1')).attr('stroke-width', 1.6).attr('stroke-dasharray', '4 3');
    svg.append('text').attr('class', 'tick').attr('x', 4).attr('y', H - 2).text(FY0 + k0); svg.append('text').attr('class', 'tick').attr('x', w - 4).attr('y', H - 2).attr('text-anchor', 'end').text('实线：净资产 · 虚线：期初 + 累计利润');
    nearest(svg, pts, d => x(d.y), d => y(d.eq), { l: 0, r: w, t: 0, b: H - 14 }, d => `<div class="t">${d.y}年末</div>${rows(['归母净资产', fmtYi(d.eq)], ['期初 + 累计利润', fmtYi(d.own)], [d.eq >= d.own ? '向外要的钱' : '还给股东的钱', fmtYi(Math.abs(d.eq - d.own))])}`);
  }
}
// 同时亮起三盏灯以上的公司
let SIG_SCOPE = 'all', SIG_ALL = false;
function drawSig() {
  const L = LIVE.filter(o => !isFin(o)).map(o => ({ o, s: sig(o) })).filter(d => d.s && d.s.nf >= 3);
  const base = LIVE.filter(o => !isFin(o) && sig(o)).length;
  $('sigSub').textContent = `${SY0}–${SY1}年的年报（上市较晚的从上市后第一年起，至少三年），${cnt(base)} 家非金融公司里有 ${cnt(L.length)} 家同时亮起三盏灯以上。按亮灯数、再按市值排序。点一行看完整报告。`;
  const sel = $('sigScope');
  if (!sel.options.length) { const by = SECT.map(s => [s, L.filter(d => d.o.s === s.i).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]); sel.innerHTML = `<option value="all">全部（${L.length}家）</option>` + by.map(([s, n]) => `<option value="${s.i}">${s.n}（${n}家）</option>`).join(''); sel.onchange = () => { SIG_SCOPE = sel.value; SIG_ALL = false; drawSig(); }; }
  const R = L.filter(d => SIG_SCOPE === 'all' || d.o.s === +SIG_SCOPE).sort((a, b) => (b.s.nf - a.s.nf) || (cap(b.o, LAST) - cap(a.o, LAST)));
  const show = SIG_ALL ? R : R.slice(0, 25);
  $('tSig').innerHTML = `<thead><tr><th>公司</th><th class="l hide-s">国</th><th class="l">灯</th><th>含金量</th><th>亏损年数</th><th class="hide-s">外部融资</th><th>负债率</th><th class="hide-s">商誉</th><th>市值</th></tr></thead><tbody>${show.map(({ o, s }) => `<tr class="pick" data-c="${o.code}"><td><span class="co-n">${esc(o.name)}</span><span class="co-c">${o.code}</span></td><td class="l hide-s">${SECT[o.s].n}</td><td class="l"><span class="lamps">${['cash', 'loss', 'ext', 'lev', 'gw'].map(k => `<i class="${s.f[k] ? 'on' : ''}"></i>`).join('')}</span></td><td>${isFinite(s.cc) ? x2(s.cc) : '—'}</td><td>${s.loss}</td><td class="hide-s">${isFinite(s.ext) ? pct0(s.ext * 100) : '—'}</td><td>${isFinite(s.lev) ? Math.round(s.lev) + '%' : '—'}</td><td class="hide-s">${isFinite(o.gw) ? (o.gw >= 250 ? '≥250%' : o.gw + '%') : '—'}</td><td>${fmtYi(cap(o, LAST))}</td></tr>`).join('')}</tbody>`;
  $('tSig').querySelectorAll('tr.pick').forEach(r => r.onclick = () => showReport(byCode.get(r.dataset.c), true));
  const mb = $('moreSig'); mb.hidden = R.length <= 25; mb.textContent = SIG_ALL ? '收起' : `显示全部 ${R.length} 家`; mb.onclick = () => { SIG_ALL = !SIG_ALL; drawSig(); };
  const nf = LIVE.filter(o => !isFin(o)).map(sig).filter(Boolean);
  $('t7').innerHTML = `用前面四课的方法，给每家非金融公司点五盏灯。今天 ${cnt(nf.length)} 家公司里，<b>${cnt(nf.filter(s => s.nf === 0).length)}</b> 家一盏都没亮，${cnt(nf.filter(s => s.nf >= 2).length)} 家亮了两盏以上。输入一家公司，看它亮了哪几盏、在同行里处在什么位置，以及下一步该去年报里查什么。`;
}
function initSearch() {
  const q = $('q'), box = $('suggest'); let items = [], on = -1;
  const KEYS = CO.map(o => ({ o, k: [o.name, ...o.ren.map(r => r[1]), o.code].join(' ').toLowerCase() }));
  const pick = o => { box.hidden = true; q.value = ''; showReport(o, false); };
  q.addEventListener('input', () => { const s = q.value.trim().toLowerCase(); if (!s) { box.hidden = true; return; }
    items = KEYS.filter(x => x.k.includes(s)).map(x => x.o).sort((a, b) => ((b.b === LAST) - (a.b === LAST)) || (cap(b, b.b) - cap(a, a.b))).slice(0, 8); on = -1;
    box.innerHTML = items.length ? items.map((o, i) => `<button data-i="${i}">${esc(o.name)}<span>${o.code} · ${SECT[o.s].n}${o.b < LAST ? ' · 已退市' : ''}</span></button>`).join('') : '<div style="padding:8px 12px;color:var(--fg-3);font-size:13px">没有找到</div>';
    box.hidden = false; box.querySelectorAll('button').forEach(b => b.onclick = () => pick(items[+b.dataset.i])); });
  q.addEventListener('keydown', e => { if (box.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); on = (on + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; box.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === on)); }
    if (e.key === 'Enter') { e.preventDefault(); pick(items[Math.max(0, on)]); }
    if (e.key === 'Escape') box.hidden = true; });
  document.addEventListener('click', e => { if (!q.parentNode.contains(e.target)) box.hidden = true; });
  const QK = ['600518', '002354', '002069', '600519', '000333', '300750'];
  $('quick').innerHTML = QK.map(c => byCode.get(c)).filter(Boolean).map(o => `<button class="chip" data-c="${o.code}">${esc(o.name)}</button>`).join('');
  $('quick').querySelectorAll('button').forEach(b => b.onclick = () => showReport(byCode.get(b.dataset.c), false));
}

// ================================================================ 启动
function readTheme() { const a = document.documentElement.getAttribute('data-theme'); DARK = a ? a === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
function drawAll() { readTheme(); drawLadder(); drawDupont(); drawDriver(); drawLev(); drawCash(); drawTwo(); drawCcSec(); drawPay(); drawExt(); drawGw(); drawCases(); drawClues(); drawSig(); showReport(REP || byCode.get('600518'), false); }
document.querySelectorAll('.seg[data-fig]').forEach(el => { const k = el.dataset.fig; seg(el, WLAB, WSTATE[k], i => { WSTATE[k] = i; ({ lev: drawLev, cash: drawCash, ext: drawExt })[k](); }); });
initSearch(); drawAll();
let rsT = 0, lastW = innerWidth;
addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rsT); rsT = setTimeout(drawAll, 160); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawAll);
new MutationObserver(drawAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
function fromHash() { const h = location.hash.slice(1); if (h.startsWith('co=')) { const o = byCode.get(h.slice(3)); if (o) showReport(o, true); } }
fromHash(); addEventListener('hashchange', fromHash);
const navA = [...document.querySelectorAll('#bar nav a')], secs = navA.map(a => document.querySelector(a.getAttribute('href')));
const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) navA.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }, { rootMargin: '-45% 0px -50% 0px' });
secs.forEach(s => io.observe(s));
addEventListener('scroll', untip, { passive: true });
