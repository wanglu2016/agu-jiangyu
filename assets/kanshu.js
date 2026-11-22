/* 看数：任选股票、日期、指标，看数值、分位、平均得分与走势。数据见 tools/make_kanshu.py */
'use strict';
(() => {
const X = window.AGU_KS_IDX;
const $ = (s, el = document) => el.querySelector(s);
const isF = Number.isFinite;
const NW = X.months.length, LASTT = NW - 1, MAXS = 10;
const VFD = Object.fromEntries(X.vf.map(f => [f[0], f]));
const CO = X.co, BY = new Map(CO.map((c, i) => [c[0], i]));
const SECN = X.sec.map(s => s[1]), SECK = X.sec.map(s => s[0]);
const AH = new Map(X.hk.ah.map(r => [r[0], r]));          // A股代码 → [A股代码, H股代码, H股价(港元), A股价(元)]（和 hk.js 同序）
const H2A = new Map(X.hk.ah.map(r => [r[1], r[0]]));      // H股代码 → A股代码
const HO = new Map(X.hk.only.map(r => [r[0], r]));        // 只在港股上市 → [代码, 名称, 股价, 市值(亿港元), 股息率, 市盈率, 行业]
const FIN = new Set(['bank', 'broker', 'insur']);

// ------------------------------------------------------------------ 格式
const fx = (v, d = 1) => v.toFixed(d).replace('-', '−');
const sgn = (v, d = 1) => !isF(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%';
const cls = v => !isF(v) || Math.abs(v) < 0.05 ? 'flat' : v > 0 ? 'up' : 'down';
const yi = v => !isF(v) ? '—' : Math.abs(v) >= 10000 ? (v / 10000).toFixed(2) + '万亿' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString('zh-CN') + '亿' : Math.abs(v) >= 1 ? v.toFixed(1) + '亿' : Math.round(v * 10000).toLocaleString('zh-CN') + '万';
const yiS = v => !isF(v) ? '—' : (v < 0 ? '−' : '') + yi(Math.abs(v));
const ymCN = t => { const s = X.months[t]; return `${+s.slice(0, 4)}年${+s.slice(5, 7)}月`; };
const dCN = t => { const s = X.days[t]; return `${+s.slice(0, 4)}年${+s.slice(5, 7)}月${+s.slice(8, 10)}日`; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const strip = s => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
function board(code, d) {
  if (code.startsWith('688')) return ['科创板', 20];
  if (/^30[01]/.test(code)) return ['创业板', d >= '2020-08-24' ? 20 : 10];
  if (/^00[23]/.test(code)) return [d < '2021-04-06' ? '中小板' : '深市主板', 10];
  if (code.startsWith('6')) return ['沪市主板', 10];
  return ['深市主板', 10];
}
const FLAGN = ['利润年年为正、现金不到一半', '有亏损年份', '向股东要的钱超过期初净资产', '负债率70%以上'];

// ------------------------------------------------------------------ 读数据：<script> 加载（离线双击也能用），base64 → zlib 解压
const PEND = {}, SC = new Map(), MC = new Map();
window.AGU_KS = { s(code, z) { const f = PEND['s' + code]; if (f) f(z); }, m(mon, z) { const f = PEND['m' + mon]; if (f) f(z); } };
function loadJS(src, key) {
  return new Promise((res, rej) => {
    PEND[key] = z => { delete PEND[key]; res(z); };
    const el = document.createElement('script'); el.src = src;
    el.onload = () => { el.remove(); if (PEND[key]) { delete PEND[key]; rej(new Error(src)); } };
    el.onerror = () => { el.remove(); delete PEND[key]; rej(new Error(src)); };
    document.head.appendChild(el);
  });
}
async function unz(z) {
  const bin = atob(z), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const st = new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(st).arrayBuffer());
}
function i16(u, off, n) { const a = new Int16Array(n); for (let i = 0; i < n; i++) { const v = u[off + i] | (u[off + n + i] << 8); a[i] = v > 32767 ? v - 65536 : v; } return a; }
function getStock(code) {
  if (SC.has(code)) return SC.get(code);
  const pr = loadJS(`assets/ks/s/${code}.js`, 's' + code).then(unz).then(u => {
    const ci = BY.get(code), c = CO[ci], a = c[3], b = c[4], n = b - a + 1; let off = 0; const v = {}, p = {};
    for (const f of X.vf) { v[f[0]] = i16(u, off, n); off += 2 * n; }
    for (const k of X.pf) { p[k] = u.subarray(off, off + n); off += n; }
    const ni = i16(u, off, X.ny); off += 2 * X.ny;
    return { ci, code, a, b, n, v, p, ni, adj: new Float32Array(u.slice(off, off + 4 * n).buffer) };
  });
  pr.catch(() => SC.delete(code)); SC.set(code, pr); return pr;
}
function getMonth(t) {
  if (MC.has(t)) return MC.get(t);
  const pr = loadJS(`assets/ks/m/${X.months[t]}.js`, 'm' + X.months[t]).then(unz).then(u => {
    const K = X.pf.length, n = u.length / (4 + K), ids = i16(u, 0, n);
    return { n, ids, ref: u.subarray(2 * n, 3 * n), sec: u.subarray(3 * n, 4 * n), P: u.subarray(4 * n), K };
  });
  pr.catch(() => MC.delete(t)); MC.set(t, pr); return pr;
}
const dq = q => { if (q === -32768) return NaN; const a = Math.abs(q); return a === 0 ? 0 : Math.sign(q) * 10 ** ((a - 1) / 3200 - 4); };
function V(S, k, t) {
  const i = t - S.a; if (i < 0 || i >= S.n) return NaN;
  const q = S.v[k][i]; if (q === -32768) return NaN;
  const f = VFD[k]; return f[1] === 'g' ? 10 ** (q / 2000) : f[1] === 'l' ? q / (f[2] || 1) : dq(q);
}
const ADJ = (S, t) => { const i = t - S.a; return i < 0 || i >= S.n ? NaN : S.adj[i]; };
function P(S, k, t) { const i = t - S.a; if (i < 0 || i >= S.n) return NaN; const p = S.p[k][i]; return p === 255 ? NaN : p; }
const fyk = t => { const y = +X.months[t].slice(0, 4), m = +X.months[t].slice(5, 7); return (m >= 5 ? y - 1 : y - 2) - X.fy0; };
const niFY = (S, k) => k >= 0 && k < X.ny ? dq(S.ni[k]) : NaN;
const niHist = (S, t) => { const k = fyk(t); return Array.from({ length: 10 }, (_, i) => niFY(S, k - 9 + i)); };
const secOf = (S, t) => { const s = V(S, 'sec', t); return isF(s) && s >= 0 ? s : -1; };
const isFinCo = (S, t) => { const s = secOf(S, t); return s >= 0 && FIN.has(SECK[s]); };

// ------------------------------------------------------------------ 二十八项指标
// cell(S, t) → { v: 显示（HTML）, cv: 着色用的数 }；pk：分位取哪个字段（'sea' 是海平面的历史分位；null 没有分位，不计分）
const pct = (v, u, d = 1) => isF(v) ? `${fx(v, d)}${u}` : '—';
const IND = [
  { k: 'sec', cat: '公司', nm: '行业', pk: null, cell: (S, t) => ({ v: secOf(S, t) >= 0 ? SECN[secOf(S, t)] : '—' }), d: '当时所属的“国”（30 个行业之一）',
    hint: '同一个市盈率，在银行和在半导体里意思完全不同。先知道它属于哪个国，别的数字才有参照。' },
  { k: 'cap', cat: '公司', nm: '总市值', pk: 'cap', cell: (S, t) => ({ v: yi(V(S, 'cap', t)) + (isF(V(S, 'cap', t)) ? '元' : '') }), d: '月末收盘价 × 总股本（H股等境外股份按A股价格折算）',
    hint: '小公司的数字波动大，少量资金就能推动价格；大公司的“便宜”更可信，也更少见。' },
  { k: 'list', cat: '公司', nm: '上市时间', pk: 'list', cell: (S, t) => { const l = V(S, 'list', t); return { v: !isF(l) ? '—' : l < 0 ? '2000年前' : l < 24 ? `${l}个月` : `${(l / 12).toFixed(1)}年` }; },
    d: '从第一个交易日算起；分位越高，上市越久', hint: '上市没几年的公司，历史数据短；上市前后的好成绩，可能有一部分是为上市准备的。' },
  { k: 'board', cat: '公司', nm: '板块', pk: null, cell: (S, t) => { const [b, l] = board(S.code, X.days[t]); return { v: `${b}<small> ±${l}%</small>` }; }, d: '上市板块和当时的涨跌幅限制',
    hint: '±20% 的板块，一天的涨跌能抵上主板两天；同样一条消息，价格的反应更剧烈。' },
  { k: 'px', cat: '价格', nm: '股价', pk: 'px', cell: (S, t) => ({ v: pct(V(S, 'px', t), '元', 2) }), d: '那天的收盘价，不复权',
    hint: '股价高低不说明贵贱，贵不贵要看价格背后的利润和净资产。几块钱的股票常给人“便宜”的错觉。' },
  { k: 'chg', cat: '价格', nm: '当天涨跌', pk: 'chg', cell: (S, t) => { const v = V(S, 'chg', t), l = V(S, 'lim', t); return { v: sgn(v, 2) + (l === 1 ? ' <span class="tag f">涨停</span>' : l === -1 ? ' <span class="tag f">跌停</span>' : ''), cv: v }; },
    d: '月末最后一个交易日的涨跌', hint: '一天的涨跌几乎全是噪音。值得留意的只有涨停、跌停：它意味着当天可能买不进或卖不出。' },
  { k: 'm1', cat: '价格', nm: '近1个月涨跌', sh: '近1月', pk: 'm1', cell: (S, t) => ({ v: sgn(V(S, 'm1', t)), cv: V(S, 'm1', t) }), d: '含分红（复权）',
    hint: '上个月涨得多的，下个月既可能接着涨，也可能回吐。一个月的涨跌，几乎说明不了生意的好坏。' },
  { k: 'm3', cat: '价格', nm: '近3个月涨跌', sh: '近3月', pk: 'm3', cell: (S, t) => ({ v: sgn(V(S, 'm3', t)), cv: V(S, 'm3', t) }), d: '含分红（复权）',
    hint: '三个月的涨跌常常被讲成一个故事。先问一句：这段时间里，利润变了多少？' },
  { k: 'm12', cat: '价格', nm: '近12个月涨跌', sh: '近12月', pk: 'm12', cell: (S, t) => ({ v: sgn(V(S, 'm12', t)), cv: V(S, 'm12', t) }), d: '含分红（复权）',
    hint: '一年涨了几倍的股票，常见的结局是价格跑在利润前面；跌了一半的，也可能只是回到合理。' },
  { k: 'm36', cat: '价格', nm: '近3年涨跌', sh: '近3年', pk: 'm36', cell: (S, t) => { const v = V(S, 'm36', t); return { v: isF(v) ? sgn(v) : '不满三年', cv: v }; }, d: '含分红（复权）；上市不满三年的没有',
    hint: '到了三年，涨跌开始和利润有关。涨得多的，看利润是否同步；跌得多的，看是生意坏了还是原来太贵。' },
  { k: 'hi52', cat: '价格', nm: '距52周最高', sh: '距52周高', pk: 'hi52', cell: (S, t) => { const v = V(S, 'hi52', t); return { v: !isF(v) ? '—' : v > -0.05 ? '最高点' : `低${Math.abs(v).toFixed(1)}%` }; },
    d: '和过去 250 个交易日的最高价相比（复权）；分位越高，离高点越近', hint: '从高点跌了很多不等于便宜：如果高点本身是泡沫，跌掉一半也可能仍然贵。' },
  { k: 'vol', cat: '价格', nm: '波动率', pk: 'vol', cell: (S, t) => ({ v: pct(V(S, 'vol', t), '%', 0) }), d: '近 60 个交易日，年化',
    hint: '波动率说的是坐车有多颠，不是目的地在哪里。颠得越厉害，越容易在低点被吓下车。' },
  { k: 'amt', cat: '成交', nm: '日均成交额', sh: '成交额', pk: 'amt', cell: (S, t) => ({ v: yi(V(S, 'amt', t)) + (isF(V(S, 'amt', t)) ? '元' : '') }), d: '近 20 个交易日平均',
    hint: '成交太少的股票，进得去、出不来；你自己的买卖就可能推动价格。' },
  { k: 'turn', cat: '成交', nm: '成交额占总市值（换手率）', sh: '换手率', pk: 'turn', cell: (S, t) => ({ v: pct(V(S, 'turn', t), '%', 2) }), d: '每天，近 20 个交易日平均；行情软件的换手率按流通股算，会比这里高',
    hint: '这个比例很高，说明它正被热炒，价格更多由情绪决定。' },
  { k: 'pe', cat: '估值', nm: '市盈率（静态）', sh: '市盈率', pk: 'pe', cell: (S, t) => { const v = V(S, 'pe', t); if (!isF(v)) return { v: niHist(S, t)[9] < 0 ? '亏损' : '—' }; return { v: v >= 3270 ? '>3000倍' : `${v.toFixed(1)}倍` }; },
    d: '总市值 ÷ 最近一期年报的归母净利润', hint: '低市盈率可能是便宜，也可能是利润正处在周期高点、明年就要下滑。下结论之前，先看十年利润。' },
  { k: 'peself', cat: '估值', nm: '市盈率在自己五年里的位置', sh: '自身PE位置', pk: 'peself', cell: (S, t) => { const v = V(S, 'peself', t); return { v: isF(v) ? `第${v}位` : '—' }; },
    d: '和它自己过去五年每个月的市盈率比：0 最便宜，100 最贵；这个数本身就当分位用', hint: '和自己的历史比，往往比和别的公司比更有意义。但如果生意本身变差了，“比过去便宜”就不算便宜。' },
  { k: 'pb', cat: '估值', nm: '市净率', pk: 'pb', cell: (S, t) => ({ v: pct(V(S, 'pb', t), '倍', 2) }), d: '总市值 ÷ 归母净资产',
    hint: '市净率低于1，常见于银行、钢铁、地产：资产的账面值可能不实，或者它挣不到像样的回报。高市净率要靠高回报率撑着。' },
  { k: 'ps', cat: '估值', nm: '市销率', pk: 'ps', cell: (S, t) => ({ v: pct(V(S, 'ps', t), '倍', 2) }), d: '总市值 ÷ 营收',
    hint: '亏损或利润很薄的公司，常用市销率看估值。只有收入最后能变成利润，这个数字才有意义。' },
  { k: 'roe', cat: '财务', nm: '净资产收益率', sh: '回报率', pk: 'roe', cell: (S, t) => ({ v: pct(V(S, 'roe', t), '%') }), d: '归母净利润 ÷ 年初年末平均的归母净资产（最近一期年报）',
    hint: '一年的回报率可能来自周期高点或一次性收益。连续多年都高，才更像是生意本身的能力。' },
  { k: 'roe5', cat: '财务', nm: '近五年平均净资产收益率', sh: '五年回报率', pk: 'roe5', cell: (S, t) => ({ v: pct(V(S, 'roe5', t), '%') }), d: '截至最近一期年报的五个财年，不足五年按已有年份（至少三年）',
    hint: '能长期维持15%以上回报率的公司很少。但平均数会掩盖下滑的趋势，最好再看逐年的利润。' },
  { k: 'revg', cat: '财务', nm: '营收增长', pk: 'revg', cell: (S, t) => ({ v: sgn(V(S, 'revg', t)), cv: V(S, 'revg', t) }), d: '最近一期年报比上一年',
    hint: '收入增长比利润增长更难靠一次性收益撑起来；但一笔并购也能让收入一夜变大。' },
  { k: 'nig', cat: '财务', nm: '净利润增长', sh: '利润增长', pk: 'nig', cell: (S, t) => {
      const h = niHist(S, t), a = h[8], b = h[9];
      if (!isF(a) || !isF(b)) return { v: '—' };
      if (a > 0 && b > 0) return { v: sgn((b / a - 1) * 100), cv: b - a };
      return { v: a > 0 ? '由盈转亏' : b > 0 ? '扭亏为盈' : '继续亏损', cv: a > 0 ? -1 : b > 0 ? 1 : -1 };
    }, d: '最近一期年报比上一年的归母净利润；上一年亏损的没有分位', hint: '利润增长快不一定好：可能来自上一年的低基数、卖资产的一次性收益，或者周期的高点。' },
  { k: 'ni10', cat: '财务', nm: '近十年利润', sh: '十年利润', pk: 'ni', cell: (S, t) => {
      const h = niHist(S, t), ok = h.filter(isF), loss = ok.filter(v => v < 0).length;
      if (!ok.length) return { v: '—' };
      return { v: `${yiS(h[9])}<small> ·${ok.length}年亏${loss}</small>`, cv: h[9] };
    }, d: '最近一期年报的归母净利润，后面是“有几年年报、其中亏几年”；分位按最近一年利润的大小', hint: '利润是稳步增长、大起大落，还是只在最近一年变好？它决定了别的估值数字该怎么读。' },
  { k: 'cash', cat: '财务', nm: '利润含金量', sh: '含金量', pk: 'cash', cell: (S, t) => { if (isFinCo(S, t)) return { v: '不适用' }; const v = V(S, 'cash', t); return { v: isF(v) ? `${fx(v, 2)}倍` : '—' }; },
    d: '近三年经营现金流合计 ÷ 归母净利润合计；金融业不适用', hint: '利润是观点，现金是事实。长期低于0.5倍，要看钱是不是压在了应收账款和存货里。' },
  { k: 'lev', cat: '财务', nm: '资产负债率', sh: '负债率', pk: 'lev', cell: (S, t) => ({ v: pct(V(S, 'lev', t), '%', 0) }), d: '最近一期年报',
    hint: '负债放大回报，也放大亏损。银行、地产天生负债率高，要和同行比。' },
  { k: 'flag', cat: '财务', nm: '财报疑点', sh: '疑点', pk: 'flag', cell: (S, t) => {
      if (isFinCo(S, t)) return { v: '不适用' };
      const v = V(S, 'flag', t), b = V(S, 'fbits', t); if (!isF(v)) return { v: '—' };
      const nm = FLAGN.filter((_, i) => b & (1 << i)); return { v: `${v}个`, title: nm.join('；') };
    }, d: '财报侦探的四条线索，看截至当时的五个财年；分位越高，疑点越多', hint: '疑点越多，此后越容易亏损；但它只是统计信号，不等于造假。' },
  { k: 'sea', cat: '大环境', nm: '海平面', pk: 'sea', cell: (S, t) => ({ v: `${X.sea[t].toFixed(0)}%` }), d: '全市场市值 ÷ 近一年GDP；当天每只股票都一样，分位是和 2000 年以来每个月比',
    hint: '水位越高，此后几年越难赚钱；但它对下一个月的涨跌几乎没有解释力。' },
  { k: 'sec12', cat: '大环境', nm: '行业近12个月', sh: '行业12月', pk: 'sec12', cell: (S, t) => ({ v: sgn(V(S, 'sec12', t)), cv: V(S, 'sec12', t) }), d: '它所在的国，总市值近 12 个月的变化（含新上市）',
    hint: '一个行业一年里市值大涨，常常是新钱和新公司一起涌进来。版图最大的时候，往往也是最贵的时候。' },
];
const IK = Object.fromEntries(IND.map(d => [d.k, d]));
const CATS = ['公司', '价格', '成交', '估值', '财务', '大环境'];
const shName = d => d.sh || d.nm;
function pOf(S, d, t) {
  if (!d.pk) return NaN;
  if (d.pk === 'sea') return X.seaP[t];
  return P(S, d.pk, t);
}
function scoreOf(S, t, inds, flip) {
  let s = 0, n = 0, miss = 0;
  for (const k of inds) {
    const d = IK[k]; if (!d.pk) continue;
    let p = pOf(S, d, t); if (!isF(p)) { p = 50; miss++; }
    if (flip && flip.has(k)) p = 100 - p;
    s += p; n++;
  }
  return n ? { v: s / n, n, miss } : { v: NaN, n: 0, miss: 0 };
}
// 三套策略（来自小游戏题库的回测，见“口径”）
const STRAT = [
  { id: 'A1', nm: '一月 A1', inds: ['turn', 'cap', 'vol', 'm3'], act: (s, w) => w < 70 ? (s <= 65 ? 'buy' : 'hold') : w < 80 ? (s > 65 ? 'sell' : s <= 45 ? 'buy' : 'hold') : (s > 45 ? 'sell' : 'hold'), th: [45, 65] },
  { id: 'A3', nm: '三月 A3', inds: ['turn', 'cap', 'vol', 'm1'], act: s => s <= 70 ? 'buy' : 'sell', th: [70] },
  { id: 'A12', nm: '一年 A12', inds: ['turn', 'cap', 'vol', 'pb'], act: s => s <= 65 ? 'buy' : s > 70 ? 'sell' : 'hold', th: [65, 70] },
];
const ACTN = { buy: '买入', sell: '卖出', hold: '不动' };
const PRESET = { A1: STRAT[0].inds, A3: STRAT[1].inds, A12: STRAT[2].inds, six: ['turn', 'cap', 'vol', 'pb', 'm3', 'm1'], none: [] };
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const stratMatch = () => ST.flip.size ? null : STRAT.find(s => sameSet(s.inds, ST.inds)) || null;
function later(S, t, h) {
  const a0 = ADJ(S, t), t2 = t + h, m = X.mkt[t] ? X.mkt[t][h === 1 ? 0 : h === 3 ? 1 : 2] : null;
  if (!isF(a0)) return { r: NaN, m };
  if (t2 > LASTT) return { r: NaN, m, wait: true };
  let a1, gone = false;
  if (t2 <= S.b) a1 = ADJ(S, t2); else if (S.b < LASTT) { a1 = ADJ(S, S.b); gone = true; } else return { r: NaN, m, wait: true };
  return { r: (a1 / a0 - 1) * 100, m, gone };
}

// ------------------------------------------------------------------ 状态与地址栏
const DEMO = ['600519', '300750', '600036', '601318', '600900', '002594', '688981', '000333', '601899', '000002'];
const ST = { codes: [], mode: 'date', t: LASTT, inds: PRESET.six.slice(), flip: new Set(), strat: true, later: false, sort: null, open: new Set(), tview: 'score' };
const SAVE = 'agu-kanshu-v1';
const okCode = c => BY.has(c) || (c.startsWith('HK') && HO.has(c.slice(2)));
function readHash(h) {
  const q = {}; String(h || '').replace(/^#/, '').split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
  if (!q.s && !q.k) return false;
  ST.codes = (q.s || '').split(',').filter(okCode).filter((c, i, a) => a.indexOf(c) === i).slice(0, MAXS);
  ST.inds = (q.k || '').split(',').filter(k => IK[k]).filter((c, i, a) => a.indexOf(c) === i);
  ST.flip = new Set((q.f || '').split(',').filter(k => ST.inds.includes(k) && IK[k].pk));
  if (q.v === 't') ST.mode = 'trend';
  const t = X.months.indexOf(q.d || ''); if (t >= 0) ST.t = t;
  return true;
}
function writeHash() {
  const h = `#s=${ST.codes.join(',')}&${ST.mode === 'trend' ? 'v=t&d=' + X.months[ST.t] : 'd=' + X.months[ST.t]}&k=${ST.inds.join(',')}${ST.flip.size ? '&f=' + [...ST.flip].join(',') : ''}`;
  try { history.replaceState(null, '', h); } catch (e) { /* file:// 下有的浏览器不让改 */ }
  try { localStorage.setItem(SAVE, h); } catch (e) { /* 存不下也没关系 */ }
}

// ------------------------------------------------------------------ 搜索
const SRCH = CO.map((c, i) => ({ i, code: c[0], name: c[1], py: c[5].split('|'), al: c[6] ? c[6].split('|') : [], h: c[8] }))
  .concat(X.hk.only.map(r => ({ hk: r[0], code: 'HK' + r[0], name: r[1], py: [], al: [], h: r[0] })));
function search(q) {
  q = q.trim().toLowerCase().replace(/\s+/g, ''); if (!q) return [];
  const out = [];
  for (const s of SRCH) {
    let sc = -1;
    const cd = s.hk ? s.hk : s.code;
    if (cd === q || (s.h && s.h === q)) sc = 100;
    else if (cd.startsWith(q)) sc = 80;
    else if (s.h && s.h.startsWith(q)) sc = 75;
    else if (s.name.toLowerCase() === q) sc = 95;
    else if (s.name.toLowerCase().startsWith(q)) sc = 70;
    else if (s.name.toLowerCase().includes(q)) sc = 60;
    else if (s.py.some(p => p.startsWith(q))) sc = 55;
    else if (s.al.some(a => a.toLowerCase().includes(q))) sc = 40;
    if (sc < 0) continue;
    if (!s.hk && CO[s.i][4] === LASTT) sc += 3;   // 还在的公司排前面
    out.push([sc, s]);
  }
  return out.sort((a, b) => b[0] - a[0] || a[1].code.localeCompare(b[1].code)).slice(0, 12).map(x => x[1]);
}
function tagsOf(code) {
  if (code.startsWith('HK')) return '<span class="tag h">港股·快照</span>';
  const c = CO[BY.get(code)], ah = AH.get(code);
  return (ah ? `<span class="tag h">A+H ${ah[1]}</span> ` : '') + (c[4] < LASTT ? `<span class="tag x">${c[4] < 0 ? '' : '已退市 ' + X.months[c[4]]}</span>` : '');
}
const nameOf = code => code.startsWith('HK') ? HO.get(code.slice(2))[1] : CO[BY.get(code)][1];
const showCode = code => code.startsWith('HK') ? code.slice(2) : code;

let sugSel = -1, sugList = [];
function renderSug() {
  const ul = $('#sug'), q = $('#q').value;
  sugList = search(q);
  if (!q.trim()) { ul.hidden = true; return; }
  if (!sugList.length) { ul.innerHTML = '<li class="none">没有找到。试试代码、名称或拼音首字母</li>'; ul.hidden = false; return; }
  ul.innerHTML = sugList.map((s, i) => `<li role="option" data-i="${i}" aria-selected="${i === sugSel}"><span>${esc(s.name)}</span><span class="cd">${esc(showCode(s.code))}</span>${s.al.length ? `<span class="cd">曾用名 ${esc(s.al.join('、'))}</span>` : ''}<span class="tg">${tagsOf(s.code)}</span></li>`).join('');
  ul.hidden = false;
}
function addCode(code) {
  if (ST.codes.includes(code)) { toast(`${nameOf(code)} 已经在表里`); return; }
  if (ST.codes.length >= MAXS) { toast(`最多 ${MAXS} 只，先去掉一只`); return; }
  ST.codes.push(code); update();
}

// ------------------------------------------------------------------ 选择区
function renderPicked() {
  $('#picked').innerHTML = ST.codes.length ? ST.codes.map(c => `<span class="pk">${esc(nameOf(c))} <span class="cd">${esc(showCode(c))}</span>${AH.has(c) ? ' <span class="tag h">A+H</span>' : c.startsWith('HK') ? ' <span class="tag h">港股</span>' : ''}<button type="button" data-rm="${c}" aria-label="去掉 ${esc(nameOf(c))}">×</button></span>`).join('')
    : '<span class="small">还没有选股票。在上面搜索，或点“示例”“随机 10 只”。</span>';
  $('#nsel').textContent = `已选 ${ST.codes.length} / ${MAXS} 只`;
}
function renderDate() {
  $('#mode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === ST.mode));
  $('#month').value = ST.t; $('#slider').value = ST.t;
  $('#prev').disabled = ST.t <= 0; $('#next').disabled = ST.t >= LASTT;
  $('#daterow').classList.toggle('off', ST.mode === 'trend');
  $('#dinfo').innerHTML = ST.mode === 'trend'
    ? `看 2013年5月 到 2026年10月 的每个月末。下面“在全部A股里找”按 <b>${ymCN(ST.t)}</b> 算。`
    : `<b>${dCN(ST.t)}</b>（月末最后一个交易日）· 做分位参照的合格公司 <b>${X.ne[ST.t].toLocaleString('zh-CN')}</b> 家 · 海平面 <b>${X.sea[ST.t].toFixed(0)}%</b>，高于 2000 年以来 ${X.seaP[ST.t]}% 的月份`;
}
function renderInds() {
  $('#cats').innerHTML = CATS.map(cat => `<div class="cat"><div class="ck">${cat}</div><div class="chips">${IND.filter(d => d.cat === cat).map(d => `<button type="button" class="chip" data-k="${d.k}" aria-pressed="${ST.inds.includes(d.k)}" title="${esc(d.nm + '：' + d.d)}">${esc(d.k === 'turn' ? '换手率' : d.nm)}${d.pk ? '' : '<span class="nop">不计分</span>'}</button>`).join('')}</div></div>`).join('');
  const m = stratMatch();
  $('#presets').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.p !== 'none' && !ST.flip.size && sameSet(PRESET[b.dataset.p], ST.inds) && ST.inds.length > 0));
  const scored = ST.inds.filter(k => IK[k].pk).length;
  $('#chosen').innerHTML = `<div class="hd"><span>已选 <b>${ST.inds.length}</b> 项，其中 <b>${scored}</b> 项计入得分${m ? `，正好是<b>${m.nm.replace(' ', '策略 ')}</b>` : ''}</span><span>“反过来”＝用 100 − 分位：想让“越大越好”的指标（如回报率）也是越大分越低时用</span></div>` +
    (ST.inds.length ? `<ul>${ST.inds.map(k => { const d = IK[k]; return `<li><span class="nm">${esc(d.nm)}</span>${d.pk ? `<button type="button" class="dir" data-flip="${k}" aria-pressed="${ST.flip.has(k)}">${ST.flip.has(k) ? '已反过来' : '反过来'}</button>` : '<span class="tag x">不计分</span>'}<button type="button" class="x" data-rmk="${k}" aria-label="去掉 ${esc(d.nm)}">×</button></li>`; }).join('')}</ul>` : '<p class="empty">还没有勾选指标。点上面的策略按钮，或从分组里勾选。</p>');
}

// ------------------------------------------------------------------ 表格（某一天）
let LAST = null;   // 最近一次表格的数据，供复制与下载
function cellHTML(S, d, t) {
  const c = d.cell(S, t), p = pOf(S, d, t), shown = ST.flip.has(d.k) && isF(p) ? 100 - p : p;
  const col = isF(c.cv) && ['chg', 'm1', 'm3', 'm12', 'm36', 'revg', 'nig', 'sec12'].includes(d.k) ? cls(c.cv) : '';
  const pp = d.pk ? (isF(p) ? `<span class="bar"><b style="left:${p}%"></b></span>${d.k === 'peself' ? '自身' : ''}${Math.round(p)}${ST.flip.has(d.k) ? `→${Math.round(shown)}` : ''}` : '<span class="miss">缺，按50</span>') : '';
  return `<td${c.title ? ` title="${esc(c.title)}"` : ''}><div class="v ${col}">${c.v}</div>${d.pk ? `<div class="p">${pp}</div>` : ''}</td>`;
}
function actHTML(a) { return `<span class="act ${a}">${ACTN[a]}</span>`; }
function renderTable() {
  const t = ST.t, cols = ST.inds.map(k => IK[k]), tb = $('#tbl');
  const rows = [];
  for (const code of ST.codes) {
    if (code.startsWith('HK')) { rows.push({ code, hk: HO.get(code.slice(2)) }); continue; }
    const S = SC.get(code + ':v'); if (!S) continue;
    if (t < S.a || t > S.b) { rows.push({ code, S, off: t < S.a ? 'before' : 'after' }); continue; }
    const sc = scoreOf(S, t, ST.inds, ST.flip);
    const st = STRAT.map(s => { const v = scoreOf(S, t, s.inds).v; return { v, a: s.act(v, X.sea[t]) }; });
    const lt = [1, 3, 12].map(h => later(S, t, h));
    rows.push({ code, S, sc, st, lt });
  }
  // 排序
  if (ST.sort) {
    const { key, dir } = ST.sort;
    const val = r => { if (!r.S || r.off) return NaN;
      if (key === 'score') return r.sc.v; if (key === 'name') return null;
      if (key.startsWith('A')) return r.st[STRAT.findIndex(s => s.id === key)].v;
      if (key.startsWith('f')) return r.lt[{ f1: 0, f3: 1, f12: 2 }[key]].r;
      const d = IK[key]; return d.pk ? pOf(r.S, d, t) : NaN; };
    rows.sort((a, b) => { const x = val(a), y = val(b); if (!isF(x) && !isF(y)) return 0; if (!isF(x)) return 1; if (!isF(y)) return -1; return (x - y) * dir; });
  }
  const ar = k => ST.sort && ST.sort.key === k ? (ST.sort.dir > 0 ? '↑' : '↓') : '';
  const hasScore = ST.inds.some(k => IK[k].pk), showStrat = ST.strat, showLater = ST.later;
  const nAll = 1 + cols.length + (hasScore ? 1 : 0) + (showStrat ? 3 : 0) + (showLater ? 3 : 0);
  let h = '<thead>';
  if (showStrat || showLater) h += `<tr class="grp"><th></th><th colspan="${cols.length + (hasScore ? 1 : 0)}">${cols.length ? '所选指标：数值 / 分位' : ''}</th>${showStrat ? '<th colspan="3">三套策略：得分 / 建议</th>' : ''}${showLater ? '<th colspan="3">后来怎样（含分红）</th>' : ''}</tr>`;
  h += `<tr><th>股票</th>${cols.map(d => `<th><button type="button" data-sort="${d.k}" title="${esc(d.nm + '：' + d.d)}">${esc(shName(d))}<span class="ar">${ar(d.k)}</span></button>${ST.flip.has(d.k) ? '<span class="rv">反过来</span>' : ''}</th>`).join('')}`;
  if (hasScore) h += `<th><button type="button" data-sort="score">平均得分<span class="ar">${ar('score')}</span></button></th>`;
  if (showStrat) h += STRAT.map(s => `<th><button type="button" data-sort="${s.id}" title="${esc(s.inds.map(k => shName(IK[k])).join('、'))}">${s.nm}<span class="ar">${ar(s.id)}</span></button></th>`).join('');
  if (showLater) h += ['1个月', '3个月', '1年'].map((n, i) => `<th><button type="button" data-sort="${['f1', 'f3', 'f12'][i]}">此后${n}<span class="ar">${ar(['f1', 'f3', 'f12'][i])}</span></button></th>`).join('');
  h += '</tr></thead><tbody>';
  for (const r of rows) {
    const nm = nameOf(r.code);
    const stk = `<td><div class="stk"><button type="button" data-open="${r.code}" title="展开全部 28 项">${esc(nm)}</button><span class="cd">${esc(showCode(r.code))} ${AH.has(r.code) ? '<span class="tag h">A+H</span>' : r.hk ? '<span class="tag h">港股</span>' : ''}${r.S && r.S.b < LASTT ? ' <span class="tag x">已退市</span>' : ''}</span></div></td>`;
    if (r.hk) {
      const x = r.hk; h += `<tr>${stk}<td class="na" colspan="${nAll - 1}">只在港股上市，这里没有它的逐月数据，不能打分。${X.hk.date.replace(/-/g, '.')} 快照：股价 ${x[2]} 港元，总市值 ${yi(x[3])}港元，市盈率 ${isF(x[5]) ? x[5].toFixed(1) + ' 倍' : '—'}，股息率 ${isF(x[4]) ? x[4].toFixed(2) + '%' : '—'}。</td></tr>`;
      continue;
    }
    if (r.off) {
      h += `<tr>${stk}<td class="na" colspan="${nAll - 1}">${r.off === 'before' ? `这一天还没有在图上：${ymCN(r.S.a)} 起才有数据。` : `这一天已经不在图上：最后一个月是 ${ymCN(r.S.b)}。`}<button class="mini" type="button" data-goto="${r.off === 'before' ? r.S.a : r.S.b}" style="margin-left:8px">跳到 ${ymCN(r.off === 'before' ? r.S.a : r.S.b)}</button></td></tr>`;
      continue;
    }
    h += `<tr>${stk}${cols.map(d => cellHTML(r.S, d, t)).join('')}`;
    if (hasScore) h += `<td class="sc"><div class="v">${r.sc.v.toFixed(0)}</div><div class="p"><span class="bar"><b style="left:${r.sc.v}%"></b></span>${r.sc.miss ? `<span class="miss">缺${r.sc.miss}项</span>` : `${r.sc.n}项`}</div></td>`;
    if (showStrat) h += r.st.map(s => `<td class="st"><b>${s.v.toFixed(0)}</b><div class="p">${actHTML(s.a)}</div></td>`).join('');
    if (showLater) h += r.lt.map(l => `<td><div class="v ${cls(l.r)}">${isF(l.r) ? sgn(l.r) : l.wait ? '还没到' : '—'}</div><div class="p">${isF(l.m) ? `大盘 ${sgn(l.m)}` : ''}${l.gone ? ' · 已退市' : ''}</div></td>`).join('');
    h += '</tr>';
    if (ST.open.has(r.code)) h += `<tr class="det"><td colspan="${nAll}">${detailHTML(r.S, t)}</td></tr>`;
  }
  if (!rows.length) h += `<tr><td class="na" colspan="${nAll}">先在上面选几只股票。</td></tr>`;
  tb.innerHTML = h + '</tbody>';
  LAST = { rows, cols, t, hasScore, showStrat, showLater };
  // 说明
  const notes = [];
  const m = stratMatch();
  if (m && hasScore) notes.push(`你勾的四项正好是<b>${m.nm.replace(' ', '策略 ')}</b>，平均得分就是它的打分。${m.id === 'A1' ? `这一天海平面 ${X.sea[t].toFixed(0)}%：${X.sea[t] < 70 ? '低于 70%，分数 ≤65 买入，否则不动' : X.sea[t] < 80 ? '在 70%–80% 之间，>65 卖出，≤45 买入，中间不动' : '在 80% 以上，>45 卖出，其余不动，不买'}。` : m.id === 'A3' ? '≤70 买入，>70 卖出。' : '≤65 买入，>70 卖出，中间不动。'}`);
  if (rows.some(r => r.sc && r.sc.miss)) notes.push('标着“缺”的指标没有数据（比如亏损公司没有市盈率、金融业没有利润含金量），按 50 计入得分。');
  for (const r of rows) {
    const ah = AH.get(r.code); if (!ah) continue;
    const hp = ah[2], ap = ah[3], prem = ap / (hp * X.hk.fx) - 1;
    notes.push(`<b>${esc(nameOf(r.code))}</b> 的 H 股 ${ah[1]}：${X.hk.date.replace(/-/g, '.')} 收 ${hp} 港元（约 ${(hp * X.hk.fx).toFixed(2)} 元），A 股 ${ap} 元，A 股比 H 股${prem >= 0 ? '贵' : '便宜'} ${Math.abs(prem * 100).toFixed(0)}%。表里的指标都按 A 股算；同样的利润和净资产，用 H 股价格买${prem >= 0 ? '便宜' : '贵'} ${Math.abs((1 - 1 / (1 + prem)) * 100).toFixed(0)}%。<a href="ganggu.html">去港股通页比一比</a>`);
  }
  if (showLater && t + 1 > LASTT) notes.push('2026年10月之后的涨跌还没有数据。');
  $('#notes').innerHTML = notes.map(n => `<li>${n}</li>`).join('');
}
function detailHTML(S, t) {
  return `<div class="all">${CATS.map(cat => `<div class="cath">${cat}</div>` + IND.filter(d => d.cat === cat).map(d => { const c = d.cell(S, t), p = pOf(S, d, t); return `<div class="it"><span class="n">${esc(d.nm)}</span><span class="vv">${c.v}</span><span class="pp">${d.pk ? (isF(p) ? `分位 ${Math.round(p)}` : '无分位') : ''}</span></div>`; }).join('')).join('')}</div>`;
}
function tableText(sep) {
  if (!LAST) return '';
  const { rows, cols, t, hasScore, showStrat, showLater } = LAST, q = s => sep === ',' && /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const head = ['股票', '代码', '日期'];
  cols.forEach(d => { head.push(d.nm); if (d.pk) head.push(d.nm + (ST.flip.has(d.k) ? '·分位（反过来前）' : '·分位')); });
  if (hasScore) head.push('平均得分');
  if (showStrat) STRAT.forEach(s => head.push(s.nm + '·得分', s.nm + '·建议'));
  if (showLater) ['1个月', '3个月', '1年'].forEach(n => head.push(`此后${n}涨跌%`, `同期大盘%`));
  const out = [head.map(q).join(sep)];
  for (const r of rows) {
    if (!r.S || r.off || r.hk) continue;
    const line = [nameOf(r.code), showCode(r.code), X.days[t]];
    cols.forEach(d => { line.push(strip(d.cell(r.S, t).v)); if (d.pk) { const p = pOf(r.S, d, t); line.push(isF(p) ? String(Math.round(p)) : ''); } });
    if (hasScore) line.push(r.sc.v.toFixed(1));
    if (showStrat) r.st.forEach(s => line.push(s.v.toFixed(1), ACTN[s.a]));
    if (showLater) r.lt.forEach(l => line.push(isF(l.r) ? l.r.toFixed(1) : '', isF(l.m) ? String(l.m) : ''));
    out.push(line.map(q).join(sep));
  }
  return out.join('\n');
}

// ------------------------------------------------------------------ 走势（不选日期）
const PANELS = []; let HOV = null;
function seriesOf(S) {
  const out = new Float64Array(NW).fill(NaN), view = ST.tview;
  for (let t = S.a; t <= S.b; t++) {
    if (view === 'score') out[t] = scoreOf(S, t, ST.inds, ST.flip).v;
    else { const d = IK[view]; let p = pOf(S, d, t); if (isF(p) && ST.flip.has(view)) p = 100 - p; out[t] = p; }
  }
  return out;
}
function chartSVG(ser, w, hgt, o = {}) {
  const L = 28, R = 8, T = 8, B = 18, lo = o.lo ?? 0, hi = o.hi ?? 100;
  const x = t => L + t / (NW - 1) * (w - L - R), y = v => T + (hi - v) / (hi - lo) * (hgt - T - B);
  let s = '';
  for (const g of o.grid || [0, 50, 100]) s += `<line class="gl" x1="${L}" x2="${w - R}" y1="${y(g)}" y2="${y(g)}"/><text x="${L - 5}" y="${y(g) + 3.5}" text-anchor="end">${g}${o.unit || ''}</text>`;
  if (o.band) s += `<rect class="band" x="${L}" width="${w - L - R}" y="${y(o.band[1])}" height="${y(o.band[0]) - y(o.band[1])}"/>`;
  for (const th of o.th || []) s += `<line class="th" x1="${L}" x2="${w - R}" y1="${y(th)}" y2="${y(th)}"/>`;
  for (let yr = 2014; yr <= 2026; yr++) {
    const t = X.months.indexOf(`${yr}-01`); if (t < 0) continue;
    const lab = w < 360 ? (yr % 4 === 2 ? `${yr}` : '') : (yr % 2 === 0 ? `${yr}` : '');
    s += `<line class="ax" x1="${x(t)}" x2="${x(t)}" y1="${hgt - B}" y2="${hgt - B + 3}"/>${lab ? `<text x="${x(t)}" y="${hgt - 4}" text-anchor="middle">${lab}</text>` : ''}`;
  }
  s += `<line class="ax" x1="${L}" x2="${w - R}" y1="${hgt - B}" y2="${hgt - B}"/>`;
  let d = '', pen = false, lastT = -1;
  for (let t = 0; t < NW; t++) { const v = ser[t]; if (!isF(v)) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`; pen = true; lastT = t; }
  s += `<path class="ln" d="${d}"/>`;
  if (lastT >= 0) s += `<circle class="dot" cx="${x(lastT)}" cy="${y(ser[lastT])}" r="3.5"/>`;
  s += `<line class="cx" x1="0" x2="0" y1="${T}" y2="${hgt - B}" visibility="hidden"/>`;
  return { svg: `<svg class="ch" viewBox="0 0 ${w} ${hgt}" height="${hgt}" role="img" aria-label="${esc(o.label || '')}">${s}</svg>`, x, L, R };
}
function renderTrend() {
  const views = [['score', '平均得分']].concat(ST.inds.filter(k => IK[k].pk).map(k => [k, IK[k].nm + ' 的分位']));
  if (!views.some(v => v[0] === ST.tview)) ST.tview = 'score';
  $('#tview').innerHTML = views.map(([v, n]) => `<option value="${v}"${v === ST.tview ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const gw = $('#tgrid').clientWidth || 900, cols = gw >= 1050 ? 3 : gw >= 640 ? 2 : 1, w = Math.floor((gw - 14 * (cols - 1)) / cols) - 26, hgt = 150;
  $('#tgrid').style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  const m = ST.tview === 'score' ? stratMatch() : null;
  // 海平面
  const sw = $('#seastrip').clientWidth || gw, seaC = chartSVG(X.sea, sw, 96, { lo: 30, hi: 110, grid: [40, 70, 100], unit: '%', band: [60, 80], label: '海平面' });
  $('#seastrip').innerHTML = `<div class="small" style="margin:0 0 2px">海平面（全市场市值 ÷ 近一年GDP；浅色带是常见的 60%–80%）<span id="seanow"></span></div>${seaC.svg}`;
  PANELS.length = 0; PANELS.push({ el: $('#seastrip'), ser: X.sea, c: seaC, sea: true });
  const hs = [];
  for (const code of ST.codes) {
    if (code.startsWith('HK')) continue;
    const S = SC.get(code + ':v'); if (!S) continue;
    const ser = seriesOf(S), c = chartSVG(ser, w, hgt, { th: m ? m.th : [], label: nameOf(code) + ' 的走势' });
    hs.push(`<div class="pnl" data-c="${code}"><div class="hd"><b>${esc(nameOf(code))}</b><span class="cd">${esc(code)}</span>${AH.has(code) ? '<span class="tag h">A+H</span>' : ''}<span class="now"></span></div>${c.svg}</div>`);
    PANELS.push({ code, ser, c, S });
  }
  $('#tgrid').innerHTML = hs.join('') || '<p class="small">先在上面选几只A股。</p>';
  PANELS.forEach(p => { if (!p.sea) p.el = $(`.pnl[data-c="${p.code}"]`); });
  const hkN = ST.codes.filter(c => c.startsWith('HK')).length;
  $('#tnote').innerHTML = [m ? `虚线是${m.nm.replace(' ', '策略 ')}的门槛（${m.th.join('、')}）${m.id === 'A1' ? '：海平面低于 70% 时 ≤65 买入；70%–80% 时 ≤45 买入、>65 卖出；80% 以上 >45 卖出' : m.id === 'A3' ? '：≤70 买入，>70 卖出' : '：≤65 买入，>70 卖出'}。` : '',
    ST.inds.some(k => IK[k].pk) ? '' : '还没有勾选能计分的指标。', hkN ? `只在港股上市的 ${hkN} 家没有逐月数据，不画走势。` : ''].filter(Boolean).join(' ');
  setHover(null);
}
function setHover(t) {
  HOV = t;
  for (const p of PANELS) {
    const ln = p.el && p.el.querySelector('.cx'); if (!ln) continue;
    if (t == null) ln.setAttribute('visibility', 'hidden'); else { const xx = p.c.x(t); ln.setAttribute('x1', xx); ln.setAttribute('x2', xx); ln.setAttribute('visibility', 'visible'); }
    if (p.sea) { const sn = $('#seanow'); if (sn) sn.textContent = t == null ? '' : `　${ymCN(t)}：${X.sea[t].toFixed(0)}%`; continue; }
    const tt = t == null ? Math.min(p.S.b, LASTT) : t, v = p.ser[tt], now = p.el.querySelector('.now');
    now.innerHTML = isF(v) ? `${ymCN(tt)} <b>${v.toFixed(0)}</b>` : `${ymCN(tt)} <span class="small">${tt < p.S.a ? '还没上市' : '已退市'}</span>`;
  }
  $('#thover').textContent = t == null ? '把鼠标移到图上看某个月；点一下，就切到那一天的表格' : `${ymCN(t)} · 海平面 ${X.sea[t].toFixed(0)}% · 点一下看这一天的表格`;
}
function tAt(svg, clientX) {
  const p = PANELS.find(q => q.el && q.el.contains(svg)); if (!p) return null;
  const r = svg.getBoundingClientRect(), vw = svg.viewBox.baseVal.width, xx = (clientX - r.left) / r.width * vw;
  return Math.max(0, Math.min(LASTT, Math.round((xx - p.c.L) / (vw - p.c.L - p.c.R) * (NW - 1))));
}

// ------------------------------------------------------------------ 在全部A股里找
async function runScreen() {
  const t = ST.t, scored = ST.inds.filter(k => IK[k].pk);
  if (!scored.length) { $('#zres').innerHTML = '<p class="small">先在上面勾选至少一项能计分的指标。</p>'; return; }
  $('#zres').innerHTML = '<p class="small">正在读取这一天全部公司的分位……</p>';
  let M; try { M = await getMonth(t); } catch (e) { $('#zres').innerHTML = '<p class="small">读不到这一天的数据。离线使用时，请确认 assets/ks 文件夹完整。</p>'; return; }
  const pool = $('#zpool').value, sec = +$('#zsec').value, K = M.K, PI = Object.fromEntries(X.pf.map((k, i) => [k, i]));
  let list = [];
  for (let i = 0; i < M.n; i++) {
    if (pool !== 'all' && !M.ref[i]) continue;
    if (sec >= 0 && M.sec[i] !== sec) continue;
    let s = 0, miss = 0; const parts = [];
    for (const k of scored) {
      const d = IK[k]; let p = d.pk === 'sea' ? X.seaP[t] : M.P[i * K + PI[d.pk]]; if (p === 255) { p = 50; miss++; }
      if (ST.flip.has(k)) p = 100 - p; s += p; parts.push(`${shName(d)} ${Math.round(p)}`);
    }
    list.push({ ci: M.ids[i], s: s / scored.length, miss, parts, cap: M.P[i * K + PI.cap] });
  }
  if (pool === 'big') list = list.sort((a, b) => b.cap - a.cap).slice(0, 300);
  const nTot = list.length;
  list.sort((a, b) => a.s - b.s);
  const item = (r, i) => { const c = CO[r.ci], code = c[0], has = ST.codes.includes(code);
    return `<li><span class="rk">${i + 1}</span><span class="nm"><b>${esc(c[1])}</b><span class="cd">${code}</span>${AH.has(code) ? ' <span class="tag h">A+H</span>' : ''}<span class="bd">${esc(r.parts.join(' · '))}${r.miss ? ` · 缺${r.miss}项按50` : ''}</span></span><span class="s">${r.s.toFixed(0)}</span><button type="button" class="add" data-add="${code}"${has || ST.codes.length >= MAXS ? ' disabled' : ''}>${has ? '已在表里' : '加入'}</button></li>`; };
  $('#zinfo').textContent = `${ymCN(t)}，${nTot.toLocaleString('zh-CN')} 家参与排名`;
  const how = scored.map(k => shName(IK[k]) + (ST.flip.has(k) ? '（反）' : '')).join(' + ');
  if (nTot <= 40) { $('#zres').innerHTML = nTot ? `<div class="zcol"><h3>全部 ${nTot} 家，分数从低到高<small>${how}</small></h3><ol class="zl">${list.map(item).join('')}</ol></div>` : '<p class="small">这个范围里没有公司。</p>'; return; }
  const lo = list.slice(0, 20), hi = list.slice(-20).reverse();
  $('#zres').innerHTML = `<div class="zcols"><div class="zcol"><h3>分数最低的 20 家<small>${how}</small></h3><ol class="zl">${lo.map(item).join('')}</ol></div><div class="zcol"><h3>分数最高的 20 家<small>分位后面的数是各项分位${ST.flip.size ? '（已按“反过来”换算）' : ''}</small></h3><ol class="zl">${hi.map(item).join('')}</ol></div></div>`;
}

// ------------------------------------------------------------------ 更新
let busy = 0;
async function ensure() {
  const need = ST.codes.filter(c => !c.startsWith('HK') && !SC.has(c + ':v'));
  if (!need.length) return;
  $('#msg').textContent = `正在读取 ${need.length} 只股票的数据……`;
  const res = await Promise.allSettled(need.map(c => getStock(c).then(S => SC.set(c + ':v', S))));
  const bad = need.filter((c, i) => res[i].status === 'rejected');
  $('#msg').textContent = bad.length ? `读不到 ${bad.map(nameOf).join('、')} 的数据${location.protocol === 'file:' ? '：离线使用时，请确认 assets/ks 文件夹完整' : '，请稍后刷新再试'}。` : '';
}
async function update(opt = {}) {
  renderPicked(); renderDate(); renderInds(); writeHash();
  const my = ++busy;
  await ensure();
  if (my !== busy) return;
  $('#rdate').hidden = ST.mode !== 'date'; $('#rtrend').hidden = ST.mode !== 'trend';
  $('#rtitle').textContent = ST.mode === 'date' ? '结果' : '走势';
  $('#rwhen').innerHTML = ST.mode === 'date' ? `${dCN(ST.t)} · 海平面 ${X.sea[ST.t].toFixed(0)}%` : '2013年5月–2026年10月，每个月末';
  if (ST.mode === 'date') renderTable(); else renderTrend();
  $('#zrun').textContent = `按 ${ymCN(ST.t)} 找`;
  if (opt.scroll) $('#jieguo').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
let toastT = 0;
function toast(s) { const el = $('#toast'); el.textContent = s; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1800); }

// ------------------------------------------------------------------ 事件
function init() {
  if (!('DecompressionStream' in window)) { $('#msg').textContent = '这个浏览器太旧，读不了压缩的数据。请用较新的 Chrome、Edge、Safari（16.4 以上）或 Firefox（113 以上）。'; }
  const mo = $('#month'); let og = '', html = '';
  X.months.forEach((m, t) => { const y = m.slice(0, 4); if (y !== og) { if (og) html += '</optgroup>'; html += `<optgroup label="${y}年">`; og = y; } html += `<option value="${t}">${ymCN(t)}</option>`; });
  mo.innerHTML = html + '</optgroup>';
  const sl = $('#slider'); sl.min = 0; sl.max = LASTT; sl.step = 1;
  $('#zsec').innerHTML += X.sec.map((s, i) => `<option value="${i}">${esc(s[1])}</option>`).join('');
  $('#glossary').innerHTML = IND.map(d => `<li><b>${esc(d.nm)}${d.pk ? '' : '（没有分位，不计分）'}</b><span class="d">${esc(d.d)}</span>${esc(d.hint)}</li>`).join('');

  const q = $('#q');
  q.addEventListener('input', () => { sugSel = -1; renderSug(); });
  q.addEventListener('keydown', e => {
    const ul = $('#sug');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!sugList.length) return; e.preventDefault(); sugSel = (sugSel + (e.key === 'ArrowDown' ? 1 : -1) + sugList.length) % sugList.length; renderSug(); const li = ul.querySelector(`[data-i="${sugSel}"]`); if (li) li.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { const s = sugList[sugSel >= 0 ? sugSel : 0]; if (s) { e.preventDefault(); addCode(s.code); q.value = ''; sugSel = -1; renderSug(); } }
    else if (e.key === 'Escape') { q.value = ''; renderSug(); }
  });
  $('#sug').addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (!li) return; e.preventDefault(); addCode(sugList[+li.dataset.i].code); q.value = ''; sugSel = -1; renderSug(); q.focus(); });
  q.addEventListener('blur', () => setTimeout(() => { $('#sug').hidden = true; }, 120));
  q.addEventListener('focus', () => { if (q.value.trim()) renderSug(); });
  $('#picked').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; ST.codes = ST.codes.filter(c => c !== b.dataset.rm); update(); });
  $('#clr').onclick = () => { ST.codes = []; update(); };
  $('#demo').onclick = () => { ST.codes = DEMO.filter(okCode); update(); };
  $('#rand').onclick = () => {
    const t = ST.mode === 'date' ? ST.t : LASTT, pool = CO.filter(c => c[3] <= t && c[4] >= t).map(c => c[0]);
    const pick = []; while (pick.length < MAXS && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    ST.codes = pick; update();
  };
  $('#mode').onclick = e => { const b = e.target.closest('button'); if (!b) return; ST.mode = b.dataset.v; update(); };
  const setT = t => { ST.t = Math.max(0, Math.min(LASTT, t)); if (ST.mode === 'trend') ST.mode = 'date'; update(); };
  mo.onchange = () => setT(+mo.value);
  $('#prev').onclick = () => setT(ST.t - 1); $('#next').onclick = () => setT(ST.t + 1);
  let slT = 0; sl.oninput = () => { ST.t = +sl.value; renderDate(); clearTimeout(slT); slT = setTimeout(() => setT(+sl.value), 120); };
  $('#presets').onclick = e => { const b = e.target.closest('button'); if (!b) return; ST.inds = PRESET[b.dataset.p].slice(); ST.flip.clear(); ST.sort = null; update(); };
  $('#cats').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k; if (ST.inds.includes(k)) { ST.inds = ST.inds.filter(x => x !== k); ST.flip.delete(k); } else ST.inds.push(k); update(); };
  $('#chosen').onclick = e => {
    const f = e.target.closest('[data-flip]'), r = e.target.closest('[data-rmk]');
    if (f) { const k = f.dataset.flip; ST.flip.has(k) ? ST.flip.delete(k) : ST.flip.add(k); update(); }
    if (r) { const k = r.dataset.rmk; ST.inds = ST.inds.filter(x => x !== k); ST.flip.delete(k); update(); }
  };
  $('#oStrat').onchange = e => { ST.strat = e.target.checked; renderTable(); };
  $('#oLater').onchange = e => { ST.later = e.target.checked; renderTable(); };
  $('#tbl').addEventListener('click', e => {
    const s = e.target.closest('[data-sort]'), o = e.target.closest('[data-open]'), g = e.target.closest('[data-goto]');
    if (s) { const k = s.dataset.sort; ST.sort = ST.sort && ST.sort.key === k ? (ST.sort.dir === 1 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 }; renderTable(); }
    if (o) { const c = o.dataset.open; if (c.startsWith('HK')) return; ST.open.has(c) ? ST.open.delete(c) : ST.open.add(c); renderTable(); }
    if (g) setT(+g.dataset.goto);
  });
  $('#copy').onclick = async () => {
    const txt = tableText('\t'); let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove();
    }
    toast(ok ? '已复制，可以直接粘贴到表格软件' : '复制失败，请用“下载 CSV”');
  };
  $('#csv').onclick = () => {
    const blob = new Blob(['﻿' + tableText(',')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `看数-${X.months[ST.t]}.csv`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  $('#tview').onchange = e => { ST.tview = e.target.value; renderTrend(); };
  const tr = $('#rtrend');
  tr.addEventListener('pointermove', e => { const svg = e.target.closest('svg.ch'); if (!svg) return; setHover(tAt(svg, e.clientX)); });
  tr.addEventListener('pointerleave', () => setHover(null));
  tr.addEventListener('click', e => { const svg = e.target.closest('svg.ch'); if (!svg) return; const t = tAt(svg, e.clientX); if (t != null) { ST.t = t; ST.mode = 'date'; update({ scroll: true }); } });
  $('#zrun').onclick = runScreen;
  $('#zres').addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (!b) return; addCode(b.dataset.add); b.disabled = true; b.textContent = '已在表里'; });
  let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (ST.mode === 'trend') renderTrend(); }, 150); });
  addEventListener('hashchange', () => { if (readHash(location.hash)) update(); });

  let saved = null; try { saved = localStorage.getItem(SAVE); } catch (e) { /* 没有本地存储 */ }
  if (!readHash(location.hash) && !(saved && readHash(saved))) ST.codes = DEMO.filter(okCode);
  update();
}
init();
window.__ks = { getStock, V, P, later, scoreOf };   // 供自动测试核对数字
})();
