# 汇总每只A股（沪深，含退市）每月末的总市值估计
import sys, os, re, json, numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
from qlibload import load, instruments, CAL
H=os.path.dirname(os.path.abspath(__file__)); IN=os.path.join(H,'input')+'/'; OUTD=os.path.join(H,'out')+'/'
os.makedirs(OUTD,exist_ok=True)
OUT=OUTD; NB=IN+'a-share-raw/raw/'

cal=pd.Series(CAL); cal=cal[cal<=pd.Timestamp('2026-10-31')]
mend=cal.groupby(cal.dt.to_period('M')).max()          # 每月最后一个交易日
months=list(mend.index.astype(str)); ME=pd.DatetimeIndex(mend.values)
NM=len(months); print('months',months[0],months[-1],NM)

ins=instruments()
ins=ins[ins.sym.str[:2].isin(['SH','SZ'])]
ins=ins[~ins.sym.str.match(r'^(SH900|SZ200)')]          # 去掉B股
ins['start']=pd.to_datetime(ins.start); ins['end']=pd.to_datetime(ins.end)
print('instruments',len(ins))

# ---------- L2W 总市值 -> 隐含总股本 ----------
v=pd.read_parquet(IN+'l2w/stock_valuation.parquet', columns=['code','trade_date','total_mv'])
v=v.dropna(subset=['total_mv']); v=v[v.total_mv>0]
v['sym']=v.code.str[-2:]+v.code.str[:6]
v['trade_date']=pd.to_datetime(v.trade_date)
L2W={k:g.set_index('trade_date').total_mv.sort_index() for k,g in v.groupby('sym')}
del v
print('l2w codes',len(L2W))

def month_last(s):
    """每月最后一个有效值，索引为月序号"""
    s=s.dropna()
    if s.empty: return pd.Series(dtype=float)
    p=s.groupby(s.index.to_period('M')).last()
    return p

rows=[]; meta={}
for i,r in enumerate(ins.itertuples()):
    sym=r.sym
    c=load(sym,'close'); f=load(sym,'factor'); a=load(sym,'amount')
    if c is None or f is None: continue
    raw=(c/f).replace([np.inf,-np.inf],np.nan)
    raw[raw<=0]=np.nan
    df=pd.DataFrame({'raw':raw,'fac':f,'amt':(a*1000 if a is not None else np.nan)})
    first_trade=df.raw.first_valid_index(); last_trade=df.raw.last_valid_index()
    if first_trade is None: continue
    per=df.index.to_period('M')
    mclose=df.raw.groupby(per).last()           # 月内最后有效收盘
    mfac=df.fac.groupby(per).last()
    mamt=df.amt.groupby(per).sum(min_count=1)
    # 隐含股本
    sh=None
    if sym in L2W:
        tm=L2W[sym]
        j=pd.DataFrame({'mv':tm}).join(df.raw,how='inner').dropna()
        if len(j)>5:
            s=j.mv/j.raw
            med=s.rolling(21,center=True,min_periods=5).median()
            ok=(np.log(s/med).abs()<0.12)
            s=s[ok]
            if len(s)>0:
                sh=s.groupby(s.index.to_period('M')).last()
    meta[sym]=dict(first=str(first_trade.date()), last=str(last_trade.date()))
    rows.append((sym, mclose, mfac, mamt, sh))
    if i%500==0: print(i, sym)

import pickle
pickle.dump((months, ME, rows, meta), open(OUT+'stage1.pkl','wb'))
print('done', len(rows))
