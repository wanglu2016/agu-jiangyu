"""生成 ../assets/chiyou-data.js：“持有一月”游戏用的历史题库。

输入：
  input/qlib_bin/        每日行情（chenditc/investment_data 的 qlib 数据包）：复权收盘价、复权因子、最高、最低、成交额、涨跌幅
  ../assets/data.js      月末总市值、逐月行业、公司名称（地图数据）
  ../assets/quality.js   2010–2025 年报摘要（营收、归母净利润、归母净资产、经营现金流、资产负债率）
  ../assets/extra.js     名义GDP（算海平面）

做法：
  决策日是每个月最后一个交易日，从 2013年5月（到那时至少有 2010–2012 三年年报）到 2026年9月；一个月后是下个月最后一个交易日。
  每个决策日，从“上市满一年、当天有交易”的公司里随机抽 30 家，再从当时市值前 300 名里随机抽 15 家。
  指标只用决策日当天能看到的数据：1–4 月只用前年年报，5–12 月用上一年年报（年报最晚 4 月 30 日披露）。
  百分位是在当天全部合格公司里的位置。回报用复权收盘价，等于把分红再买成股票；退市的按最后一个交易日的价格计。

输出的 window.AGU_CY（数组都按“决策月”或“题目行”排列）：
  m0          决策月在 data.js 月份表里的序号起点；months 决策月 'YYYY-MM'；d0、d1 决策日、一个月后的日期
  F           指标字段 [键, 编码]；编码 'l' 表示 值 = q / 比例，'g' 表示 值 = 10^(q/2000)；-32768 为没有数据
  P           有百分位的字段（u8，0–100，255 为没有）
  rows        Int16 R×len(F) → base64；第 0 列 mi 是决策月序号（months 里的下标），第 1 列是公司在 co 里的序号
  pct         Uint8 R×len(P) → base64
  ni          Int16 R×10：截至当时最近十个财年的归母净利润，编码同 quality.js
  mp          Int16 R×37：决策日起每个月末的复权价 / 决策日，log10 × 10000；-32768 为数据之外
  dp          Int16：决策日到一个月后每个交易日的复权价 / 决策日 − 1，×10000；每行长度 = 当月 nd + 1
  co          [代码, 名称, 沪1深0, 地图里最后一个月的序号]
  mkt         每个决策月 [一个月, 一年, 三年] 的全市场市值加权回报（含分红），三年内不足的为 null
  mpath       每个决策月全市场 37 个月的走势（同 mp 的编码，未到的为 null）；mday 当月每个交易日的走势
  med1        每个决策月合格公司一个月回报的中位数；hist 当月一个月回报的分布（−30%…+30%，每 2% 一格，两端各一格溢出）
  sea         2000-01 起每个月的海平面（全图市值 ÷ 近一年GDP，%），与地图页同一算法
  sec         30 国的 [键, 名称]；sec12 每个决策月 30 国总市值近 12 个月的变化
  fd          每个决策月非金融公司里亮 0…4 个疑点的家数，以及没有判断的家数
"""
import os, sys, json, base64, re
import numpy as np, pandas as pd

H = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(H, '..')
Q = os.path.join(H, 'input', 'qlib_bin') + '/'
rng = np.random.default_rng(20261121)

# ---------------------------------------------------------------- 地图数据
src = open(os.path.join(R, 'assets', 'data.js'), encoding='utf-8').read()
D = json.loads(src[src.index('{'):src.index('window.AGU_LAYOUT')].rstrip().rstrip(';'))
MONTHS = D['months']; NM = len(MONTHS); CO = D['co']; N = len(CO); SECT = D['sectors']
TOT = np.array(D['tot']); SECTOT = np.array(D['sec'])
qc = np.frombuffer(base64.b64decode(D['caps']), '<u2')
CAP = np.full((N, NM), np.nan, np.float64)
SEC = np.full((N, NM), -1, np.int16)
off = 0
for j, c in enumerate(CO):
    a, b = c[4], c[5]; n = b - a + 1
    CAP[j, a:b + 1] = 10 ** (qc[off:off + n] / 9000 - 2); off += n
    sc = c[3]
    for k, (m, s) in enumerate(sc):
        e = sc[k + 1][0] if k + 1 < len(sc) else b + 1
        SEC[j, m:e] = s
assert off == qc.size
print('公司', N, '月份', MONTHS[0], MONTHS[-1])

ex = open(os.path.join(R, 'assets', 'extra.js'), encoding='utf-8').read()
EX = json.loads(ex[ex.index('{'):].rstrip().rstrip(';'))
GDP = {int(k): v for k, v in EX['gdp'].items()}
def gdp_at(t):
    y, m = int(MONTHS[t][:4]), int(MONTHS[t][5:])
    return GDP[y - 1] + (GDP[y] - GDP[y - 1]) * m / 12
SEA = np.array([TOT[t] / gdp_at(t) * 100 for t in range(NM)])

# ---------------------------------------------------------------- 年报
qs = open(os.path.join(R, 'assets', 'quality.js'), encoding='utf-8').read()
QD = json.loads(qs[qs.index('{'):].rstrip().rstrip(';'))
FY0, FY1 = QD['fy0'], QD['fy1']; NY = FY1 - FY0 + 1
PER = NY * 3 + NY + 1
QF = np.frombuffer(base64.b64decode(QD['fin']), '<i2').reshape(N, PER)
QL = np.frombuffer(base64.b64decode(QD['lev']), 'u1').reshape(N, NY)
def dq(q):
    q = q.astype(np.float64); out = np.full(q.shape, np.nan)
    m = q != -32768; a = np.abs(q[m])
    out[m] = np.where(a == 0, 0.0, np.sign(q[m]) * 10 ** ((a - 1) / 3200 - 4))
    return out
REV = dq(QF[:, :NY]); NI = dq(QF[:, NY:2 * NY]); EQ = dq(QF[:, 2 * NY:3 * NY + 1]); OCF = dq(QF[:, 3 * NY + 1:])
NIQ = QF[:, NY:2 * NY]
LEV = np.where(QL == 255, np.nan, QL.astype(float))
E0, E1 = EQ[:, :NY], EQ[:, 1:]
AVGEQ = np.where(E1 > 0, np.where(E0 > 0, (E0 + E1) / 2, E1), np.nan)
with np.errstate(invalid='ignore', divide='ignore'):
    ROE = np.where(np.isfinite(NI) & (AVGEQ > 0), NI / AVGEQ * 100, np.nan)
FINK = {'bank', 'broker', 'insur'}
SKEY = [s[0] for s in SECT]

def fy_known(t):
    y, m = int(MONTHS[t][:4]), int(MONTHS[t][5:])
    return y - 1 if m >= 5 else y - 2

# ---------------------------------------------------------------- 日线
CAL = pd.to_datetime(open(Q + 'calendars/day.txt').read().split())
NC = len(CAL)
cal_m = CAL.to_period('M').astype(str)
ME = np.full(NM, -1)
for t, m in enumerate(MONTHS):
    w = np.where(cal_m == m)[0]
    ME[t] = w[-1]
assert (ME >= 0).all()
T_LAST = NM - 1
print('月末交易日', CAL[ME[0]].date(), '…', CAL[ME[-1]].date(), '日历最后', CAL[-1].date())

def load(sym, f):
    p = f'{Q}features/{sym}/{f}.day.bin'
    if not os.path.exists(p): return None
    a = np.fromfile(p, dtype='<f4')
    if len(a) < 2: return None
    s = int(a[0]); v = a[1:].astype(np.float64)
    out = np.full(NC, np.nan); out[s:s + len(v)] = v[:NC - s]
    return out

ADJ_D = np.full((N, NC), np.nan, np.float32)      # 每日复权价，停牌、退市后向前填补
F = {k: np.full((N, NM), np.nan) for k in ('adj', 'raw', 'chg', 'hi52', 'vol', 'amt', 'trd', 'lim')}
FIRST = np.full(N, -1)
for j, c in enumerate(CO):
    sym = ('sh' if c[7] else 'sz') + c[0]
    cl = load(sym, 'close'); fa = load(sym, 'factor')
    if cl is None or fa is None: continue
    hi = load(sym, 'high'); lo = load(sym, 'low'); am = load(sym, 'amount'); ch = load(sym, 'change')
    cl[~(cl > 0)] = np.nan
    v = np.where(np.isfinite(cl))[0]
    if not len(v): continue
    FIRST[j] = v[0]
    s = pd.Series(cl)
    ff = s.ffill().to_numpy(copy=True); ff[:v[0]] = np.nan
    ADJ_D[j] = ff
    raw = cl / fa
    hi52 = s.rolling(250, min_periods=120).max().values
    lr = np.log(s).diff()
    vol = lr.rolling(60, min_periods=40).std().values * np.sqrt(250) * 100
    amt = pd.Series(np.where(np.isfinite(cl), am, np.nan)).rolling(20, min_periods=10).mean().values * 1000 / 1e8
    code = c[0]
    for t in range(NM):
        d = ME[t]
        if d < v[0]: continue
        F['adj'][j, t] = ff[d]
        if np.isfinite(cl[d]):
            F['trd'][j, t] = 1
            F['raw'][j, t] = raw[d]; F['chg'][j, t] = ch[d] * 100
            F['hi52'][j, t] = (cl[d] / hi52[d] - 1) * 100 if np.isfinite(hi52[d]) else np.nan
            F['vol'][j, t] = vol[d]; F['amt'][j, t] = amt[d]
            # 涨跌停：收在最高（最低）价，且涨跌幅到了板块的限制
            day = CAL[d]
            lim = 20 if code.startswith('688') or (code[:3] in ('300', '301') and day >= pd.Timestamp('2020-08-24')) else 10
            x = ch[d] * 100
            if x >= lim - 0.3 and cl[d] >= hi[d] * 0.9995: F['lim'][j, t] = 1
            elif x <= -(lim - 0.3) and cl[d] <= lo[d] * 1.0005: F['lim'][j, t] = -1
            else: F['lim'][j, t] = 0
    if j % 1000 == 0: print('日线', j, sym)
ADJ = F['adj']
print('日线完成，有行情的公司', (FIRST >= 0).sum())

# ---------------------------------------------------------------- 逐月：合格公司、市场基准、指标
T0, T1 = MONTHS.index('2013-05'), MONTHS.index('2026-09')
DM = list(range(T0, T1 + 1))
HBINS = np.concatenate([[-np.inf], np.arange(-30, 31, 2), [np.inf]])   # 32 格

def ret(t, k):
    if t + k > T_LAST: return np.full(N, np.nan)
    with np.errstate(invalid='ignore', divide='ignore'):
        return ADJ[:, t + k] / ADJ[:, t] - 1

def past(t, k):
    if t - k < 0: return np.full(N, np.nan)
    with np.errstate(invalid='ignore', divide='ignore'):
        r = ADJ[:, t] / ADJ[:, t - k] - 1
    return r

# 每家公司每个月的静态市盈率（按当时已披露的年报），用来算“和自己的历史比”
PE = np.full((N, NM), np.nan)
for t in range(NM):
    fy = fy_known(t)
    if fy < FY0: continue
    n = NI[:, fy - FY0]
    with np.errstate(invalid='ignore', divide='ignore'):
        PE[:, t] = np.where(n > 0, CAP[:, t] / n, np.nan)

KEYS = ['mi', 'co', 'sec', 'cap', 'list', 'px', 'chg', 'lim', 'm1', 'm3', 'm12', 'm36', 'hi52', 'vol', 'amt', 'turn',
        'pe', 'peself', 'pb', 'ps', 'roe', 'roe5', 'revg', 'nig', 'cash', 'lev', 'flag', 'fbits', 'sec12',
        'f1', 'f12', 'f36', 'p1', 'p12', 'susp', 'big', 'uni']
ENC = {'mi': ('l', 1), 'co': ('l', 1), 'sec': ('l', 1), 'cap': ('g', 0), 'list': ('l', 1), 'px': ('g', 0), 'chg': ('l', 100), 'lim': ('l', 1),
       'm1': ('l', 10), 'm3': ('l', 10), 'm12': ('l', 10), 'm36': ('l', 10), 'hi52': ('l', 10), 'vol': ('l', 10),
       'amt': ('g', 0), 'turn': ('l', 1000), 'pe': ('l', 10), 'peself': ('l', 1), 'pb': ('l', 100), 'ps': ('l', 100),
       'roe': ('l', 10), 'roe5': ('l', 10), 'revg': ('l', 10), 'nig': ('l', 10), 'cash': ('l', 100), 'lev': ('l', 10),
       'flag': ('l', 1), 'fbits': ('l', 1), 'sec12': ('l', 10), 'f1': ('l', 10), 'f12': ('l', 10), 'f36': ('l', 10),
       'p1': ('l', 1), 'p12': ('l', 1), 'susp': ('l', 1), 'big': ('l', 1), 'uni': ('l', 1)}
PKEYS = ['cap', 'px', 'chg', 'm1', 'm3', 'm12', 'm36', 'hi52', 'vol', 'amt', 'turn', 'pe', 'pb', 'ps',
         'roe', 'roe5', 'revg', 'nig', 'cash', 'lev']

def enc(k, v):
    kind, s = ENC[k]
    if not np.isfinite(v): return -32768
    q = round(np.log10(v) * 2000) if kind == 'g' else round(v * s)
    return int(np.clip(q, -32767, 32767))

def pct_rank(vals, pool):
    """vals 在 pool 里的百分位（0–100，相同值取中间）"""
    pool = np.sort(pool[np.isfinite(pool)])
    if len(pool) < 20: return np.full(len(vals), 255)
    lo = np.searchsorted(pool, vals, 'left'); hi = np.searchsorted(pool, vals, 'right')
    p = np.round((lo + hi) / 2 / len(pool) * 100)
    return np.where(np.isfinite(vals), p, 255).astype(int)

rows, pcts, nis, mps, dps = [], [], [], [], []
co_idx = {}; co_out = []
mon = dict(months=[], d0=[], d1=[], nd=[], mkt=[], mpath=[], mday=[], med1=[], hist=[], sec12=[], fd=[], ne=[])
for t in DM:
    fy = fy_known(t); k = fy - FY0
    listed = np.array([c[4] <= t <= c[5] for c in CO])
    U = listed & np.isfinite(CAP[:, t]) & np.isfinite(ADJ[:, t])
    E = U & (F['trd'][:, t] == 1) & np.isfinite(ADJ[:, t - 12]) & (FIRST >= 0) & (FIRST <= ME[t - 12])
    ids = np.where(E)[0]
    # 市场基准：当天在图上的全部公司，按市值加权买入并持有
    w = np.where(U, CAP[:, t], 0.0); w = w / w.sum()
    mk = []
    for h in (1, 12, 36):
        if t + h > T_LAST: mk.append(None); continue
        r = ret(t, h); mk.append(round(float(np.nansum(w * np.where(np.isfinite(r), r, 0)) * 100), 2))
    path = []
    for h in range(37):
        if t + h > T_LAST: path.append(None); continue
        with np.errstate(invalid='ignore', divide='ignore'):
            r = ADJ[:, t + h] / ADJ[:, t]
        path.append(int(round(np.log10(float(np.nansum(w * np.where(np.isfinite(r), r, 1)))) * 10000)))
    d0, d1 = ME[t], ME[t + 1]
    with np.errstate(invalid='ignore', divide='ignore'):
        rd = ADJ_D[:, d0:d1 + 1].astype(np.float64) / ADJ_D[:, d0:d0 + 1]
    mday = [int(round((float(np.nansum(w[:, None] * np.where(np.isfinite(rd), rd, 1), axis=0)[i]) - 1) * 10000)) for i in range(d1 - d0 + 1)]
    r1 = ret(t, 1) * 100; r12 = ret(t, 12) * 100; r36 = ret(t, 36) * 100
    hist = np.histogram(np.clip(r1[ids], -1e9, 1e9), bins=HBINS)[0].tolist()
    sec12 = []
    for s in range(len(SECT)):
        a0 = SECTOT[s, t - 12]; sec12.append(round(float(SECTOT[s, t] / a0 - 1) * 100, 1) if a0 > 0 else None)

    # 指标（对全部合格公司算，便于求百分位）
    cap = CAP[:, t]
    def fin(arr, kk):
        return arr[:, kk] if 0 <= kk < NY else np.full(N, np.nan)
    ni0, ni1 = fin(NI, k), fin(NI, k - 1); rv0, rv1 = fin(REV, k), fin(REV, k - 1)
    with np.errstate(invalid='ignore', divide='ignore'):
        V = {
            'cap': cap, 'px': F['raw'][:, t], 'chg': F['chg'][:, t], 'm1': past(t, 1) * 100, 'm3': past(t, 3) * 100,
            'm12': past(t, 12) * 100, 'm36': np.where(FIRST <= ME[max(t - 36, 0)], past(t, 36) * 100, np.nan),
            'hi52': F['hi52'][:, t], 'vol': F['vol'][:, t], 'amt': F['amt'][:, t], 'turn': F['amt'][:, t] / cap * 100,
            'pe': np.where(ni0 > 0, cap / ni0, np.nan), 'pb': np.where(EQ[:, k + 1] > 0, cap / EQ[:, k + 1], np.nan),
            'ps': np.where(rv0 > 0, cap / rv0, np.nan), 'roe': ROE[:, k],
            'roe5': np.array([np.nanmean(ROE[j, max(k - 4, 0):k + 1]) if np.isfinite(ROE[j, max(k - 4, 0):k + 1]).sum() >= 3 else np.nan for j in range(N)]),
            'revg': np.where(rv1 > 0, (rv0 / rv1 - 1) * 100, np.nan), 'nig': np.where(ni1 > 0, (ni0 / ni1 - 1) * 100, np.nan),
            'lev': LEV[:, k],
        }
        s3n = np.nansum(NI[:, max(k - 2, 0):k + 1], 1); s3o = np.nansum(OCF[:, max(k - 2, 0):k + 1], 1)
        ok3 = (np.isfinite(NI[:, max(k - 2, 0):k + 1]).sum(1) == min(3, k + 1)) & (np.isfinite(OCF[:, max(k - 2, 0):k + 1]).sum(1) == min(3, k + 1))
        V['cash'] = np.where(ok3 & (s3n > 0), s3o / s3n, np.nan)
    secnow = SEC[:, t]
    isfin = np.array([s >= 0 and SKEY[s] in FINK for s in secnow])
    V['cash'][isfin] = np.nan
    # 财报疑点（财报侦探的口径）：观察期是截至当时的五个财年，不足五年的按已有年份（至少三年）
    FLAG = np.full(N, -1); FBITS = np.zeros(N, int)
    k0 = max(k - 4, 0)
    for j in ids:
        if isfin[j]: continue
        nn, oo = NI[j, k0:k + 1], OCF[j, k0:k + 1]
        if len(nn) < 3 or not (np.isfinite(nn).all() and np.isfinite(oo).all()): continue
        e0, e1 = EQ[j, k0], EQ[j, k + 1]
        if not (e0 > 0) or not np.isfinite(e1): continue
        allpos = (nn > 0).all(); sn = nn.sum(); cc = oo.sum() / sn if sn > 0 else np.nan
        ext = (e1 - e0 - sn) / e0; lv = LEV[j, k]; est = secnow[j] >= 0 and SKEY[secnow[j]] == 'estate'
        f = [bool(allpos and cc < 0.5), bool(not allpos), bool(ext > 1), bool((not est) and np.isfinite(lv) and lv >= 70)]
        FLAG[j] = sum(f); FBITS[j] = sum(b << i for i, b in enumerate(f))
    fd = [int(((FLAG[ids] == n) & ~isfin[ids]).sum()) for n in range(5)] + [int(((FLAG[ids] < 0) & ~isfin[ids]).sum())]
    # 市盈率在自己过去五年（含当月）月度市盈率里的位置
    def peself(j):
        h = PE[j, max(t - 59, 0):t + 1]; h = h[np.isfinite(h)]
        if not np.isfinite(PE[j, t]) or len(h) < 24: return np.nan
        return round(((h < PE[j, t]).sum() + (h == PE[j, t]).sum() / 2) / len(h) * 100)
    P1 = pct_rank(r1, r1[ids]); P12 = pct_rank(r12, r12[ids])

    # 抽样
    rank = ids[np.argsort(-cap[ids])]; top = set(rank[:300].tolist())
    uni = set(rng.choice(ids, size=min(30, len(ids)), replace=False).tolist())
    big = set(rng.choice(np.array(sorted(top)), size=15, replace=False).tolist())
    pick = sorted(uni | big)
    PCT = {kk: pct_rank(V[kk][pick], V[kk][ids]) for kk in PKEYS}
    nd = int(d1 - d0)
    for ii, j in enumerate(pick):
        c = CO[j]
        if j not in co_idx: co_idx[j] = len(co_out); co_out.append([c[0], c[1], c[7], c[5]])
        lmon = (ME[t] - FIRST[j])  # 交易日数，换算成月
        row = {
            'mi': t - T0, 'co': co_idx[j], 'sec': int(secnow[j]), 'list': -1 if FIRST[j] == 0 else int(round(lmon / 250 * 12)),
            'lim': F['lim'][j, t], 'peself': peself(j), 'flag': FLAG[j] if FLAG[j] >= 0 else np.nan, 'fbits': FBITS[j],
            'sec12': sec12[secnow[j]] if secnow[j] >= 0 and sec12[secnow[j]] is not None else np.nan,
            'f1': r1[j], 'f12': r12[j], 'f36': r36[j], 'p1': P1[j], 'p12': P12[j] if np.isfinite(r12[j]) else np.nan,
            'susp': 0 if F['trd'][j, t + 1] == 1 else 1, 'big': 1 if j in top else 0, 'uni': 1 if j in uni else 0,
        }
        for kk in V: row[kk] = V[kk][j]
        rows.append([enc(kk, row[kk]) for kk in KEYS])
        pcts.append([int(PCT[kk][ii]) for kk in PKEYS])
        nq = [int(NIQ[j, x]) if 0 <= x < NY else -32768 for x in range(k - 9, k + 1)]
        nis.append(nq)
        mp = []
        for h in range(37):
            if t + h > T_LAST or not np.isfinite(ADJ[j, t + h]): mp.append(-32768)
            else: mp.append(int(np.clip(round(np.log10(ADJ[j, t + h] / ADJ[j, t]) * 10000), -32767, 32767)))
        mps.append(mp)
        dd = ADJ_D[j, d0:d1 + 1].astype(np.float64) / ADJ_D[j, d0]
        dps.extend(int(np.clip(round((x - 1) * 10000), -32767, 32767)) for x in dd)
    mon['months'].append(MONTHS[t]); mon['d0'].append(str(CAL[d0].date())); mon['d1'].append(str(CAL[d1].date()))
    mon['nd'].append(nd); mon['mkt'].append(mk); mon['mpath'].append(path); mon['mday'].append(mday)
    mon['med1'].append(round(float(np.nanmedian(r1[ids])), 2)); mon['hist'].append(hist)
    mon['sec12'].append(sec12); mon['fd'].append(fd); mon['ne'].append(int(len(ids)))
    if t % 12 == 0: print(MONTHS[t], '合格', len(ids), '抽到', len(pick), '市场一个月', mk[0])

R_ = len(rows)
print('题目行', R_, '公司', len(co_out))
b64 = lambda a, dt: base64.b64encode(np.asarray(a, dt).tobytes()).decode()
out = dict(v=1, m0=T0, F=[[k, ENC[k][0], ENC[k][1]] for k in KEYS], P=PKEYS, R=R_,
           rows=b64(rows, '<i2'), pct=b64(pcts, 'u1'), ni=b64(nis, '<i2'), mp=b64(mps, '<i2'), dp=b64(dps, '<i2'),
           co=co_out, sec=[[s[0], s[1]] for s in SECT], sea=[round(x, 1) for x in SEA.tolist()], seaM0=MONTHS[0],
           fy0=FY0, last=MONTHS[T_LAST], lastDay=str(CAL[ME[T_LAST]].date()), **mon)
path = os.path.join(R, 'assets', 'chiyou-data.js')
with open(path, 'w', encoding='utf-8') as f:
    f.write('/* “持有一月”题库：由 tools/make_chiyou.py 生成，勿手改 */\n')
    f.write('window.AGU_CY=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(path, os.path.getsize(path) // 1024, 'KB')
