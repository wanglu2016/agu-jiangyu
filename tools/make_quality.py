"""生成 ../assets/quality.js：每家公司 2010–2025 年的年报摘要和历年年末的复权价（“发现好公司”页用）。

输入（都放在 tools/input/ 下，见 README）：
  l2w/financial_line_items.parquet   三大报表（L2Wscorpio/ashare-market-data）。利润表、现金流量表从 2010 年报起，资产负债表更早。
  qlib_bin/                          每日复权收盘价（chenditc/investment_data），用来算含分红的持股回报。
  ../assets/data.js                  已生成的地图数据，只用它的公司顺序和月份表。

输出的 window.AGU_Q：
  fy0, fy1     利润表的起止财年（2010、2025）
  fin          Int16 小端 → base64。每家公司依次是 营收×NY、归母净利润×NY、归母净资产×(NY+1，从 fy0-1 年末起)、经营现金流×NY。
               数值（亿元）= sign(q) × 10^((|q|-1)/3200 - 4)；0 表示零；-32768 表示没有数据。
  lev          Uint8 → base64。每家公司 NY 个：资产负债率（%，四舍五入）；255 表示没有数据。
  gw           Uint8 → base64。每家公司 1 个：最近年报的商誉 ÷ 归母净资产（%，封顶 250）；255 表示没有数据。
  rd           Uint8 → base64。每家公司 1 个：fy1 年报的研发费用 ÷ 营收（‰ 的一半，即 0.2% 一档，封顶 50%）；255 表示没有披露或没有取到。
  tr           Uint16 小端 → base64。每家公司 NT 个：2000…2025 各年 12 月末的复权价指数，再加上市首月末、最后一个月末。
               指数 = 10^(q/9000 - 2)；0 表示当时不在图上。只有比值有意义。
"""
import os, sys, json, base64
import numpy as np, pandas as pd, pyarrow.parquet as pq

H = os.path.dirname(os.path.abspath(__file__))
IN = os.path.join(H, 'input')
FY0, FY1 = 2010, 2025
NY = FY1 - FY0 + 1

src = open(os.path.join(H, '..', 'assets', 'data.js'), encoding='utf-8').read()
data = json.loads(src[src.index('{'):src.index('window.AGU_LAYOUT')].rstrip().rstrip(';'))
MONTHS = data['months']; CO = data['co']; NM = len(MONTHS)
codes = [c[0] for c in CO]
idx = {c: i for i, c in enumerate(codes)}
print('公司', len(CO), '月份', MONTHS[0], MONTHS[-1])

# ---------------------------------------------------------------- 年报
f = pq.ParquetFile(os.path.join(IN, 'l2w', 'financial_line_items.parquet')).read().to_pandas()
f['rd'] = pd.to_datetime(f.report_date)
f = f[(f.rd.dt.month == 12) & (f.rd.dt.year >= FY0 - 1) & (f.rd.dt.year <= FY1)]
f['c6'] = f.code.str[:6]
f = f[f.c6.isin(idx)]
print('年报行数', len(f))

rev = np.full((len(CO), NY), np.nan); ni = rev.copy(); ocf = rev.copy(); lev = rev.copy()
eq = np.full((len(CO), NY + 1), np.nan)
gw = np.full(len(CO), np.nan); rdx = np.full(len(CO), np.nan)

def num(d, *keys):
    for k in keys:
        v = d.get(k)
        if v is None or v == '': continue
        try:
            v = float(v)
        except (TypeError, ValueError):
            continue
        if np.isfinite(v): return v
    return np.nan

for c6, y, st, items in zip(f.c6, f.rd.dt.year, f.statement_type, f['items']):
    i = idx[c6]; d = json.loads(items)
    if st == 'income_statement' and y >= FY0:
        k = y - FY0
        rev[i, k] = num(d, 'revenue', '营业总收入', '营业收入') / 1e8
        # 旧格式的“净利润”就是归母净利润；新格式另有“归属于母公司所有者的净利润”
        ni[i, k] = num(d, 'net_income_parent', '归属于母公司所有者的净利润', 'net_income', '净利润') / 1e8
        if y == FY1:
            r = num(d, '研发费用')
            if np.isfinite(r) and rev[i, k] > 0: rdx[i] = r / 1e8 / rev[i, k]
    elif st == 'balance_sheet':
        e = num(d, 'TOTAL_PARENT_EQUITY', 'TOTAL_EQUITY') / 1e8
        eq[i, y - (FY0 - 1)] = e
        if y >= FY0:
            ta = num(d, 'TOTAL_ASSETS'); tl = num(d, 'TOTAL_LIABILITIES')
            if ta > 0 and np.isfinite(tl): lev[i, y - FY0] = tl / ta
        if y == FY1:
            g = num(d, 'GOODWILL')
            gw[i] = (0.0 if not np.isfinite(g) else g / 1e8) / e if e > 0 else np.nan
    elif st == 'cash_flow' and y >= FY0:
        ocf[i, y - FY0] = num(d, '经营性现金流-现金流量净额', 'operating_cashflow', '经营活动产生的现金流量净额') / 1e8

for nm, a in [('营收', rev), ('净利润', ni), ('净资产', eq), ('经营现金流', ocf)]:
    print(nm, '各年有数据的公司数', np.isfinite(a).sum(0).tolist())
print('研发费用（%d年报）' % FY1, int(np.isfinite(rdx).sum()), '家；商誉', int(np.isfinite(gw).sum()), '家')

def q16(a):
    """亿元 → 带符号的对数刻度"""
    a = np.asarray(a, dtype=float); out = np.full(a.shape, -32768, dtype=np.int32)
    ok = np.isfinite(a); mag = np.abs(a)
    z = ok & (mag < 1e-4); out[z] = 0
    nz = ok & ~z
    q = np.clip(np.round((np.log10(mag[nz]) + 4) * 3200) + 1, 1, 32767)
    out[nz] = (np.sign(a[nz]) * q).astype(np.int32)
    return out.astype('<i2')

fin = np.concatenate([q16(rev), q16(ni), q16(eq), q16(ocf)], axis=1)   # 每家 NY*3 + NY+1 个
levb = np.where(np.isfinite(lev), np.clip(np.round(lev * 100), 0, 250), 255).astype(np.uint8)
gwb = np.where(np.isfinite(gw), np.clip(np.round(gw * 100), 0, 250), 255).astype(np.uint8)
rdb = np.where(np.isfinite(rdx), np.clip(np.round(rdx * 500), 0, 250), 255).astype(np.uint8)

# ---------------------------------------------------------------- 复权价
Q = os.path.join(IN, 'qlib_bin')
CAL = pd.to_datetime(open(os.path.join(Q, 'calendars', 'day.txt')).read().split())
per = CAL.to_period('M').astype(str)
YE = [MONTHS.index(f'{y}-12') for y in range(2000, 2026)]
NT = len(YE) + 2
tr = np.zeros((len(CO), NT), dtype='<u2')
miss = 0
for i, c in enumerate(CO):
    code, a, b = c[0], c[4], c[5]
    sym = ('sh' if code[0] in '69' else 'sz') + code
    p = os.path.join(Q, 'features', sym, 'close.day.bin')
    if not os.path.exists(p): miss += 1; continue
    arr = np.fromfile(p, dtype='<f4')
    if len(arr) < 2: miss += 1; continue
    s0 = int(arr[0]); v = arr[1:].astype(float)
    s = pd.Series(v, index=per[s0:s0 + len(v)])
    s = s[np.isfinite(s.values) & (s.values > 0)]
    if s.empty: miss += 1; continue
    m = s.groupby(level=0).last().reindex(MONTHS).ffill()       # 停牌的月份沿用上一个价格
    mv = m.values
    def q(t):
        if t < a or t > b or not np.isfinite(mv[t]): return 0
        return int(np.clip(np.round((np.log10(mv[t]) + 2) * 9000), 1, 65535))
    for k, t in enumerate(YE): tr[i, k] = q(t)
    # 上市首月可能还没有价格（月末才上市等），往后找第一个有价格的月份
    t0 = a
    while t0 <= b and not np.isfinite(mv[t0]): t0 += 1
    tr[i, NT - 2] = q(t0) if t0 <= b else 0
    tr[i, NT - 1] = q(b)
print('没有复权价的公司', miss, '；最后一个月有复权价的公司', int((tr[:, NT - 1] > 0).sum()))

b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
out = dict(fy0=FY0, fy1=FY1, nt=NT, fin=b64(fin), lev=b64(levb), gw=b64(gwb), rd=b64(rdb), tr=b64(tr))
path = os.path.join(H, '..', 'assets', 'quality.js')
with open(path, 'w', encoding='utf-8') as fo:
    fo.write('/* A股疆域图财报摘要与复权价：2010–2025 年报、历年年末复权价。由 tools/make_quality.py 生成，勿手改 */\n')
    fo.write('window.AGU_Q=' + json.dumps(out, separators=(',', ':')) + ';\n')
print(path, round(os.path.getsize(path) / 1e6, 2), 'MB')
