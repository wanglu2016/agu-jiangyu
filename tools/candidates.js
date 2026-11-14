// 候选国版图：从 ../assets/data.js 和 ../assets/extra.js 出发，重算 2023年1月 起含候选国的每月版图，
// 输出 ../assets/candidates.js。不需要原始行情数据：公司市值、原行业归属和此前的版图都在 data.js 里。
// 做法与 export.py（选城）和 layout.js（幂图）一致，只是把候选国名单里的公司从母国划出，并从上一帧的版图接续。
const fs = require('fs'), path = require('path'), vm = require('vm');
const d3 = Object.assign({}, require('d3'), require('d3-weighted-voronoi'), require('d3-voronoi-map'));
const A = path.join(__dirname, '..', 'assets');
const win = {}; const box = vm.createContext({ window: win });
vm.runInContext(fs.readFileSync(path.join(A, 'data.js'), 'utf8'), box);
vm.runInContext(fs.readFileSync(path.join(A, 'extra.js'), 'utf8'), box);
const DATA = win.AGU_DATA, LAY = win.AGU_LAYOUT, EX = win.AGU_EXTRA;
const MONTHS = DATA.months, NM = MONTHS.length, K0 = DATA.sectors.length;
const T0 = MONTHS.indexOf(EX.candStart);
if (T0 < 1) throw new Error('candStart 不在月份表里');

// ---- 公司市值与归属
const raw = Buffer.from(DATA.caps, 'base64');
const Q = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
let off = 0;
const CO = DATA.co.map((c, j) => { const o = { j, code: c[0], sc: c[3], a: c[4], b: c[5], off }; off += o.b - o.a + 1; return o; });
const capAt = (o, t) => (t < o.a || t > o.b) ? 0 : Math.pow(10, Q[o.off + t - o.a] / 9000 - 2);
const baseSec = (o, t) => { let s = o.sc[0][1]; for (const [m, k] of o.sc) { if (m <= t) s = k; else break; } return s; };
const candOf = new Map();
EX.cand.forEach((c, i) => c.codes.forEach(code => candOf.set(code, K0 + i)));
const secAt = (o, t) => (t >= T0 && candOf.has(o.code)) ? candOf.get(o.code) : baseSec(o, t);
const K = K0 + EX.cand.length;
const keyOf = k => k < K0 ? DATA.sectors[k][0] : EX.cand[k - K0].k;

// ---- 每月每国选城（同 export.py）
function frameSel(t) {
  const by = Array.from({ length: K }, () => []);
  let T = 0;
  for (const o of CO) if (t >= o.a && t <= o.b) { const v = capAt(o, t); T += v; by[secAt(o, t)].push([o.j, v]); }
  const fr = [];
  for (let k = 0; k < K; k++) {
    const list = by[k]; if (!list.length) continue;
    list.sort((x, y) => y[1] - x[1]);
    const tot = list.reduce((s, x) => s + x[1], 0); if (!(tot > 0)) continue;
    const sel = [];
    for (let n = 0; n < list.length; n++) {
      if (n >= 18) break;
      if (n >= 3 && list[n][1] < 0.0005 * T) break;
      sel.push([list[n][0], +list[n][1].toFixed(2)]);
    }
    const rest = tot - sel.reduce((s, x) => s + x[1], 0), nrest = list.length - sel.length;
    if (nrest > 0 && rest > 0) {
      const sorted = sel.map(x => x[1]).sort((a, b) => a - b);
      const med = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : rest;
      const kk = Math.max(1, Math.min(10, nrest, Math.round(rest / Math.max(med * 1.6, 1e-9))));
      const w = []; for (let p = 1; p <= kk; p++) w.push(0.7 + 0.6 * (((p * 2654435761 + k * 97) % 1000) / 1000));
      const ws = w.reduce((s, x) => s + x, 0);
      for (let p = 0; p < kk; p++) sel.push([-(p + 1), +(rest * w[p] / ws).toFixed(3)]);
    }
    fr.push([k, +tot.toFixed(2), sel]);
  }
  return fr;
}

// ---- 幂图（同 layout.js）
const clip = LAY.clip, cx = 500, cy = 330, HA = 478, HB = 312;
const HOME = { bank: [0.02, 0.02], broker: [0.24, -0.1], insur: [0.2, 0.2], estate: [-0.26, 0.12], build: [-0.42, 0.3], bmat: [-0.47, 0.02],
  baijiu: [0.44, 0.38], food: [0.32, 0.6], appl: [0.12, 0.62], pharma: [0.62, 0.12], agri: [0.56, 0.58], light: [0.74, 0.4], trade: [0.3, 0.36],
  auto: [-0.18, 0.55], power: [0.0, 0.4], mach: [-0.44, 0.6], defense: [-0.66, 0.42],
  elec: [0.6, -0.22], semi: [0.82, -0.06], ai: [0.76, -0.38], telecom: [0.48, -0.42], soft: [0.84, 0.18], media: [0.7, 0.28],
  oil: [-0.1, -0.5], coal: [-0.36, -0.46], metal: [0.12, -0.62], steel: [-0.58, -0.28], chem: [0.3, -0.5],
  util: [-0.74, 0.0], transp: [-0.72, -0.5] };
// 候选国的初始位置：紧挨着母国在上一帧的位置（朝大陆中心偏一点），这样它会从母国边上“长”出来
const NEAR = new Map();
EX.cand.forEach(c => { const ki = DATA.sectors.findIndex(s => s[0] === c.near); const p = LAY.frames[T0 - 1].find(x => x[0] === ki);
  NEAR.set(c.k, [p[1] + (cx - p[1]) * 0.08 + 6, p[2] + (cy - p[2]) * 0.08 + 6]); });
const home = k => { if (NEAR.has(k)) return NEAR.get(k); const h = HOME[k]; return [cx + h[0] * HA * 0.86, cy + h[1] * HB * 0.86]; };
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function insidePoint(poly, prng, near) {
  if (near && d3.polygonContains(poly, near)) return near;
  const c = d3.polygonCentroid(poly);
  if (near) for (let f = 0.8; f >= 0; f -= 0.2) { const p = [c[0] + (near[0] - c[0]) * f, c[1] + (near[1] - c[1]) * f]; if (d3.polygonContains(poly, p)) return p; }
  const ex = d3.extent(poly, p => p[0]), ey = d3.extent(poly, p => p[1]);
  for (let k = 0; k < 200; k++) { const p = [ex[0] + prng() * (ex[1] - ex[0]), ey[0] + prng() * (ey[1] - ey[0])]; if (d3.polygonContains(poly, p)) return p; }
  return c;
}
let fails = 0;
function runMap(data, clipPoly, prevPos, prevW, seed, homeFn) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try { return runMap1(data, clipPoly, attempt < 4 ? prevPos : new Map(), attempt === 0 ? prevW : new Map(), seed + attempt * 97, homeFn, attempt); }
    catch (e) { fails++; }
  }
  throw new Error('layout failed');
}
function runMap1(data, clipPoly, prevPos, prevW, seed, homeFn, attempt) {
  const prng = seeded(seed), area = Math.abs(d3.polygonArea(clipPoly));
  const sim = d3.voronoiMapSimulation(data).weight(d => d.v).clip(clipPoly)
    .convergenceRatio(0.006).maxIterationCount(400).minWeightRatio(0.01).prng(prng)
    .initialPosition(d => { let p = prevPos.get(d.id) || (homeFn ? homeFn(d) : null);
      if (p && attempt > 0) p = [p[0] + (prng() - 0.5) * attempt * 6, p[1] + (prng() - 0.5) * attempt * 6];
      return insidePoint(clipPoly, prng, p); })
    .initialWeight(d => { const w = prevW.get(d.id); return (w && w > 0) ? w : area / data.length * 0.05; })
    .stop();
  let st = sim.state(); while (!st.ended) { sim.tick(); st = sim.state(); }
  return st;
}

// ---- 从上一帧（T0-1）的版图接续
let cPos = new Map(), cW = new Map(); const sub = {};
for (const c of LAY.frames[T0 - 1]) {
  if (c[1] === null) continue;
  cPos.set(c[0], [c[1], c[2]]); cW.set(c[0], c[3]);
  const S = sub[c[0]] = { pos: new Map(), w: new Map() };
  for (const z of c[4]) { S.pos.set(z[0], [z[1], z[2]]); S.w.set(z[0], z[3]); }
}
const frames = []; let worst = 0;
for (let t = T0; t < NM; t++) {
  const fr = frameSel(t);
  const data = fr.map(([k, v]) => ({ id: k, k: keyOf(k), v }));
  const st = runMap(data, clip, cPos, cW, 1000 + t, d => home(d.k));
  worst = Math.max(worst, st.convergenceRatio);
  const ncPos = new Map(), ncW = new Map(), ctry = [];
  for (const poly of st.polygons) { if (!poly) continue; const s = poly.site, k = s.originalObject.data.originalData.id; ncPos.set(k, [s.x, s.y]); ncW.set(k, s.weight); }
  for (const [k, v, cells] of fr) {
    const poly = st.polygons.find(p => p && p.site.originalObject.data.originalData.id === k);
    if (!poly) { ctry.push([k, null]); continue; }
    const s = poly.site, S = sub[k] || (sub[k] = { pos: new Map(), w: new Map() });
    const cdata = cells.map(c => ({ id: c[0], v: Math.max(c[1], 1e-3) }));
    let cst;
    if (cdata.length === 1) cst = { polygons: [Object.assign(poly.slice(), { site: { x: s.x, y: s.y, weight: 0, originalObject: { data: { originalData: cdata[0] } } } })] };
    else {
      const prevC = cPos.get(k), dx = prevC ? s.x - prevC[0] : 0, dy = prevC ? s.y - prevC[1] : 0;
      const moved = new Map(); for (const [id, p] of S.pos) moved.set(id, [p[0] + dx, p[1] + dy]);
      cst = runMap(cdata, poly, moved, S.w, 7000 + t * 31 + k, null);
    }
    const npos = new Map(), nw = new Map(), arr = [];
    for (const cp of cst.polygons) { if (!cp) continue; const cs = cp.site, id = cs.originalObject.data.originalData.id;
      npos.set(id, [cs.x, cs.y]); nw.set(id, cs.weight); arr.push([id, +cs.x.toFixed(1), +cs.y.toFixed(1), Math.round(cs.weight)]); }
    S.pos = npos; S.w = nw;
    ctry.push([k, +s.x.toFixed(1), +s.y.toFixed(1), +s.weight.toFixed(1), arr]);
  }
  cPos = ncPos; cW = ncW; frames.push(ctry);
  if ((t - T0) % 8 === 0) console.log(t, MONTHS[t], 'conv', st.convergenceRatio.toFixed(4), 'iters', st.iterationCount);
}
console.log('worst conv', worst, 'fails', fails);
const out = { t0: T0, frames };
const file = path.join(A, 'candidates.js');
fs.writeFileSync(file, '/* A股疆域图候选国版图：' + EX.candStart + ' 起含候选国的每月版图。由 tools/candidates.js 生成，勿手改 */\nwindow.AGU_CAND=' + JSON.stringify(out) + ';\n');
console.log(file, Math.round(fs.statSync(file).size / 1024), 'KB');
