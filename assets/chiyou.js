/* 持有一月 / 持有三月 / 持有一年：用真实历史练眼力。页面用 window.AGU_CY_GAME 说明是哪个游戏（id 是持有的月数）；
   题库在 chiyou-data.js，三个月和一年的分布、走势在 chiyou-ext.js（都由 tools/make_chiyou.py 生成），排行榜服务器地址在 chiyou-config.js。 */
'use strict';
(function () {
const C = window.AGU_CY, CFG = window.AGU_CY_CFG || {}, EX = window.AGU_CY_EXT || null;
const GAME = Object.assign({ id: 1, store: 'agu-chiyou-v2', luck: '一个月的结果多半是运气' }, window.AGU_CY_GAME || {});
const GH = GAME.id;   // 持有期：1、3、12 个月
const $ = s => document.querySelector(s);
function b64(s, T) { const bin = atob(s), n = bin.length, u8 = new Uint8Array(n); for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i); return T === Uint8Array ? u8 : new T(u8.buffer); }

// ------------------------------------------------------------------ 题库
const KF = C.F.map(f => f[0]), NF = KF.length, R = C.R, NP = C.P.length;
const ROWS = b64(C.rows, Int16Array), PCTS = b64(C.pct, Uint8Array), NIQ = b64(C.ni, Int16Array), MPQ = b64(C.mp, Int16Array), DPQ = b64(C.dp, Int16Array);
const FI = {}; KF.forEach((k, i) => { FI[k] = i; });
const PI = {}; C.P.forEach((k, i) => { PI[k] = i; });
function val(r, k) { const i = FI[k], q = ROWS[r * NF + i]; if (q === -32768) return NaN; const f = C.F[i]; return f[1] === 'g' ? Math.pow(10, q / 2000) : q / f[2]; }
function pctOf(r, k) { const i = PI[k]; if (i === undefined) return NaN; const p = PCTS[r * NP + i]; return p === 255 ? NaN : p; }
const dq = q => q === -32768 ? NaN : q === 0 ? 0 : Math.sign(q) * Math.pow(10, (Math.abs(q) - 1) / 3200 - 4);
const niHist = r => Array.from({ length: 10 }, (_, i) => dq(NIQ[r * 10 + i]));
const mPath = r => Array.from({ length: 37 }, (_, i) => { const q = MPQ[r * 37 + i]; return q === -32768 ? NaN : Math.pow(10, q / 10000); });
const MI = new Int16Array(R), DPO = new Int32Array(R);
{ let o = 0; for (let r = 0; r < R; r++) { MI[r] = ROWS[r * NF + FI.mi]; DPO[r] = o; o += C.nd[MI[r]] + 1; } }
const dPath = r => { const n = C.nd[MI[r]] + 1, o = DPO[r]; return Array.from({ length: n }, (_, i) => 1 + DPQ[o + i] / 10000); };
// 持有期：回报、同期大盘、在同期全部A股里的百分位、全市场分布、到期日、到期那天是否停牌
const nn = v => v === null || v === undefined ? NaN : v;
const F3 = EX ? b64(EX.f3, Int16Array) : null, P3 = EX ? b64(EX.p3, Uint8Array) : null, W3 = EX ? b64(EX.w3, Int16Array) : null;
const S3 = EX ? b64(EX.s3, Uint8Array) : null, S12 = EX ? b64(EX.s12, Uint8Array) : null, K3 = EX ? EX.K3 : 0;
const mkPath = (mi, k) => { const q = C.mpath[mi][k]; return q === null || q === undefined ? NaN : (Math.pow(10, q / 10000) - 1) * 100; };
const HL = { 1: '一个月', 3: '三个月', 12: '一年', 36: '三年' };
const RET = { 1: r => val(r, 'f1'), 3: r => (F3 && F3[r] !== -32768 ? F3[r] / 10 : NaN), 12: r => val(r, 'f12'), 36: r => val(r, 'f36') };
const MKT = { 1: mi => nn(C.mkt[mi][0]), 3: mi => mkPath(mi, 3), 12: mi => nn(C.mkt[mi][1]), 36: mi => nn(C.mkt[mi][2]) };
const PCTH = { 1: r => val(r, 'p1'), 3: r => (P3 && P3[r] !== 255 ? P3[r] : NaN), 12: r => val(r, 'p12') };
const HIST = { 1: mi => [C.hist[mi], C.med1[mi], -30, 2], 3: mi => [EX.hist3[mi], EX.med3[mi], EX.bins['3'][0], EX.bins['3'][1]], 12: mi => [EX.hist12[mi], EX.med12[mi], EX.bins['12'][0], EX.bins['12'][1]] };
const END = { 1: mi => C.d1[mi], 3: mi => EX.d3[mi], 12: mi => EX.d12[mi] };
const SUSP = { 1: r => val(r, 'susp') === 1, 3: r => !!S3 && S3[r] === 1, 12: r => !!S12 && S12[r] === 1 };
const HZ = GH === 1 ? [1, 12, 36] : GH === 3 ? [3, 12, 36] : [12, 36];   // 揭晓时点，以及“再往后看”的时点
const okMonth = mi => GH === 1 || (GH === 3 ? EX.med3[mi] !== null : EX.med12[mi] !== null);
// 持有期里的走势（股票、同期大盘，都是“价格 ÷ 决策日”）：一个月按天，三个月取 14 个等距交易日，一年按月末
const ffill = a => { let last = 1; return a.map(v => (isFinite(v) ? (last = v) : last)); };
function holdPath(r) {
  const mi = MI[r];
  if (GH === 1) return [dPath(r), C.mday[mi].map(q => 1 + q / 10000)];
  if (GH === 3) return [ffill(Array.from({ length: K3 }, (_, i) => { const q = W3[r * K3 + i]; return q === -32768 ? NaN : Math.pow(10, q / 10000); })), EX.mw3[mi].map(q => Math.pow(10, q / 10000))];
  return [ffill(mPath(r).slice(0, 13)), ffill(C.mpath[mi].slice(0, 13).map(q => (q === null ? NaN : Math.pow(10, q / 10000))))];
}
const POOL = C.months.map(() => ({ all: [], big: [] }));
for (let r = 0; r < R; r++) { const m = MI[r]; if (!okMonth(m)) continue; if (val(r, 'uni') === 1) POOL[m].all.push(r); if (val(r, 'big') === 1) POOL[m].big.push(r); }
const MOK = C.months.map((_, m) => m).filter(okMonth);   // 这个游戏能出题的决策月
const mAll = ym => (+ym.slice(0, 4) - 2000) * 12 + (+ym.slice(5, 7) - 1);
const LASTALL = mAll(C.last);
const coOf = r => C.co[val(r, 'co')];
const pxOf = r => val(r, 'px');
const fyOf = mi => { const ym = C.months[mi], y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m >= 5 ? y - 1 : y - 2; };
const LETTER = '甲乙丙丁戊';
const TOTAL = 1000000, HALF = 500000, LOT = 100, FEE = 0.001;

// ------------------------------------------------------------------ 格式
const isF = Number.isFinite;
const fx = (v, d = 1) => v.toFixed(d).replace('-', '−');
const sgn = (v, d = 1) => !isF(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%';
const cls = v => !isF(v) || Math.abs(v) < 0.05 ? 'flat' : v > 0 ? 'up' : 'down';
const money = v => (v < 0 ? '−' : '') + Math.round(Math.abs(v)).toLocaleString('zh-CN') + ' 元';
const moneyS = v => (Math.round(v) > 0 ? '+' : Math.round(v) < 0 ? '−' : '') + Math.round(Math.abs(v)).toLocaleString('zh-CN') + ' 元';
const yi = v => !isF(v) ? '—' : Math.abs(v) >= 10000 ? (v / 10000).toFixed(2) + ' 万亿元' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString('zh-CN') + ' 亿元' : Math.abs(v) >= 1 ? v.toFixed(1) + ' 亿元' : Math.round(v * 10000).toLocaleString('zh-CN') + ' 万元';
const yiS = v => !isF(v) ? '—' : (v < 0 ? '−' : '') + yi(Math.abs(v));
const dateCN = s => `${+s.slice(0, 4)}年${+s.slice(5, 7)}月${+s.slice(8, 10)}日`;
const ymCN = s => `${+s.slice(0, 4)}年${+s.slice(5, 7)}月`;
const ymAll = t => `${2000 + Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`;
const span = mi => `${C.d0[mi].replace(/-/g, '.')}–${(GH === 1 ? END[GH](mi).slice(5) : END[GH](mi)).replace(/-/g, '.')}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const median = a => { const b = a.filter(isF).sort((x, y) => x - y); if (!b.length) return NaN; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const mean = a => { const b = a.filter(isF); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : NaN; };
const shares = n => n.toLocaleString('zh-CN') + ' 股';

function board(code, d) {
  if (code.startsWith('688')) return ['科创板', 20];
  if (/^30[01]/.test(code)) return ['创业板', d >= '2020-08-24' ? 20 : 10];
  if (/^00[23]/.test(code)) return [d < '2021-04-06' ? '中小板' : '深市主板（原中小板）', 10];
  if (code.startsWith('6')) return ['沪市主板', 10];
  return ['深市主板', 10];
}
const FLAGN = ['利润年年为正，现金却不到一半', '有亏损年份', '向股东要的钱超过期初净资产', '负债率70%以上'];

// ------------------------------------------------------------------ 二十八项指标
// get(r, ctx) → { v: 主数值（HTML）, s: 短文本（翻开后的芯片上显示）, sub: 说明, p: 百分位, pk: 百分位的读法, cv: 涨跌着色用的数, chart }
// ctx = { mi, open }：open 为真时（揭晓后）显示年报年份
const PTXT = p => `高于当天 ${p}% 的公司`;
const IND = [
  { k: 'sec', cat: '公司', nm: '行业', get: r => { const s = C.sec[val(r, 'sec')]; return { v: esc(s ? s[1] : '—'), s: s ? s[1] : '—', sub: '当时所属的“国”' }; },
    hint: '同一个市盈率，在银行和在半导体里意思完全不同。先知道它属于哪个国，别的数字才有参照。' },
  { k: 'cap', cat: '公司', nm: '总市值', get: r => ({ v: yi(val(r, 'cap')), s: yi(val(r, 'cap')), p: pctOf(r, 'cap') }),
    hint: '小公司的数字波动大，少量资金就能推动价格；大公司的“便宜”更可信，也更少见。' },
  { k: 'list', cat: '公司', nm: '上市时间', get: (r, x) => {
      const l = val(r, 'list');
      if (l < 0) { const y = Math.floor(mAll(C.months[x.mi]) / 12); return { v: '2000年以前', s: '2000年以前', sub: `上市至少 ${y} 年` }; }
      const t = l < 24 ? `${l} 个月` : `${(l / 12).toFixed(1)} 年`; return { v: t, s: t, sub: '从第一个交易日算起' };
    }, hint: '上市没几年的公司，历史数据短；上市前后的好成绩，可能有一部分是为上市准备的。' },
  { k: 'board', cat: '公司', nm: '板块', get: (r, x) => { const [b, l] = board(coOf(r)[0], C.d0[x.mi]); return { v: b, s: b, sub: `涨跌幅限制 ±${l}%` }; },
    hint: '±20% 的板块，一天的涨跌能抵上主板两天；同样一条消息，价格的反应更剧烈。' },
  { k: 'px', cat: '价格', nm: '股价', get: r => { const v = val(r, 'px'); return { v: `${v.toFixed(2)} <small>元</small>`, s: `${v.toFixed(2)}元`, sub: '那天的收盘价，不复权', p: pctOf(r, 'px') }; },
    hint: '股价高低不说明贵贱，贵不贵要看价格背后的利润和净资产。几块钱的股票常给人“便宜”的错觉。' },
  { k: 'chg', cat: '价格', nm: '当天涨跌', get: r => { const v = val(r, 'chg'), l = val(r, 'lim'); const t = sgn(v, 2) + (l === 1 ? ' 涨停' : l === -1 ? ' 跌停' : ''); return { v: t, s: t, cv: v, p: pctOf(r, 'chg'), sub: l === 1 ? '收在涨停价：当天几乎买不进' : l === -1 ? '收在跌停价：当天几乎卖不出' : '' }; },
    hint: '一天的涨跌几乎全是噪音。值得留意的只有涨停、跌停：它意味着当天可能买不进或卖不出。' },
  { k: 'm1', cat: '价格', nm: '近1个月涨跌', get: r => { const v = val(r, 'm1'); return { v: sgn(v), s: sgn(v), cv: v, p: pctOf(r, 'm1'), sub: '含分红' }; },
    hint: '上个月涨得多的，下个月既可能接着涨，也可能回吐。一个月的涨跌，几乎说明不了生意的好坏。' },
  { k: 'm3', cat: '价格', nm: '近3个月涨跌', get: r => { const v = val(r, 'm3'); return { v: sgn(v), s: sgn(v), cv: v, p: pctOf(r, 'm3'), sub: '含分红' }; },
    hint: '三个月的涨跌常常被讲成一个故事。先问一句：这段时间里，利润变了多少？' },
  { k: 'm12', cat: '价格', nm: '近12个月涨跌', get: r => { const v = val(r, 'm12'); return { v: sgn(v), s: sgn(v), cv: v, p: pctOf(r, 'm12'), sub: '含分红' }; },
    hint: '一年涨了几倍的股票，常见的结局是价格跑在利润前面；跌了一半的，也可能只是回到合理。' },
  { k: 'm36', cat: '价格', nm: '近3年涨跌', get: r => { const v = val(r, 'm36'); return isF(v) ? { v: sgn(v), s: sgn(v), cv: v, p: pctOf(r, 'm36'), sub: '含分红' } : { v: '—', s: '不满三年', sub: '上市不满三年' }; },
    hint: '到了三年，涨跌开始和利润有关。涨得多的，看利润是否同步；跌得多的，看是生意坏了还是原来太贵。' },
  { k: 'hi52', cat: '价格', nm: '距52周最高', get: r => { const v = val(r, 'hi52'); if (!isF(v)) return { v: '—', s: '—' }; const t = v > -0.05 ? '就在最高点' : `低 ${Math.abs(v).toFixed(1)}%`; return { v: t, s: t, p: pctOf(r, 'hi52'), sub: '和过去250个交易日的最高价相比（复权）' }; },
    hint: '从高点跌了很多不等于便宜：如果高点本身是泡沫，跌掉一半也可能仍然贵。' },
  { k: 'vol', cat: '价格', nm: '波动率', get: r => { const v = val(r, 'vol'); return { v: isF(v) ? `${v.toFixed(0)}%` : '—', s: isF(v) ? `${v.toFixed(0)}%` : '—', p: pctOf(r, 'vol'), sub: '近60个交易日，年化' }; },
    hint: '波动率说的是坐车有多颠，不是目的地在哪里。颠得越厉害，越容易在低点被吓下车。' },
  { k: 'amt', cat: '成交', nm: '日均成交额', get: r => { const v = val(r, 'amt'); return { v: yi(v), s: yi(v), p: pctOf(r, 'amt'), sub: '近20个交易日平均' }; },
    hint: '成交太少的股票，进得去、出不来；你自己的买卖就可能推动价格。' },
  { k: 'turn', cat: '成交', nm: '成交额占总市值', get: r => { const v = val(r, 'turn'); return { v: isF(v) ? `${v.toFixed(2)}%` : '—', s: isF(v) ? `${v.toFixed(2)}%/天` : '—', p: pctOf(r, 'turn'), sub: '每天，近20个交易日平均' }; },
    hint: '这个比例很高，说明它正被热炒，价格更多由情绪决定。行情软件的换手率按流通股算，会比这里高。' },
  { k: 'pe', cat: '估值', nm: '市盈率（静态）', get: r => {
      const v = val(r, 'pe'), n = niHist(r)[9];
      if (!isF(v)) return n < 0 ? { v: '亏损', s: '亏损', sub: '最近一期年报亏损，市盈率为负' } : { v: '—', s: '—', sub: '没有年报数据' };
      const t = v >= 3270 ? '3,000 倍以上' : `${v.toFixed(1)} <small>倍</small>`; return { v: t, s: v >= 3270 ? '>3000倍' : `${v.toFixed(1)}倍`, p: pctOf(r, 'pe'), sub: '总市值 ÷ 最近一期年报的归母净利润' };
    }, hint: '低市盈率可能是便宜，也可能是利润正处在周期高点、明年就要下滑。下结论之前，先看十年利润。' },
  { k: 'peself', cat: '估值', nm: '市盈率在自己五年里的位置', get: r => { const v = val(r, 'peself'); return isF(v) ? { v: `第 ${v} 百分位`, s: `第${v}百分位`, own: v, sub: '和它自己过去五年每个月的市盈率比：0 最便宜，100 最贵' } : { v: '—', s: '—', sub: '亏损，或者有市盈率的月份不足两年' }; },
    hint: '和自己的历史比，往往比和别的公司比更有意义。但如果生意本身变差了，“比过去便宜”就不算便宜。' },
  { k: 'pb', cat: '估值', nm: '市净率', get: r => { const v = val(r, 'pb'); return isF(v) ? { v: `${v.toFixed(2)} <small>倍</small>`, s: `${v.toFixed(2)}倍`, p: pctOf(r, 'pb'), sub: '总市值 ÷ 归母净资产' } : { v: '—', s: '—', sub: '净资产为负，或没有数据' }; },
    hint: '市净率低于1，常见于银行、钢铁、地产：资产的账面值可能不实，或者它挣不到像样的回报。高市净率要靠高回报率撑着。' },
  { k: 'ps', cat: '估值', nm: '市销率', get: r => { const v = val(r, 'ps'); return isF(v) ? { v: `${v.toFixed(2)} <small>倍</small>`, s: `${v.toFixed(2)}倍`, p: pctOf(r, 'ps'), sub: '总市值 ÷ 营收' } : { v: '—', s: '—' }; },
    hint: '亏损或利润很薄的公司，常用市销率看估值。只有收入最后能变成利润，这个数字才有意义。' },
  { k: 'roe', cat: '财务', nm: '净资产收益率', fy: 1, get: r => { const v = val(r, 'roe'); return { v: isF(v) ? `${fx(v)}%` : '—', s: isF(v) ? `${fx(v)}%` : '—', p: pctOf(r, 'roe'), sub: '归母净利润 ÷ 年初年末平均的归母净资产' }; },
    hint: '一年的回报率可能来自周期高点或一次性收益。连续多年都高，才更像是生意本身的能力。' },
  { k: 'roe5', cat: '财务', nm: '近五年平均净资产收益率', fy: 1, get: r => { const v = val(r, 'roe5'); return { v: isF(v) ? `${fx(v)}%` : '—', s: isF(v) ? `${fx(v)}%` : '—', p: pctOf(r, 'roe5'), sub: '截至最近一期年报的五个财年，不足五年按已有年份（至少三年）' }; },
    hint: '能长期维持15%以上回报率的公司很少。但平均数会掩盖下滑的趋势，最好再看逐年的利润。' },
  { k: 'revg', cat: '财务', nm: '营收增长', fy: 1, get: r => { const v = val(r, 'revg'); return { v: sgn(v), s: sgn(v), cv: v, p: pctOf(r, 'revg'), sub: '最近一期年报比上一年' }; },
    hint: '收入增长比利润增长更难靠一次性收益撑起来；但一笔并购也能让收入一夜变大。' },
  { k: 'nig', cat: '财务', nm: '净利润增长', fy: 1, get: r => {
      const h = niHist(r), a = h[8], b = h[9];
      if (!isF(a) || !isF(b)) return { v: '—', s: '—', sub: '没有连续两年的年报' };
      let t; if (a > 0 && b > 0) t = sgn((b / a - 1) * 100); else if (a > 0) t = '由盈转亏'; else if (b > 0) t = '扭亏为盈'; else t = '继续亏损';
      return { v: t, s: t, cv: a > 0 && b > 0 ? b - a : b, p: a > 0 ? pctOf(r, 'nig') : NaN, sub: `归母净利润从 ${yiS(a)} 到 ${yiS(b)}` };
    }, hint: '利润增长快不一定好：可能来自上一年的低基数、卖资产的一次性收益，或者周期的高点。' },
  { k: 'ni10', cat: '财务', nm: '近十年利润', fy: 1, get: r => {
      const h = niHist(r), ok = h.filter(isF), lossN = ok.filter(v => v < 0).length;
      if (!ok.length) return { v: '—', s: '—', sub: '没有年报数据' };
      return { v: yiS(h[9]), s: `${ok.length}年·亏${lossN}年`, chart: spark(h), sub: `${ok.length} 个财年里最高 ${yiS(Math.max(...ok))}，最低 ${yiS(Math.min(...ok))}${lossN ? `，亏损 ${lossN} 年` : '，没有亏损'}。右边是最近一年` };
    }, hint: '最值得翻的一张牌：利润是稳步增长、大起大落，还是只在最近一年变好？它决定了别的估值数字该怎么读。' },
  { k: 'cash', cat: '财务', nm: '利润含金量', fy: 1, get: r => {
      const v = val(r, 'cash'), s = C.sec[val(r, 'sec')];
      if (s && ['bank', 'broker', 'insur'].includes(s[0])) return { v: '不适用', s: '不适用', sub: '金融业的现金流不能这样读' };
      if (!isF(v)) return { v: '—', s: '—', sub: '近三年合计没有盈利，或数据不全' };
      return { v: `${fx(v, 2)} <small>倍</small>`, s: `${fx(v, 2)}倍`, p: pctOf(r, 'cash'), sub: '近三年经营现金流合计 ÷ 归母净利润合计' };
    }, hint: '利润是观点，现金是事实。长期低于0.5倍，要看钱是不是压在了应收账款和存货里。' },
  { k: 'lev', cat: '财务', nm: '资产负债率', fy: 1, get: r => { const v = val(r, 'lev'); return { v: isF(v) ? `${v.toFixed(0)}%` : '—', s: isF(v) ? `${v.toFixed(0)}%` : '—', p: pctOf(r, 'lev'), sub: '最近一期年报' }; },
    hint: '负债放大回报，也放大亏损。银行、地产天生负债率高，要和同行比。' },
  { k: 'flag', cat: '财务', nm: '财报疑点', fy: 1, get: (r, x) => {
      const v = val(r, 'flag'), b = val(r, 'fbits'), s = C.sec[val(r, 'sec')];
      if (s && ['bank', 'broker', 'insur'].includes(s[0])) return { v: '不适用', s: '不适用', sub: '财报侦探不给金融业点灯' };
      if (!isF(v)) return { v: '—', s: '—', sub: '年报不足三年' };
      const fd = C.fd[x.mi], tot = fd.slice(0, 5).reduce((a, c) => a + c, 0), zero = tot ? Math.round(fd[0] / tot * 100) : NaN;
      const names = FLAGN.filter((_, i) => b & (1 << i));
      return { v: `${v} <small>个</small>`, s: `${v}个`, sub: (names.length ? names.join('；') + '。' : '') + `当天的非金融公司里，${zero}% 一个都没有` };
    }, hint: '财报侦探的四条线索，看截至当时的五个财年。疑点越多，此后越容易亏损；但它只是统计信号，不等于造假。' },
  { k: 'sea', cat: '大环境', nm: '海平面', get: (r, x) => {
      const t = mAll(C.months[x.mi]), v = C.sea[t], hist = C.sea.slice(0, t + 1), p = Math.round(hist.filter(s => s < v).length / hist.length * 100);
      return { v: `${v.toFixed(0)}%`, s: `${v.toFixed(0)}%`, sub: `全市场市值 ÷ 近一年GDP。高于2000年以来 ${p}% 的月份；常见区间 60%–80%`, own: p };
    }, hint: '水位越高，此后几年越难赚钱；但它对下一个月的涨跌几乎没有解释力。' },
  { k: 'sec12', cat: '大环境', nm: '行业近12个月', get: (r, x) => {
      const v = val(r, 'sec12'), arr = C.sec12[x.mi].filter(isF).sort((a, b) => b - a), rk = arr.indexOf(arr.find(a => Math.abs(a - v) < 0.051)) + 1;
      return { v: sgn(v), s: sgn(v), cv: v, sub: `这个国的总市值变化（含新上市），30国里排第 ${rk || '—'}` };
    }, hint: '一个行业一年里市值大涨，常常是新钱和新公司一起涌进来。版图最大的时候，往往也是最贵的时候。' },
];
const INDK = {}; IND.forEach(d => { INDK[d.k] = d; });
const CATS = ['公司', '价格', '成交', '估值', '财务', '大环境'];
const CATN = { '财务': '财务（最近一期年报）' };
const MAXFLIP = 5;

function spark(h, w = 230, hh = 56) {
  const ok = h.filter(isF); if (!ok.length) return '';
  const mx = Math.max(0, ...ok), mn = Math.min(0, ...ok), sp = mx - mn || 1, bw = w / 10;
  const y = v => 4 + (mx - v) / sp * (hh - 18);
  let s = `<line x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}" style="stroke:var(--line-2)"/>`;
  h.forEach((v, i) => { if (!isF(v)) return; const y0 = y(0), y1 = y(v); s += `<rect x="${i * bw + 2}" width="${bw - 4}" y="${Math.min(y0, y1)}" height="${Math.max(1, Math.abs(y1 - y0))}" style="fill:${v < 0 ? 'var(--down)' : i === 9 ? 'var(--fg)' : 'var(--fg-3)'}"/>`; });
  s += `<text x="0" y="${hh - 2}">十年前</text><text x="${w}" y="${hh - 2}" text-anchor="end">最近一年</text>`;
  return `<svg class="spark" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}" role="img" aria-label="近十年利润">${s}</svg>`;
}

// ------------------------------------------------------------------ 设置、存档、浏览器编号
const KEY = GAME.store;
let MEM = null;
function loadRec() { if (MEM) return MEM; try { MEM = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { MEM = {}; } if (!MEM.rounds) MEM.rounds = []; if (!MEM.opt) MEM.opt = {}; return MEM; }
function saveRec() { try { localStorage.setItem(KEY, JSON.stringify(MEM)); } catch (e) { /* 存不下也能玩，只是不留战绩 */ } }
const OPT = Object.assign({ n: 3, pool: 'all', pct: true, hint: true }, loadRec().opt);
function cid() {
  let c = loadRec().cid;
  if (!c) { c = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''); loadRec().cid = c; saveRec(); }
  return c;
}

function initSetup() {
  const nb = $('#optN');
  nb.innerHTML = [1, 2, 3, 4, 5].map(n => `<button data-v="${n}" aria-pressed="${n === OPT.n}">${n} 只</button>`).join('');
  nb.onclick = e => { const b = e.target.closest('button'); if (!b) return; OPT.n = +b.dataset.v; nb.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); persistOpt(); };
  const pb = $('#optPool');
  pb.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === OPT.pool));
  pb.onclick = e => { const b = e.target.closest('button'); if (!b) return; OPT.pool = b.dataset.v; pb.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); persistOpt(); };
  $('#optPct').checked = OPT.pct; $('#optHint').checked = OPT.hint;
  $('#optPct').onchange = e => { OPT.pct = e.target.checked; persistOpt(); if (G && !G.done) renderPlay(); };
  $('#optHint').onchange = e => { OPT.hint = e.target.checked; persistOpt(); if (G && !G.done) renderPlay(); };
  $('#start').onclick = () => newRound();
}
function persistOpt() { loadRec().opt = OPT; saveRec(); }

// ------------------------------------------------------------------ 一局
// 每只股票各抽一个月；同一局里不重复抽同一家公司
function pickRows(n, pool) {
  const rows = [], seen = new Set();
  for (let g = 0; rows.length < n && g < 1000; g++) {
    const p = POOL[MOK[Math.floor(Math.random() * MOK.length)]][pool], r = p[Math.floor(Math.random() * p.length)], code = coOf(r)[0];
    if (!seen.has(code)) { seen.add(code); rows.push(r); }
  }
  return rows;
}
// 约 50 万元按整手平均买成这几只：每只买到最接近 50万÷只数 的整手数，至少一手（和服务器 cy_submit 的算法一致）
const holdings = rows => rows.map(r => Math.max(1, Math.floor(HALF / rows.length / (pxOf(r) * LOT) + 0.5)) * LOT);

let G = null;
function newRound(rows) {
  rows = rows || pickRows(OPT.n, OPT.pool);
  const sh0 = holdings(rows), cash = TOTAL - rows.reduce((s, r, i) => s + sh0[i] * pxOf(r), 0);
  G = { rows, n: rows.length, sh0, cash0: cash, cash, cur: 0, flips: rows.map(() => []), acts: rows.map(() => null), done: false, pend: { a: 'hold', x: 0.5 }, warn: '', blk: null, pool: OPT.pool };
  G.first = rows.map(() => IND[Math.floor(Math.random() * IND.length)].k);
  $('#reveal').hidden = true;
  const p = $('#play'); p.hidden = false;
  renderPlay();
  p.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function indBlock(r, k, tag, open, isNew) {
  const d = INDK[k], o = d.get(r, { mi: MI[r], open });
  const nm = d.nm + (d.fy && open ? `（${fyOf(MI[r])}年报）` : '');
  const p = isF(o.p) ? o.p : isF(o.own) ? o.own : NaN;
  const bar = OPT.pct && isF(p) ? `<div class="pbar"><span>低</span><span class="tr"><i style="left:${p}%"></i></span><span>高</span><span class="tx">${isF(o.p) ? `高于当天 ${o.p}% 的公司` : ''}</span></div>` : '';
  return `<div class="ind${isNew ? ' new' : ''}"><div class="top"><span class="nm">${nm}</span>${tag ? `<span class="tag">${tag}</span>` : ''}<span class="vv ${isF(o.cv) ? cls(o.cv) : ''}">${o.v}</span></div>
    ${o.sub ? `<div class="small">${o.sub}</div>` : ''}${o.chart || ''}${bar}${OPT.hint ? `<p class="hint">${d.hint}</p>` : ''}</div>`;
}

// 按比例算出要买卖的股数。卖：按持仓比例取整手（全卖除外）；买：按可用现金比例，买得起的整手数
function planOf(i, a) {
  const r = G.rows[i], px = pxOf(r), sh0 = G.sh0[i];
  let d = 0;
  if (a.a === 'sell') d = -(a.x >= 1 ? sh0 : Math.min(sh0, Math.max(LOT, Math.floor(sh0 * a.x / LOT + 0.5) * LOT)));
  if (a.a === 'buy') d = Math.floor(G.cash * a.x / (px * LOT * (1 + FEE))) * LOT;
  const fee = Math.abs(d) * px * FEE;
  const cash1 = d < 0 ? G.cash + (-d) * px - fee : d > 0 ? G.cash - d * px - fee : G.cash;
  return { d, fee, amt: Math.abs(d) * px, pos0: sh0 * px, pos1: (sh0 + d) * px, cash1 };
}

function renderPlay() {
  const i = G.cur, r = G.rows[i], n = G.n;
  const ks = [G.first[i], ...G.flips[i]], used = G.flips[i].length, left = 5 - used;
  const dots = G.rows.map((_, j) => `<span class="${j < i ? 'done' : j === i ? 'on' : ''}">${LETTER[j]}</span>`).join('');
  const decided = G.acts.slice(0, i).map((a, j) => `${LETTER[j]}${actText(a, true)}`).join('，');
  const deck = CATS.map(cat => `<div class="cat"><div class="ck">${CATN[cat] || cat}</div><div class="chips">${IND.filter(d => d.cat === cat).map(d => {
    const got = ks.includes(d.k), s = got ? d.get(r, { mi: MI[r] }).s : '';
    return `<button class="chip${got ? ' got' : ''}" data-k="${d.k}" ${got || left <= 0 ? 'disabled' : ''}>${d.nm}${got ? ` · ${esc(s)}` : ''}</button>`;
  }).join('')}</div></div>`).join('');
  const blocks = ks.map(k => indBlock(r, k, k === G.first[i] ? '随机给的' : '', false, k === G.fresh)).join('');
  G.fresh = null;
  const pa = G.pend, pl = planOf(i, pa), w = v => (v / TOTAL * 100).toFixed(1) + '%';
  let plan;
  if (pa.a === 'hold') plan = `不动：仍持有约 <b>${money(pl.pos0)}</b>，可用现金 ${money(G.cash)}。`;
  else if (pa.a === 'sell') plan = `卖出约 <b>${money(pl.amt)}</b>（按整手），这只股票从 ${w(pl.pos0)} 降到 <b>${w(pl.pos1)}</b>；可用现金变成 <b>${money(pl.cash1)}</b>。`;
  else plan = pl.d > 0 ? `买入约 <b>${money(pl.amt)}</b>（按整手，另扣费用 ${money(pl.fee)}），这只股票从 ${w(pl.pos0)} 升到 <b>${w(pl.pos1)}</b>；还剩现金 <b>${money(pl.cash1)}</b>。` : '可用现金不够买一手。';
  const okDis = pa.a === 'buy' && pl.d <= 0;
  $('#play').innerHTML = `
    <h2>看股</h2>
    <p class="sub">名字和日期都藏起来了。每只股票来自不同的一天，各自持有${HL[GH]}；全部定完，才揭晓结果。</p>
    <div class="progress"><div class="dots" aria-label="进度">${dots}</div>
      <div class="acct">总资产 <b>${TOTAL.toLocaleString('zh-CN')} 元</b> · 可用现金 <b>${money(G.cash)}</b>${decided ? ` · 已定：${decided}` : ''}</div></div>
    <div class="board">
      <div class="stock">
        <h3>股票${LETTER[i]} <small>第 ${i + 1} 只，共 ${n} 只</small></h3>
        <p class="hold">你持有约 <b>${money(pl.pos0)}</b>（占总资产 ${w(pl.pos0)}）。现在的 <b>${money(G.cash)}</b> 可用现金都可以用来加仓${i < n - 1 ? '；这里卖出的钱，后面几只也能用' : ''}。</p>
        <div class="inds">${blocks}</div>
        ${used === 0 ? '<div class="empty">从旁边的牌里再翻几项。也可以只看这一项就做决定。</div>' : ''}
      </div>
      <div>
        <div class="deck">
          <h4>再翻一项</h4>
          <p class="left">${left > 0 ? `还可以翻 <b>${left}</b> 项，一项一项来` : '五项已经翻满'}</p>
          ${deck}
        </div>
        <div class="decide">
          <h4>你的决定</h4>
          <div class="seg big" id="act" role="group" aria-label="买卖">
            <button data-a="sell" aria-pressed="${pa.a === 'sell'}">卖出</button><button data-a="hold" aria-pressed="${pa.a === 'hold'}">不动</button><button data-a="buy" aria-pressed="${pa.a === 'buy'}">买入</button>
          </div>
          <div class="ratio" ${pa.a === 'hold' ? 'hidden' : ''}><span class="k">${pa.a === 'sell' ? '卖掉持仓的' : '用掉可用现金的'}</span>
            ${[0.1, 0.25, 0.5, 0.75, 1].map(x => `<button data-x="${x}" aria-pressed="${Math.abs(pa.x - x) < 1e-9}">${x * 100}%</button>`).join('')}</div>
          <p class="plan">${plan}</p>
          ${G.warn ? `<p class="warn">${G.warn}</p>` : ''}
          <div class="nextrow"><button class="btn" id="ok" ${okDis ? 'disabled' : ''}>${i < n - 1 ? `确定，看股票${LETTER[i + 1]}` : `确定，${HL[GH]}后见`}</button></div>
        </div>
      </div>
    </div>`;
  const play = $('#play');
  play.querySelectorAll('.chip[data-k]').forEach(b => { b.onclick = () => flip(b.dataset.k); });
  play.querySelector('#act').onclick = e => { const b = e.target.closest('button'); if (!b) return; G.pend.a = b.dataset.a; G.warn = ''; renderPlay(); };
  play.querySelectorAll('.ratio button').forEach(b => { b.onclick = () => { G.pend.x = +b.dataset.x; G.warn = ''; renderPlay(); }; });
  play.querySelector('#ok').onclick = confirmAct;
}

function actText(a, short, sh0) {
  if (!a) return '';
  if (a.blk) return short ? (a.want === 'buy' ? '想买没买进' : '想卖没卖出') : (a.want === 'buy' ? `想买入，当天涨停封板，没买进` : `想卖出，当天跌停封板，没卖出`);
  if (a.a === 'hold' || !a.d) return '不动';
  const t = (a.a === 'sell' ? '卖出' : '买入') + (a.a === 'sell' ? ` ${a.x * 100}%` : ` 现金的${a.x * 100}%`);
  return short ? t : `${t}（${a.d > 0 ? '+' : '−'}${shares(Math.abs(a.d))}）`;
}

function flip(k) {
  const i = G.cur;
  if (G.flips[i].length >= 5 || G.first[i] === k || G.flips[i].includes(k)) return;
  G.flips[i].push(k); G.fresh = k;
  renderPlay();
}

function confirmAct() {
  const i = G.cur, r = G.rows[i], lim = val(r, 'lim'), a = G.pend;
  if (!G.warn && ((a.a === 'buy' && lim === 1) || (a.a === 'sell' && lim === -1))) {
    G.blk = { want: a.a, wx: a.x };
    G.warn = a.a === 'buy' ? '没成交：这只股票当天涨停封板，买单排在后面，没有买进。可以改成不动或卖出，再点确定。' : '没成交：这只股票当天跌停封板，卖单排在后面，没有卖出。可以改成不动或买入，再点确定。';
    G.pend = { a: 'hold', x: a.x };
    renderPlay(); return;
  }
  const pl = planOf(i, a);
  const act = { a: pl.d ? a.a : 'hold', x: pl.d ? a.x : 0, d: pl.d };
  if (G.blk && !pl.d) Object.assign(act, { blk: 1, want: G.blk.want, wx: G.blk.wx });
  G.acts[i] = act; G.cash = pl.cash1; G.blk = null; G.warn = ''; G.pend = { a: 'hold', x: 0.5 };
  if (i < G.n - 1) { G.cur++; renderPlay(); $('#play').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  G.done = true;
  const rec = loadRec();
  G.rec = { rows: G.rows, sh0: G.sh0, pool: G.pool, acts: G.acts.map(x => [x.a, x.x, x.d, x.blk ? (x.want === 'buy' ? 1 : -1) : 0]), first: G.first, flips: G.flips, ts: Date.now() };
  rec.rounds.push(G.rec);
  if (rec.rounds.length > 500) rec.rounds = rec.rounds.slice(-500);
  saveRec();
  $('#play').hidden = true;
  renderReveal(); renderRecord();
  $('#reveal').scrollIntoView({ behavior: 'smooth', block: 'start' });
  submitRound(G.rec);
}

// ------------------------------------------------------------------ 结算（和服务器 cy_submit 同一套算法）
const actsOf = rd => rd.acts.map(x => ({ a: x[0], x: x[1], d: x[2], blk: x[3] ? 1 : 0, want: x[3] === 1 ? 'buy' : x[3] === -1 ? 'sell' : '' }));
function settle(rows, sh0, acts, h) {
  let pnl = 0, base = 0, mk = 0; const per = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], px = pxOf(r), ret = RET[h](r) / 100, m = MKT[h](MI[r]) / 100;
    if (!isF(ret) || !isF(m)) return null;
    const d = acts[i].d || 0, fee = Math.abs(d) * px * FEE, sh = sh0[i] + d;
    const v = sh * px * ret - fee, b = sh0[i] * px * ret;
    pnl += v; base += b; mk += sh * px * m;
    per.push({ ret: ret * 100, m: m * 100, eff: v - b, w0: sh0[i] * px / TOTAL * 100, w1: sh * px / TOTAL * 100, sh0: sh0[i], sh });
  }
  return { pnl, base, eff: pnl - base, mk, per };
}

// ------------------------------------------------------------------ 揭晓
function renderReveal() {
  const { rows, acts, sh0 } = G;
  const S = HZ.map(h => settle(rows, sh0, acts, h)), s1 = S[0];
  const moved = acts.some(a => a.d);
  let verdict = `${HL[GH]}后（每只股票各算各自的${HL[GH]}），账户${s1.pnl >= 0 ? '赚了' : '亏了'} ${money(Math.abs(s1.pnl))}（${sgn(s1.pnl / TOTAL * 100, 2)}）。`;
  verdict += moved ? `其中你的操作${s1.eff >= 0 ? '多赚了' : '少赚了'} ${money(Math.abs(s1.eff))}。` : '你没有动仓位，盈亏全部来自原来的持仓。';
  verdict += `同样的仓位放在各自同期的大盘上，会${s1.mk >= 0 ? '赚' : '亏'} ${money(Math.abs(s1.mk))}。`;
  const tile = (v, k, c) => `<div class="tile"><div class="v ${c || ''}">${v}</div><div class="k">${k}</div></div>`;
  const tiles = tile(moneyS(s1.pnl), `账户盈亏（${sgn(s1.pnl / TOTAL * 100, 2)}）`, cls(s1.pnl)) + tile(moneyS(s1.base), '如果一动不动', cls(s1.base)) +
    tile(moneyS(s1.eff), '你的操作带来', cls(s1.eff)) + tile(moneyS(s1.mk), '同样仓位买同期大盘', cls(s1.mk));
  const rowsT = rows.map((r, i) => {
    const c = coOf(r), p = s1.per[i];
    return `<tr><td>${LETTER[i]} · <b>${esc(c[1])}</b> <span class="small">${c[0]}</span></td><td>${span(MI[r])}</td><td>${actText(acts[i], true)}</td><td>${p.sh0.toLocaleString('zh-CN')} → ${p.sh.toLocaleString('zh-CN')}</td>
      <td class="${cls(p.ret)}">${sgn(p.ret)}</td><td class="${cls(p.m)}">${sgn(p.m)}</td><td>高于 ${PCTH[GH](r)}%</td><td class="${cls(p.eff)}">${moneyS(p.eff)}</td></tr>`;
  }).join('');
  const later = HZ.slice(1).map((h, j) => { const x = S[j + 1]; return x ? `${HL[h]}后，你的操作带来 <b class="${cls(x.eff)}">${moneyS(x.eff)}</b>（账户${moneyS(x.pnl)}）` : `${HL[h]}后的结果还没全到（数据截至${dateCN(C.lastDay)}）`; }).join('；');
  const longT = rows.map((r, i) => {
    const c = coOf(r), cells = HZ.map(h => { const v = RET[h](r), m = MKT[h](MI[r]); return isF(v) ? `<td class="${cls(v)}">${sgn(v)}<div class="small">同期大盘 ${sgn(m)}</div></td>` : '<td class="small">还没到</td>'; }).join('');
    return `<tr><td>${LETTER[i]} · <b>${esc(c[1])}</b><div class="small">${actText(acts[i], true)}</div></td>${cells}</tr>`;
  }).join('') + `<tr class="sum"><td>你的操作带来</td>${S.map(s => s ? `<td class="${cls(s.eff)}">${moneyS(s.eff)}</td>` : '<td class="small">还没到</td>').join('')}</tr>`;
  $('#reveal').innerHTML = `
    <h2>揭晓</h2>
    <p class="verdict">${verdict}</p>
    <div class="tiles">${tiles}</div>
    <div class="rankbox" id="rankBox" aria-live="polite"></div>
    <div class="scroll"><table class="res"><thead><tr><th>股票</th><th>持有期</th><th>你的操作</th><th>持股（股）</th><th>涨跌</th><th>同期大盘</th><th>在同期全部A股里</th><th>操作带来</th></tr></thead><tbody>${rowsT}</tbody></table></div>
    <div class="fig"><h3>它们是谁</h3><p class="sub">黄色底色的是你翻开的指标。小柱图是同一段持有期里全部A股的涨跌分布，竖线是这只股票；曲线是持有期里的走势（${GH === 1 ? '按天' : GH === 3 ? '每隔几个交易日一个点' : '按月末'}），虚线是同期大盘。同一段时间里，股票之间的差别往往比任何一项指标能解释的大得多。</p><div class="cards" id="cards"></div></div>
    <div class="fig"><h3>再往后看：${HZ.slice(1).map(h => HL[h]).join('、')}</h3>
      <p class="sub">假设你把这次调整后的仓位一直拿着（含分红，不再操作）。${later}。曲线是每只股票相对它自己同期大盘的走势：高于“和大盘一样”就是跑赢了。</p>
      <div class="legend" id="longLegend"></div><div class="plot" id="longPlot"></div>
      <div class="scroll"><table class="res"><thead><tr><th>股票</th>${HZ.map(h => `<th>${HL[h]}</th>`).join('')}</tr></thead><tbody>${longT}</tbody></table></div></div>
    <div class="again"><button class="btn" id="again">再来一局</button><button class="btn ghost" id="toSetup">换个设置</button>
      <button class="linkbtn" id="share">复制这一局的链接，让别人玩同一局</button><span id="copied" aria-live="polite"></span></div>`;
  $('#reveal').hidden = false;
  drawCards(); drawLong(); renderRankBox();
  $('#again').onclick = () => newRound();
  $('#toSetup').onclick = () => $('#kaiju').scrollIntoView({ behavior: 'smooth' });
  $('#share').onclick = () => {
    const url = location.href.split('#')[0] + '#g=' + rows.join('-');
    const done = () => { $('#copied').textContent = '已复制'; setTimeout(() => { $('#copied').textContent = ''; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => { $('#copied').textContent = url; });
    else $('#copied').textContent = url;
  };
}

const LINEC = ['var(--ink)', '#b07d1a', '#8a55a8', '#2d8c9c', '#9c5b37'];
function wOf(sel, def) { const e = $(sel); return Math.max(280, Math.min(def, (e && e.clientWidth) || def)); }

function miniHist(r, W) {
  const mi = MI[r], [h, med, lo, st] = HIST[GH](mi), H = 58, T = 14, B = 14, mx = Math.max(...h), n = h.length, bw = W / n, hi = lo + st * (n - 2);
  const xOf = v => (Math.max(lo - st / 2, Math.min(hi + st / 2, v)) - (lo - st)) / (st * n) * W;
  const down = i => i === 0 || (i < n - 1 && lo + i * st <= 0);
  let s = '';
  h.forEach((c, i) => { const hh = c / mx * (H - T - B); s += `<rect x="${i * bw + 0.5}" y="${H - B - hh}" width="${Math.max(1, bw - 1)}" height="${hh}" style="fill:${down(i) ? 'var(--down-bg)' : 'var(--up-bg)'};stroke:${down(i) ? 'var(--down)' : 'var(--up)'};stroke-opacity:.3"/>`; });
  const md = xOf(med), v = RET[GH](r), x = xOf(v);
  s += `<line x1="${md}" x2="${md}" y1="${T - 2}" y2="${H - B}" style="stroke:var(--mk);stroke-dasharray:3 2"/>`;
  s += `<line x1="${x}" x2="${x}" y1="${T - 2}" y2="${H - B}" style="stroke:var(--fg);stroke-width:2"/>`;
  s += `<text x="${Math.min(W - 2, Math.max(2, x))}" y="${T - 4}" text-anchor="${x > W - 60 ? 'end' : x < 60 ? 'start' : 'middle'}" class="lab">高于同期 ${PCTH[GH](r)}%</text>`;
  s += `<text x="0" y="${H - 2}">−${Math.abs(lo)}%</text><text x="${xOf(0)}" y="${H - 2}" text-anchor="middle">0</text><text x="${W}" y="${H - 2}" text-anchor="end">+${hi}%</text>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="同期全部A股的涨跌分布">${s}</svg>`;
}

function holdChart(r, W) {
  const mi = MI[r], [sp, mp] = holdPath(r), H = 112, L = 6, Rr = 74, T = 10, B = 18, GAP = 15;
  const all = sp.concat(mp).concat([1]), mn = Math.min(...all), mx = Math.max(...all), sp_ = mx - mn || 0.01;
  const x = i => L + i / (sp.length - 1) * (W - L - Rr), y = v => T + (mx - v) / sp_ * (H - T - B);
  const path = a => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const fin = (sp[sp.length - 1] - 1) * 100, fm = (mp[mp.length - 1] - 1) * 100, col = fin >= 0 ? 'var(--up)' : 'var(--down)';
  let s = `<line class="zero" x1="${L}" x2="${W - Rr}" y1="${y(1)}" y2="${y(1)}"/>`;
  s += `<path d="${path(mp)}" style="fill:none;stroke:var(--mk);stroke-width:1.3;stroke-dasharray:4 3"/><path d="${path(sp)}" style="fill:none;stroke:${col};stroke-width:2"/>`;
  let ys = y(sp[sp.length - 1]), ym = y(mp[mp.length - 1]); if (Math.abs(ys - ym) < GAP) { if (ys < ym) ym = ys + GAP; else ym = ys - GAP; }
  s += `<text class="lab" x="${W - Rr + 6}" y="${ys + 4}" style="fill:${col}">${sgn(fin)}</text><text x="${W - Rr + 6}" y="${ym + 4}">大盘${sgn(fm, 0)}</text>`;
  const e = END[GH](mi);
  s += `<text x="${L}" y="${H - 3}">${C.d0[mi].replace(/-/g, '/')}</text><text x="${W - Rr}" y="${H - 3}" text-anchor="end">${(GH === 1 ? e.slice(5) : e).replace(/-/g, '/')}</text>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="持有期里的走势">${s}</svg>`;
}

function drawCards() {
  const { rows, acts } = G, box = $('#cards');
  box.innerHTML = rows.map((r, i) => {
    const mi = MI[r], c = coOf(r), v = RET[GH](r), sec = C.sec[val(r, 'sec')], [bd] = board(c[0], C.d0[mi]);
    const seen = new Set([G.first[i], ...G.flips[i]]), sp = holdPath(r)[0], dd = (Math.min(...sp) - 1) * 100, notes = [];
    if (dd < -3 && v > dd + 3) notes.push(`持有期里最多时跌过 ${Math.abs(dd).toFixed(1)}%。`);
    if (SUSP[GH](r)) notes.push(`${HL[GH]}后那天停牌，按停牌前最后的价格计算。`);
    if (c[3] < LASTALL) notes.push(`此后于${ymCN(ymAll(c[3]))}退市或被合并，之后按最后一个交易日的价格计。`);
    const tbl = CATS.map(cat => `<tr class="cat"><td colspan="3">${CATN[cat] ? cat + '（' + fyOf(mi) + '年报）' : cat}</td></tr>` + IND.filter(d => d.cat === cat).map(d => {
      const o = d.get(r, { mi, open: true }), p = isF(o.p) ? `高于${o.p}%` : '';
      return `<tr class="${seen.has(d.k) ? 'seen' : ''}"><td>${d.nm}</td><td class="v ${isF(o.cv) ? cls(o.cv) : ''}">${o.chart ? esc(o.s) + ' · 最近 ' + o.v : o.v}</td><td class="p">${p}</td></tr>`;
    }).join('')).join('');
    return `<article class="rc">
      <div class="hd"><span class="lt">股票${LETTER[i]}</span><span class="nm">${esc(c[1])}</span><span class="cd">${c[0]}</span><span class="r ${cls(v)}">${sgn(v)}</span></div>
      <div class="meta"><b>${dateCN(C.d0[mi])}</b> 到 ${dateCN(END[GH](mi))} · ${esc(sec ? sec[1] : '')} · ${bd}<br>你的操作：<b>${actText(acts[i], false)}</b> · 那天收盘价 ${pxOf(r).toFixed(2)} 元</div>
      <div class="mhist"></div><div class="dchart"></div>${notes.length ? `<p class="note">${notes.join('')}</p>` : ''}
      <div class="links"><a href="index.html#co=${c[0]}">在地图上看这座城</a><a href="index.html#${C.months[mi]}">那个月的地图</a><a href="faxian.html#co=${c[0]}">财报小传</a><a href="zhencha.html#co=${c[0]}">查疑点</a><a href="kanshu.html#s=${c[0]}&d=${C.months[mi]}&k=turn,cap,vol,pb,m3,m1">那天的指标与分位</a></div>
      <details ${rows.length === 1 ? 'open' : ''}><summary>当时的二十八项指标（你看到了 ${seen.size} 项）</summary><table class="all">${tbl}</table></details>
    </article>`;
  }).join('');
  box.querySelectorAll('.rc').forEach((card, i) => {
    const w = Math.max(240, Math.min(640, card.querySelector('.dchart').clientWidth || 320));
    card.querySelector('.mhist').innerHTML = miniHist(rows[i], w);
    card.querySelector('.dchart').innerHTML = holdChart(rows[i], w);
  });
}

// 一年、三年：每只股票相对它自己同期大盘的走势
function drawLong() {
  const { rows } = G, W = wOf('#longPlot', 1000), H = 280, L = 76, Rr = 96, T = 14, B = 26;
  const series = rows.map(r => { const a = mPath(r), mk = C.mpath[MI[r]]; return a.map((v, k) => isF(v) && mk[k] !== null ? v / Math.pow(10, mk[k] / 10000) : NaN); });
  const all = series.flat().filter(isF).concat([1]);
  const lmn = Math.log10(Math.min(...all)), lmx = Math.log10(Math.max(...all)), sp = (lmx - lmn) || 0.1;
  const x = i => L + i / 36 * (W - L - Rr), y = v => T + (lmx - Math.log10(v)) / sp * (H - T - B);
  let s = '';
  [0.1, 0.2, 0.3, 0.5, 0.7, 1, 1.5, 2, 3, 5, 7, 10, 20, 30, 50].filter(v => Math.log10(v) >= lmn - 0.01 && Math.log10(v) <= lmx + 0.01).forEach(v => {
    s += `<line class="${v === 1 ? 'zero' : 'grid'}" x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v === 1 ? '和大盘一样' : v < 1 ? '落后' + Math.round((1 - v) * 100) + '%' : '领先' + (v >= 2 ? v + '倍' : Math.round((v - 1) * 100) + '%')}</text>`;
  });
  [[0, '决策日'], [12, '一年'], [24, '两年'], [36, '三年']].forEach(([m, t]) => { s += `<text x="${x(m)}" y="${H - 6}" text-anchor="${m === 0 ? 'start' : 'middle'}">${t}</text>`; });
  s += `<line x1="${x(GH)}" x2="${x(GH)}" y1="${T}" y2="${H - B}" style="stroke:var(--gold);stroke-dasharray:2 3"/><text x="${x(GH) + 4}" y="${T + 8}" style="fill:var(--gold)">${HL[GH]}后揭晓</text>`;
  const path = a => { let d = '', pen = false; a.forEach((v, i) => { if (!isF(v)) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }); return d; };
  const ends = [];
  series.forEach((a, i) => {
    s += `<path d="${path(a)}" style="fill:none;stroke:${LINEC[i]};stroke-width:2.2"/>`;
    let k = 36; while (k > 0 && !isF(a[k])) k--; ends.push({ k, v: a[k], t: `${LETTER[i]} ${a[k] >= 1 ? '+' : '−'}${Math.abs(Math.round((a[k] - 1) * 100))}%`, c: LINEC[i] });
  });
  ends.sort((a, b) => y(a.v) - y(b.v)); let last = -99;
  ends.forEach(e => { const yy = Math.max(y(e.v) + 4, last + 14); last = yy; s += `<text class="lab hp" x="${x(e.k) + 6}" y="${yy}" style="fill:${e.c}">${e.t}</text>`; });
  $('#longPlot').innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="相对同期大盘的三年走势">${s}</svg>`;
  $('#longLegend').innerHTML = rows.map((r, i) => `<span><i style="background:${LINEC[i]}"></i>${LETTER[i]} ${esc(coOf(r)[1])}（${ymCN(C.months[MI[r]])}起）</span>`).join('');
}

// ------------------------------------------------------------------ 排行榜
const API = CFG.url && CFG.key ? CFG.url.replace(/\/+$/, '') + '/rest/v1/rpc/' : null;
async function rpc(fn, args) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 12000);
  try {
    // 新版公开密钥（sb_publishable_…）不是 JWT，只能放在 apikey 头里；旧版 anon key 是 JWT，按惯例同时放进 Authorization
    const headers = { 'Content-Type': 'application/json', apikey: CFG.key };
    if (!/^sb_/.test(CFG.key)) headers.Authorization = 'Bearer ' + CFG.key;
    const res = await fetch(API + fn, { method: 'POST', signal: ctl.signal, headers, body: JSON.stringify(args || {}) });
    const txt = await res.text();
    if (!res.ok) { let m = txt; try { m = JSON.parse(txt).message || txt; } catch (e) { /* 原样 */ } throw new Error(m); }
    return JSON.parse(txt);
  } finally { clearTimeout(tm); }
}
const RANKMSG = { 'Could not find the function': '排行榜正在开通，稍后再来', 'too fast': '提交得太快了，过一会儿再试', 'not enough cash': '这一局的交易和规则对不上', 'bad sell': '这一局的交易和规则对不上', 'bad buy': '这一局的交易和规则对不上', 'bad row': '题库版本和服务器对不上，刷新页面再试', 'no answer': '题库版本和服务器对不上，刷新页面再试', 'bad game': '服务器还不认识这个游戏，稍后再来' };
let RB = { k: API ? 'wait' : 'off' };
async function submitRound(rec) {
  if (!API) { RB = { k: 'off' }; renderRankBox(); return; }
  RB = { k: 'wait' }; renderRankBox();
  const items = rec.rows.map((r, i) => ({ r, f: rec.first[i], fl: rec.flips[i], a: rec.acts[i][0], x: rec.acts[i][1], d: rec.acts[i][2], b: rec.acts[i][3] }));
  try {
    const o = await rpc('cy_submit', { p: { v: C.v, game: GH, n: rec.rows.length, pool: rec.pool, cid: cid(), items } });
    rec.srv = { id: o.id, rank: o.rank, total: o.total, eff: +o.eff }; saveRec();
    RB = { k: 'ok', id: o.id, secret: o.secret, rank: o.rank, total: o.total, eff: +o.eff, share: null };
    renderRecord(); loadBoard();
  } catch (e) {
    const m = String(e.message || e); RB = { k: 'err', msg: Object.keys(RANKMSG).find(k => m.includes(k)) ? RANKMSG[Object.keys(RANKMSG).find(k => m.includes(k))] : '没连上排行榜服务器', rec };
  }
  renderRankBox();
}
function renderRankBox() {
  const box = $('#rankBox'); if (!box) return;
  if (RB.k === 'off') { box.innerHTML = '<p class="small">排行榜还没开通（要连上服务器）。这一局记在这台设备的“战绩”里。</p>'; return; }
  if (RB.k === 'wait') { box.innerHTML = '<p class="small">正在登记这一局……</p>'; return; }
  if (RB.k === 'err') { box.innerHTML = `<p class="small">${RB.msg}，这一局只记在这台设备上。 <button class="linkbtn" id="rbRetry">再试一次</button></p>`; $('#rbRetry').onclick = () => submitRound(RB.rec); return; }
  let h = `<p class="rk">这一局你的操作带来 <b class="${cls(RB.eff)}">${moneyS(RB.eff)}</b>，在全部 <b>${RB.total.toLocaleString('zh-CN')}</b> 局里排第 <b>${RB.rank.toLocaleString('zh-CN')}</b> 名。</p>`;
  if (RB.rank <= 100) {
    if (RB.share === null) h += '<p>进入了前 100 名。要把昵称放到排行榜上吗？</p><div class="nextrow"><button class="btn" id="rbYes">晒战绩</button><button class="btn ghost" id="rbNo">不晒战绩</button></div>';
    else if (RB.share === 'form') h += `<div class="nickrow"><input id="rbNick" maxlength="12" placeholder="昵称，1–12 个字" autocomplete="nickname"><button class="btn" id="rbGo">上榜</button><button class="linkbtn" id="rbBack">算了</button></div>${RB.err ? `<p class="small">${RB.err}</p>` : ''}`;
    else if (RB.share === 'yes') h += `<p>已上榜：第 <b>${RB.rank}</b> 名 · <b>${esc(RB.nick)}</b>。 <a href="#paihang">看排行榜</a></p>`;
    else if (RB.share === 'no') h += '<p class="small">好的，不公开昵称。这一局仍然匿名计入排名。</p>';
    else if (RB.share === 'late') h += `<p class="small">刚才又有人超过了你，现在是第 ${RB.rank} 名，已经掉出前 100，没能上榜。</p>`;
  }
  box.innerHTML = h;
  const on = (id, f) => { const e = $(id); if (e) e.onclick = f; };
  on('#rbYes', () => { RB.share = 'form'; renderRankBox(); const e = $('#rbNick'); if (e) e.focus(); });
  on('#rbNo', () => { RB.share = 'no'; renderRankBox(); });
  on('#rbBack', () => { RB.share = null; RB.err = ''; renderRankBox(); });
  on('#rbGo', async () => {
    const nick = $('#rbNick').value.replace(/[<>&"\u0000-\u001f]/g, '').trim();
    if (!nick || nick.length > 12) { RB.err = '昵称要 1–12 个字'; renderRankBox(); return; }
    try {
      const o = await rpc('cy_share', { p_id: RB.id, p_secret: RB.secret, p_nick: nick });
      RB.rank = o.rank;
      if (o.ok) { RB.share = 'yes'; RB.nick = nick; const rd = loadRec().rounds.find(x => x.srv && x.srv.id === RB.id); if (rd) { rd.srv.nick = nick; saveRec(); } loadBoard(); }
      else RB.share = 'late';
    } catch (e) { RB.err = '没连上服务器，再试一次'; }
    renderRankBox();
  });
}

let BOARD = null;
async function loadBoard() {
  const box = $('#board');
  if (!API) { box.innerHTML = '<p class="prose">排行榜要连上服务器才能用，目前还没开通。你的每一局仍会记在下面的“战绩”里。</p>'; return; }
  if (!BOARD) box.innerHTML = '<p class="small">正在读取排行榜……</p>';
  try { BOARD = await rpc('cy_top', { p_game: GH }); } catch (e) { box.innerHTML = `<p class="small">${/Could not find the function/.test(String(e.message)) ? '排行榜正在开通，稍后再来。' : '没连上排行榜服务器。'} <button class="linkbtn" id="bdRetry">再试一次</button></p>`; $('#bdRetry').onclick = loadBoard; return; }
  const mine = new Set(loadRec().rounds.filter(x => x.srv).map(x => x.srv.id));
  const top = BOARD.top || [];
  box.innerHTML = `<p class="prose">已经有 <b>${(+BOARD.players).toLocaleString('zh-CN')}</b> 位玩家玩了 <b>${(+BOARD.total).toLocaleString('zh-CN')}</b> 局。</p>` +
    (top.length ? `<div class="scroll"><table class="res lb"><thead><tr><th>名次</th><th>昵称</th><th>操作带来</th><th>账户盈亏</th><th>几只</th><th>日期</th></tr></thead><tbody>${top.map(t =>
      `<tr class="${mine.has(t.id) ? 'me' : ''}"><td>${t.rank}</td><td>${t.nick ? esc(t.nick) : '<span class="small">没晒</span>'}${mine.has(t.id) ? ' <span class="small">（你）</span>' : ''}</td><td class="${cls(+t.eff)}">${moneyS(+t.eff)}</td><td class="${cls(+t.pnl)}">${moneyS(+t.pnl)}</td><td>${t.n}</td><td>${t.d}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small">还没有人上榜。</p>');
}

// ------------------------------------------------------------------ 战绩（只在这台设备）
function renderRecord() {
  const rs = loadRec().rounds.filter(rd => rd.sh0), box = $('#record');
  if (!rs.length) { box.innerHTML = '<p class="prose">还没有战绩。玩一局试试：一局只要两三分钟。</p>'; return; }
  const S = rs.map(rd => HZ.map(h => settle(rd.rows, rd.sh0, actsOf(rd), h)));
  const moved = rs.map(rd => rd.acts.some(a => a[2]));
  const hz = HZ.map((h, j) => { const ok = S.map((s, i) => s[j] && moved[i] ? s[j].eff : NaN).filter(isF); return { n: ok.length, pos: ok.filter(v => v > 0).length, avg: mean(ok) }; });
  const both = S.map((s, i) => moved[i] && s[0] && s[1] && Math.abs(s[0].eff) > 1 && Math.abs(s[1].eff) > 1 ? [s[0].eff, s[1].eff] : null).filter(Boolean);
  const same = both.filter(([a, b]) => (a > 0) === (b > 0)).length;
  const G3 = { buy: HZ.map(() => []), hold: HZ.map(() => []), sell: HZ.map(() => []) }, cnt = {};
  let stocks = 0;
  rs.forEach(rd => rd.rows.forEach((r, i) => {
    stocks++; const a = rd.acts[i][2] ? rd.acts[i][0] : 'hold';
    HZ.forEach((h, j) => { const v = RET[h](r), m = MKT[h](MI[r]); if (isF(v) && isF(m)) G3[a][j].push(v - m); });
    (rd.flips[i] || []).forEach(k => { cnt[k] = (cnt[k] || 0) + 1; });
  }));
  const tile = (v, k, c) => `<div class="tile"><div class="v ${c || ''}">${v}</div><div class="k">${k}</div></div>`;
  const hzT = HZ.map((hh, h) => { const t = HL[hh] + '后'; return hz[h].n ? tile(`${hz[h].pos}/${hz[h].n}`, `${t}，操作带来正收益的局数；平均每局 ${moneyS(hz[h].avg)}`) : tile('—', `${t}：还没有可以结算的局`); }).join('');
  const grpRow = (a, t) => `<tr><td>${t}</td>${HZ.map((_, h) => { const g = G3[a][h]; return g.length ? `<td class="${cls(mean(g))}">${sgn(mean(g)).replace('%', '')}<div class="small">${g.length} 只</div></td>` : '<td class="small">—</td>'; }).join('')}</tr>`;
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const recent = rs.slice(-8).reverse().map((rd, j) => {
    const s = S[rs.length - 1 - j], d = new Date(rd.ts);
    return `<tr><td>${d.getMonth() + 1}月${d.getDate()}日</td><td style="text-align:left;white-space:normal">${rd.rows.map(r => `${esc(coOf(r)[1])}<span class="small">（${C.months[MI[r]].replace('-', '.')}）</span>`).join('、')}</td>${s.map(x => x ? `<td class="${cls(x.eff)}">${moneyS(x.eff)}</td>` : '<td class="small">还没到</td>').join('')}<td>${rd.srv ? `第 ${rd.srv.rank} 名${rd.srv.nick ? ' · ' + esc(rd.srv.nick) : ''}` : '<span class="small">—</span>'}</td></tr>`;
  }).join('');
  box.innerHTML = `
    <p class="prose">在这台设备上玩了 <b>${rs.length}</b> 局，看过 <b>${stocks}</b> 只股票。“操作带来”只统计动过仓位的局${both.length >= 3 ? `；在${HL[HZ[0]]}和${HL[HZ[1]]}都能结算的 ${both.length} 局里，两者方向一致的只有 <b>${Math.round(same / both.length * 100)}%</b>` : ''}。</p>
    <div class="tiles">${hzT}</div>
    <div class="fig"><h3>你加仓、不动、减仓的股票，各自比同期大盘多涨多少</h3>
      <p class="sub">单位是百分点（含分红）。如果你的判断有用，加仓那一行应当长期高于减仓那一行；看${HZ.slice(1).map(h => HL[h]).join('、')}，比看${HL[GH]}可靠。</p>
      <div class="scroll"><table class="res"><thead><tr><th></th>${HZ.map(h => `<th>${HL[h]}</th>`).join('')}</tr></thead><tbody>${grpRow('buy', '你加仓的')}${grpRow('hold', '你没动的')}${grpRow('sell', '你减仓的')}</tbody></table></div></div>
    ${top.length ? `<div class="fig"><h3>你最常翻的牌</h3><p class="sub">不含每只股票随机给的那一项。</p><p class="prose">${top.map(([k, c]) => `${INDK[k] ? INDK[k].nm : k} <b>${c}</b> 次`).join(' · ')}</p></div>` : ''}
    <div class="fig"><h3>最近几局</h3><div class="scroll"><table class="res"><thead><tr><th>玩的时间</th><th style="text-align:left">股票（那个月）</th><th>操作带来·${HL[HZ[0]]}</th>${HZ.slice(1).map(h => `<th>${HL[h]}</th>`).join('')}<th>排名</th></tr></thead><tbody>${recent}</tbody></table></div></div>
    <p class="small" style="margin-top:14px"><button class="linkbtn" id="clr">清空这台设备上的战绩</button>（排行榜上的记录不受影响）</p>`;
  $('#clr').onclick = function () {
    if (this.dataset.sure) { loadRec().rounds = []; saveRec(); renderRecord(); return; }
    this.dataset.sure = 1; this.textContent = '确定清空？再点一次';
  };
}

// ------------------------------------------------------------------ 开头的“运气”表、指标说明、口径
function renderLuck() {
  const grp = { good: HZ.map(() => []), bad: HZ.map(() => []) };
  for (let r = 0; r < R; r++) {
    if (val(r, 'uni') !== 1) continue;
    const g = val(r, 'roe5') >= 15 && val(r, 'flag') === 0 ? 'good' : val(r, 'flag') >= 2 ? 'bad' : null; if (!g) continue;
    HZ.forEach((h, j) => { const v = RET[h](r), m = MKT[h](MI[r]); if (isF(v) && isF(m)) grp[g][j].push(v - m); });
  }
  const cell = a => `<td><b>${Math.round(a.filter(v => v > 0).length / a.length * 100)}%</b><div class="small">超额中位数 ${sgn(median(a)).replace('%', '')}</div></td>`;
  $('#luckTable').innerHTML = `<table><thead><tr><th></th>${HZ.map(h => `<th>${HL[h]}后</th>`).join('')}</tr></thead><tbody>
    <tr><td>好公司<div class="small">五年平均回报率15%以上，没有疑点</div></td>${grp.good.map(cell).join('')}</tr>
    <tr><td>满身疑点<div class="small">财报侦探亮了两个以上</div></td>${grp.bad.map(cell).join('')}</tr></tbody></table>
    <p class="small" style="margin:6px 0 0">样本：题库里随机抽出的 ${(grp.good[0].length + grp.bad[0].length).toLocaleString('zh-CN')} 个“公司 × 月份”，超额是比同期大盘多涨的百分点。</p>`;
}
function renderGlossary() { $('#glossary').innerHTML = IND.map(d => `<li><b>${d.nm} <span class="small">· ${d.cat}</span></b>${d.hint}</li>`).join(''); }
function renderFine() {
  const big = POOL.reduce((s, p) => s + p.big.length, 0), all = POOL.reduce((s, p) => s + p.all.length, 0), m0 = MOK[0], m1 = MOK[MOK.length - 1];
  $('#fineprint').innerHTML = [
    `题库：${ymCN(C.months[m0])}到${ymCN(C.months[m1])}，每个月最后一个交易日是一个决策日，共 ${MOK.length} 个（持有${HL[GH]}要等结果出来，所以最后一个决策日是${ymCN(C.months[m1])}）。持有期从决策日收盘，到${GH === 1 ? '下个月' : HL[GH] + '后那个月'}的最后一个交易日收盘。每个决策日从“上市满一年、当天有交易”的公司里随机抽 30 家（“全部A股”用这些，共 ${all.toLocaleString('zh-CN')} 道），再从当天市值前 300 名里随机抽 15 家（“只看大公司”用市值前 300 名里的，共 ${big.toLocaleString('zh-CN')} 道）。每只股票各自随机抽一个决策日，同一局里不会出现同一家公司。行情数据截至 ${dateCN(C.lastDay)}。`,
    '指标只用当天能看到的数据：1–4 月用前年年报，5–12 月用上一年年报（年报最晚 4 月 30 日披露）。市盈率、市净率、市销率按最近一期年报算，是“静态”口径，不是行情软件常用的滚动市盈率（TTM）。总市值同地图的口径，包含 H 股等境外股份并按 A 股价格折算。“高于当天 X% 的公司”是在当天全部合格公司里的百分位。',
    '账户：总资产 100 万元。开局时约 50 万元按整手（100 股）买成几只股票，每只买到最接近“50 万 ÷ 只数”的整手数，至少一手，所以各只不完全一样多；其余是现金。买卖都按整手、在各自决策日的收盘价成交，各扣成交额的 0.1%（佣金、印花税等的粗略合计）；现金不计利息。几只股票的日期不同，账户只是把它们的盈亏加在一起。',
    '回报用复权收盘价，等于把分红再买成股票。到期那天停牌的，按停牌前最后的价格计；后来退市的，按最后一个交易日的价格计（实际损失通常更大）。“同期大盘”是那一天地图上全部公司按市值加权、买入后不再调整，同样含分红；它不是沪深300或上证指数。涨停、跌停按“收在最高价（最低价）且涨跌幅达到板块限制”判断，ST 股 ±5% 的限制没有识别。',
    '排行榜按“你的操作带来”排名：一动不动是 0，加减仓让账户多赚或少赚的钱才算数，抽到哪只股票的运气被扣掉了。每一局结束后，这一局的题号、你翻了哪些指标、买卖了多少和结果，会连同浏览器里随机生成的编号匿名上传到排行榜服务器（Supabase），不含姓名、手机号等个人信息；服务器按题库答案重新计算盈亏后再排名。只有进入前 100 名并选择“晒战绩”时，你填的昵称才会公开。',
    `${GAME.luck}，一局的输赢不说明判断的对错。历史统计不代表未来。指标说明由 AI（Claude）编写，会错，也会过时。公司名称用现名或退市前的最后名称；颜色按行情软件的习惯：红涨绿跌。`,
  ].map(t => `<li>${t}</li>`).join('');
}

// ------------------------------------------------------------------ 启动
function fromHash() {
  const m = /^#g=([\d-]+)$/.exec(location.hash);
  if (!m) return false;
  const rows = m[1].split('-').map(Number);
  if (!rows.length || rows.length > 5 || rows.some(r => !(r >= 0 && r < R) || !okMonth(MI[r])) || new Set(rows.map(r => coOf(r)[0])).size !== rows.length) return false;
  newRound(rows); return true;
}
initSetup(); renderLuck(); renderRecord(); renderGlossary(); renderFine(); loadBoard();
fromHash();
window.addEventListener('hashchange', fromHash);
let rz = 0;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (G && G.done && !$('#reveal').hidden) { drawCards(); drawLong(); } }, 200); });
})();
