"""生成“看数”页（../kanshu.html）的数据：每一只A股在每个月末的 28 项指标，以及它们在当天全部合格A股里的分位。

输入与口径都和 make_chiyou.py 相同（同样的公式、同样的“上市满一年、当天有交易”的公司做分位的参照），
区别只是：题库每个月只抽 45 家，这里算图上的全部公司；不在参照范围里的（上市不满一年、当天停牌）也给出它在参照公司里的位置。
运行完会拿题库（../assets/chiyou-data.js）里的每一道题逐项核对，数值和分位必须一模一样。

输出（都放在 ../assets/ks/，用 <script> 加载，离线双击也能用）：
  index.js        window.AGU_KS_IDX：月份、海平面、同期大盘、30 国、全部公司的代码/名称/拼音首字母/曾用名、A+H 对照和港股快照
  s/<代码>.js      AGU_KS.s('<代码>', '<base64>')：一只股票逐月的数值（Int16）与分位（Uint8），zlib 压缩；格式见 pack_stock()
  m/<年-月>.js     AGU_KS.m('<年-月>', '<base64>')：这个月图上全部公司的分位（供“在全部A股里找”），zlib 压缩；格式见 pack_month()
"""
import os, json, base64, zlib, time
import numpy as np, pandas as pd
from pypinyin import lazy_pinyin, Style

T_START = time.time()
H = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(H, '..')
Q = os.path.join(H, 'input', 'qlib_bin') + '/'
OUT = os.path.join(R, 'assets', 'ks')

# ---------------------------------------------------------------- 地图数据（与 make_chiyou.py 相同）
src = open(os.path.join(R, 'assets', 'data.js'), encoding='utf-8').read()
D = json.loads(src[src.index('{'):src.index('window.AGU_LAYOUT')].rstrip().rstrip(';'))
MONTHS = D['months']; NM = len(MONTHS); CO = D['co']; N = len(CO); SECT = D['sectors']
TOT = np.array(D['tot']); SECTOT = np.array(D['sec'])
qc = np.frombuffer(base64.b64decode(D['caps']), '<u2')
CAP = np.full((N, NM), np.nan); SEC = np.full((N, NM), -1, np.int16)
off = 0
for j, c in enumerate(CO):
    a, b = c[4], c[5]; n = b - a + 1
    CAP[j, a:b + 1] = 10 ** (qc[off:off + n] / 9000 - 2); off += n
    sc = c[3]
    for k, (m, s) in enumerate(sc):
        e = sc[k + 1][0] if k + 1 < len(sc) else b + 1
        SEC[j, m:e] = s
ex = open(os.path.join(R, 'assets', 'extra.js'), encoding='utf-8').read()
EX = json.loads(ex[ex.index('{'):].rstrip().rstrip(';'))
GDP = {int(k): v for k, v in EX['gdp'].items()}
def gdp_at(t):
    y, m = int(MONTHS[t][:4]), int(MONTHS[t][5:])
    return GDP[y - 1] + (GDP[y] - GDP[y - 1]) * m / 12
SEA = np.array([TOT[t] / gdp_at(t) * 100 for t in range(NM)])

# ---------------------------------------------------------------- 年报（与 make_chiyou.py 相同）
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

# ---------------------------------------------------------------- 日线（与 make_chiyou.py 相同，只是不留每日序列）
CAL = pd.to_datetime(open(Q + 'calendars/day.txt').read().split()); NC = len(CAL)
cal_m = CAL.to_period('M').astype(str)
ME = np.array([np.where(cal_m == m)[0][-1] for m in MONTHS])
T_LAST = NM - 1
def load(sym, f):
    p = f'{Q}features/{sym}/{f}.day.bin'
    if not os.path.exists(p): return None
    a = np.fromfile(p, dtype='<f4')
    if len(a) < 2: return None
    s = int(a[0]); v = a[1:].astype(np.float64)
    out = np.full(NC, np.nan); out[s:s + len(v)] = v[:NC - s]
    return out
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
            day = CAL[d]
            lim = 20 if code.startswith('688') or (code[:3] in ('300', '301') and day >= pd.Timestamp('2020-08-24')) else 10
            x = ch[d] * 100
            if x >= lim - 0.3 and cl[d] >= hi[d] * 0.9995: F['lim'][j, t] = 1
            elif x <= -(lim - 0.3) and cl[d] <= lo[d] * 1.0005: F['lim'][j, t] = -1
            else: F['lim'][j, t] = 0
    if j % 1000 == 0: print('日线', j, sym, f'{time.time() - T_START:.0f}s', flush=True)
ADJ = F['adj']
PE = np.full((N, NM), np.nan)
for t in range(NM):
    fy = fy_known(t)
    if fy < FY0: continue
    n = NI[:, fy - FY0]
    with np.errstate(invalid='ignore', divide='ignore'):
        PE[:, t] = np.where(n > 0, CAP[:, t] / n, np.nan)

# ---------------------------------------------------------------- 编码
# 数值字段：[键, 'l' 线性 q=round(v*比例) | 'g' 对数 q=round(log10(v)*2000)]，-32768 为没有
VF = [('cap', 'g', 0), ('px', 'g', 0), ('chg', 'l', 100), ('m1', 'l', 10), ('m3', 'l', 10), ('m12', 'l', 10), ('m36', 'l', 10), ('hi52', 'l', 10),
      ('vol', 'l', 10), ('amt', 'g', 0), ('turn', 'l', 1000), ('pe', 'l', 10), ('peself', 'l', 1), ('pb', 'l', 100), ('ps', 'l', 100),
      ('roe', 'l', 10), ('roe5', 'l', 10), ('revg', 'l', 10), ('nig', 'l', 10), ('cash', 'l', 100), ('lev', 'l', 10), ('flag', 'l', 1),
      ('fbits', 'l', 1), ('sec', 'l', 1), ('lim', 'l', 1), ('list', 'l', 1), ('sec12', 'l', 10), ('ni', 'q', 0)]
# 有分位的字段（Uint8，0–100，255 为没有）。前 20 个和题库一样；后 5 个是看数页新加的
PF = ['cap', 'px', 'chg', 'm1', 'm3', 'm12', 'm36', 'hi52', 'vol', 'amt', 'turn', 'pe', 'pb', 'ps', 'roe', 'roe5', 'revg', 'nig', 'cash', 'lev',
      'list', 'flag', 'sec12', 'ni', 'peself']   # peself 本身就是 0–100 的位置，照抄进来，方便网页统一取分位
def enc_arr(kind, s, v):
    v = np.asarray(v, float); out = np.full(v.shape, -32768, np.int64); m = np.isfinite(v)
    if kind == 'g':
        m &= v > 0; out[m] = np.round(np.log10(v[m]) * 2000)
    else:
        out[m] = np.round(v[m] * s)
    out[m] = np.clip(out[m], -32767, 32767)
    return out.astype(np.int16)
def pct_rank(vals, pool):
    pool = np.sort(pool[np.isfinite(pool)])
    if len(pool) < 20: return np.full(len(vals), 255)
    lo = np.searchsorted(pool, vals, 'left'); hi = np.searchsorted(pool, vals, 'right')
    p = np.round((lo + hi) / 2 / len(pool) * 100)
    return np.where(np.isfinite(vals), p, 255).astype(int)

T0 = MONTHS.index('2013-05'); W = list(range(T0, NM)); NW = len(W)
VAL = {k: np.full((N, NW), -32768, np.int16) for k, _, _ in VF}
PCT = {k: np.full((N, NW), 255, np.uint8) for k in PF}
ONMAP = np.zeros((N, NW), bool); REF = np.zeros((N, NW), bool)   # 图上的公司；做分位参照的“合格公司”
MON = dict(months=[], days=[], sea=[], seaP=[], mkt=[], ne=[], sec12=[])
for wi, t in enumerate(W):
    fy = fy_known(t); k = fy - FY0
    listed = np.array([c[4] <= t <= c[5] for c in CO])
    U = listed & np.isfinite(CAP[:, t]) & np.isfinite(ADJ[:, t])
    E = U & (F['trd'][:, t] == 1) & np.isfinite(ADJ[:, t - 12]) & (FIRST >= 0) & (FIRST <= ME[t - 12])
    ids = np.where(E)[0]; ONMAP[:, wi] = U; REF[:, wi] = E
    w = np.where(U, CAP[:, t], 0.0); w = w / w.sum()
    mk = []
    for h in (1, 3, 12):
        if t + h > T_LAST: mk.append(None); continue
        with np.errstate(invalid='ignore', divide='ignore'):
            r = ADJ[:, t + h] / ADJ[:, t] - 1
        mk.append(round(float(np.nansum(w * np.where(np.isfinite(r), r, 0)) * 100), 2))
    sec12 = []
    for s in range(len(SECT)):
        a0 = SECTOT[s, t - 12]; sec12.append(round(float(SECTOT[s, t] / a0 - 1) * 100, 1) if a0 > 0 else None)
    cap = CAP[:, t]
    def fin(arr, kk): return arr[:, kk] if 0 <= kk < NY else np.full(N, np.nan)
    def past(kk):
        with np.errstate(invalid='ignore', divide='ignore'): return ADJ[:, t] / ADJ[:, t - kk] - 1
    ni0, ni1 = fin(NI, k), fin(NI, k - 1); rv0, rv1 = fin(REV, k), fin(REV, k - 1)
    with np.errstate(invalid='ignore', divide='ignore'):
        V = {
            'cap': cap, 'px': F['raw'][:, t], 'chg': F['chg'][:, t], 'm1': past(1) * 100, 'm3': past(3) * 100,
            'm12': past(12) * 100, 'm36': np.where(FIRST <= ME[max(t - 36, 0)], past(36) * 100, np.nan),
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
    # 财报疑点（与 make_chiyou.py 同一口径，这里对图上全部公司算）
    k0 = max(k - 4, 0); nn, oo = NI[:, k0:k + 1], OCF[:, k0:k + 1]; e0, e1 = EQ[:, k0], EQ[:, k + 1]
    with np.errstate(invalid='ignore', divide='ignore'):
        valid = U & ~isfin & (nn.shape[1] >= 3) & np.isfinite(nn).all(1) & np.isfinite(oo).all(1) & (e0 > 0) & np.isfinite(e1)
        allpos = (nn > 0).all(1); sn = nn.sum(1); cc = np.where(sn > 0, oo.sum(1) / sn, np.nan)
        ext = (e1 - e0 - sn) / e0; lv = LEV[:, k]
        est = np.array([s >= 0 and SKEY[s] == 'estate' for s in secnow])
        fl = [allpos & (cc < 0.5), ~allpos, ext > 1, ~est & np.isfinite(lv) & (lv >= 70)]
    FLAG = np.where(valid, sum(x.astype(int) for x in fl), np.nan)
    FBITS = np.where(valid, sum(x.astype(int) << i for i, x in enumerate(fl)), 0)
    # 市盈率在自己过去五年里的位置
    hpe = PE[:, max(t - 59, 0):t + 1]; cur = PE[:, t]
    with np.errstate(invalid='ignore'):
        cnt = np.isfinite(hpe).sum(1); less = (hpe < cur[:, None]).sum(1); eqn = (hpe == cur[:, None]).sum(1)
        PESELF = np.where(np.isfinite(cur) & (cnt >= 24), np.round((less + eqn / 2) / np.maximum(cnt, 1) * 100), np.nan)
    LMON = np.where(FIRST < 0, np.nan, np.where(FIRST == 0, -1, np.round((ME[t] - FIRST) / 250 * 12)))
    LDAYS = np.where(FIRST < 0, np.nan, (ME[t] - FIRST).astype(float))
    S12 = np.array([sec12[s] if s >= 0 and sec12[s] is not None else np.nan for s in secnow], float)
    V.update(peself=PESELF, flag=FLAG, fbits=FBITS.astype(float), sec=secnow.astype(float), lim=F['lim'][:, t], list=LMON, sec12=S12)
    for key, kind, sc in VF:
        if key == 'ni': col = np.where(0 <= k < NY, NIQ[:, k] if 0 <= k < NY else -32768, -32768).astype(np.int16)
        else: col = enc_arr(kind, sc, V[key])
        VAL[key][:, wi] = np.where(U, col, -32768)
    P = {kk: pct_rank(V[kk], V[kk][ids]) for kk in PF[:20]}
    P['list'] = pct_rank(LDAYS, LDAYS[ids]); P['flag'] = pct_rank(FLAG, FLAG[ids]); P['sec12'] = pct_rank(S12, S12[ids])
    P['ni'] = pct_rank(ni0, ni0[ids]); P['peself'] = np.where(np.isfinite(PESELF), PESELF, 255).astype(int)
    for kk in PF: PCT[kk][:, wi] = np.where(U, P[kk], 255).astype(np.uint8)
    hist = SEA[:t + 1]
    MON['months'].append(MONTHS[t]); MON['days'].append(str(CAL[ME[t]].date())); MON['sea'].append(round(float(SEA[t]), 1))
    MON['seaP'].append(int(round(float((hist < SEA[t]).sum() / len(hist) * 100)))); MON['mkt'].append(mk); MON['ne'].append(int(len(ids)))
    MON['sec12'].append(sec12)
    if t % 12 == 0: print(MONTHS[t], '图上', int(U.sum()), '参照', len(ids), f'{time.time() - T_START:.0f}s', flush=True)

# ---------------------------------------------------------------- 与题库逐项核对
cy = open(os.path.join(R, 'assets', 'chiyou-data.js'), encoding='utf-8').read(); C = json.loads(cy[cy.index('{'):].rstrip().rstrip(';'))
K = [f[0] for f in C['F']]; RR = C['R']
rows = np.frombuffer(base64.b64decode(C['rows']), '<i2').reshape(RR, len(K))
pc = np.frombuffer(base64.b64decode(C['pct']), 'u1').reshape(RR, len(C['P']))
code2j = {c[0]: j for j, c in enumerate(CO)}
bad = {}
for r in range(RR):
    j = code2j[C['co'][rows[r, K.index('co')]][0]]; wi = C['m0'] + rows[r, K.index('mi')] - T0
    for key in ('cap', 'px', 'chg', 'lim', 'm1', 'm3', 'm12', 'm36', 'hi52', 'vol', 'amt', 'turn', 'pe', 'peself', 'pb', 'ps', 'roe', 'roe5',
                'revg', 'nig', 'cash', 'lev', 'flag', 'fbits', 'sec12', 'list', 'sec'):
        a, b = int(rows[r, K.index(key)]), int(VAL[key][j, wi])
        if key == 'fbits' and a == 0 and b == 0: continue
        if a != b: bad.setdefault(key, []).append((r, a, b))
    for ii, key in enumerate(C['P']):
        if int(pc[r, ii]) != int(PCT[key][j, wi]): bad.setdefault('p_' + key, []).append((r, int(pc[r, ii]), int(PCT[key][j, wi])))
print('核对题库', RR, '道题：', '全部一致' if not bad else {k: (len(v), v[:3]) for k, v in bad.items()})
assert not bad, '与题库不一致'

# ---------------------------------------------------------------- 写文件
os.makedirs(os.path.join(OUT, 's'), exist_ok=True); os.makedirs(os.path.join(OUT, 'm'), exist_ok=True)
for d in ('s', 'm'):
    for f in os.listdir(os.path.join(OUT, d)): os.remove(os.path.join(OUT, d, f))
b64z = lambda raw: base64.b64encode(zlib.compress(raw, 9)).decode()
def planes(a):
    """Int16 序列拆成低字节、高字节两段（压缩率更高）；网页端按同样的顺序拼回去"""
    b = np.asarray(a, '<i2').view(np.uint8).reshape(-1, 2)
    return b[:, 0].tobytes() + b[:, 1].tobytes()
def pack_stock(j, a, b):
    """一只股票：[a, b] 是它在图上的第一个、最后一个月（看数月份表的下标）。
    二进制 = 每个数值字段 n 个 Int16（按 VF 的顺序，先低字节后高字节两段）+ 每个分位字段 n 个 Uint8（按 PF 的顺序）+ 年报利润 NY 个 Int16（同 quality.js 编码）
           + n 个 Float32：复权价 ÷ 第 a 个月的复权价（算“后来怎样”；最后一个月之后按最后的价格，退市的和题库一样按最后一个交易日计）"""
    n = b - a + 1; parts = []
    for key, kind, sc in VF: parts.append(planes(VAL[key][j, a:b + 1]))
    for key in PF: parts.append(PCT[key][j, a:b + 1].tobytes())
    parts.append(planes(NIQ[j]))
    with np.errstate(invalid='ignore', divide='ignore'):
        parts.append((ADJ[j, W[a]:W[b] + 1] / ADJ[j, W[a]]).astype('<f4').tobytes())
    return b64z(b''.join(parts))
HK = json.loads((lambda s: s[s.index('{'):].rstrip().rstrip(';'))(open(os.path.join(R, 'assets', 'hk.js'), encoding='utf-8').read()))
AH = {r[0]: r for r in HK['ah']}
idx_co = []; jlist = []; total = 0
for j, c in enumerate(CO):
    on = np.where(ONMAP[j])[0]
    if not len(on): continue
    a, b = int(on[0]), int(on[-1])
    names = [c[1]] + [x[1] for x in c[2]]
    py = '|'.join(dict.fromkeys(''.join(lazy_pinyin(nm.replace('*', '').replace('ST', ''), style=Style.FIRST_LETTER)).lower() for nm in names))
    ah = AH.get(c[0])
    idx_co.append([c[0], c[1], c[7], a, b, py, '|'.join(x[1] for x in c[2]), int(SEC[j, W[b]]), ah[1] if ah else ''])
    s = f"AGU_KS.s('{c[0]}','{pack_stock(j, a, b)}');\n"
    open(os.path.join(OUT, 's', c[0] + '.js'), 'w').write(s); total += len(s); jlist.append(j)
print('个股文件', len(jlist), '共', total // 1024, 'KB', f'{time.time() - T_START:.0f}s', flush=True)
pos = {j: i for i, j in enumerate(jlist)}
def pack_month(wi):
    """这个月图上的 n 家公司：Uint16 序号（index.js 里 co 的下标，先低字节后高字节两段）、n 个“是否参照公司”（1/0）、n 个行业序号、
    再按公司依次排列每家 len(PF) 个分位"""
    js = [j for j in jlist if ONMAP[j, wi]]
    ii = np.array([pos[j] for j in js], '<u2')
    ref = REF[js, wi].astype(np.uint8); sec = np.array([max(int(SEC[j, W[wi]]), 0) for j in js], np.uint8)
    P = np.stack([PCT[k][js, wi] for k in PF], 1).astype(np.uint8)
    return b64z(planes(ii.astype('<i2')) + ref.tobytes() + sec.tobytes() + P.tobytes()), len(js)
mt = 0
for wi in range(NW):
    z, n = pack_month(wi)
    s = f"AGU_KS.m('{MON['months'][wi]}','{z}');\n"; open(os.path.join(OUT, 'm', MON['months'][wi] + '.js'), 'w').write(s); mt += len(s)
print('月度文件', NW, '共', mt // 1024, 'KB')
hk_only = [[r[0], r[1], r[2], r[3], r[4], r[5], r[7]] for r in HK['hk']]
idx = dict(v=1, months=MON['months'], days=MON['days'], sea=MON['sea'], seaP=MON['seaP'], mkt=MON['mkt'], ne=MON['ne'], sec12=MON['sec12'],
           sec=[[s[0], s[1]] for s in SECT], fy0=FY0, ny=NY, vf=[list(x) for x in VF], pf=PF, co=idx_co,
           hk=dict(date=HK['date'], fx=HK['fx'], ah=[[r[0], r[1], r[2], r[3]] for r in HK['ah']], only=hk_only))   # ah：[A股代码, H股代码, H股价(港元), A股价(元)]，和 hk.js 同序
s = '/* 看数页的索引：由 tools/make_kanshu.py 生成，勿手改 */\nwindow.AGU_KS_IDX=' + json.dumps(idx, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8').write(s)
print('index.js', len(s.encode()) // 1024, 'KB；公司', len(idx_co), '；A+H', sum(1 for x in idx_co if x[8]), f'；用时 {time.time() - T_START:.0f}s')
