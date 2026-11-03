# 最终数据：逐月总市值（含退市）、行业归属、名称 → out/final.pkl
import sys, os, re, pickle, numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
import sectors as S
H=os.path.dirname(os.path.abspath(__file__)); IN=os.path.join(H,'input')+'/'; OUTD=os.path.join(H,'out')+'/'
os.makedirs(OUTD,exist_ok=True)
O=OUTD; NB=IN+'a-share-raw/raw/'
months, ME, rows, meta = pickle.load(open(O+'stage1.pkl','rb'))
NAMES,CSRC=pickle.load(open(O+'names_csrc.pkl','rb'))
PI=pd.PeriodIndex(months, freq='M'); NM=len(months); pos={p:i for i,p in enumerate(PI)}
ANCHOR=pd.Period('2026-06','M'); SPLIT=pd.Period('2026-05','M')
EXCLUDE={'SH601313','SZ000043','SZ001246','SZ301569','SZ301660','SZ301716','SZ301718','SZ301686'}

# 2012版行业名称表
for v in pd.read_parquet(NB+'industry_snapshots/industry_monthly.parquet').industry.dropna().unique():
    m=re.match(r'^([A-S]\d\d)(.+)$',v)
    if m: S.NEWNAME[m.group(2)]=m.group(1)

def bfloat(sym):
    ex='SSE' if sym.startswith('SH') else 'SZSE'
    p=f'{NB}bars_daily/CN_{ex}_{sym[2:]}.parquet'
    if not os.path.exists(p): return pd.Series(dtype=float)
    b=pd.read_parquet(p, columns=['date','volume','turn'])
    for c in ['volume','turn']: b[c]=pd.to_numeric(b[c],errors='coerce')
    b=b[(b.turn>0)&(b.volume>0)]
    if b.empty: return pd.Series(dtype=float)
    b['date']=pd.to_datetime(b.date)
    s=pd.Series((b.volume/(b.turn/100)).values,index=b.date)
    return s.groupby(s.index.to_period('M')).median()

def nearest_fill(s, idx, fac):
    known=s.dropna(); out=s.reindex(idx).copy()
    if known.empty: return out
    kp=np.array([p.ordinal for p in known.index])
    for p in idx:
        if pd.isna(out[p]):
            q=known.index[np.argmin(np.abs(kp-p.ordinal))]
            out[p]=known[q]*fac[p]/fac[q]
    return out

N=len(rows)
caps=np.full((N,NM),np.nan); amt=np.full((N,NM),np.nan)
est=np.zeros((N,NM),dtype=bool)   # 估算标记
need_amount=[[] for _ in range(N)]
syms=[]; kind=[]; switch={}       # switch: 借壳等，L2W 起始月
for k,(sym,mclose,mfac,mamt,sh) in enumerate(rows):
    syms.append(sym)
    if sym.startswith('SH000') or sym.startswith('SZ399') or sym in EXCLUDE: kind.append('skip'); continue
    first=pd.Period(meta[sym]['first'][:7],'M'); last=pd.Period(meta[sym]['last'][:7],'M')
    lastday=pd.Timestamp(meta[sym]['last'])
    if last>PI[-1]: end_p=PI[-1]
    else: end_p=last if (lastday>=ME[pos[last]] or last==PI[-1]) else last-1
    idx=[p for p in PI if first<=p<=end_p]
    if not idx: kind.append('skip'); continue
    close=mclose.reindex(PI).ffill().reindex(idx)
    fac=mfac.reindex(PI).ffill().bfill().reindex(idx)
    for p,val in mamt.reindex(idx).items(): amt[k,pos[p]]=val
    F=bfloat(sym).reindex(idx)
    T=None
    if sh is not None and len(sh.dropna())>0:
        T=sh.reindex(idx)
        kv=(T/F)[[p>=ANCHOR for p in idx]].dropna()
        k_anchor=float(np.median(kv)) if len(kv) else np.nan
        f_ok=not (np.isfinite(k_anchor) and k_anchor<0.5)
        if f_ok:
            rr=T/F; kmax=max(70,3*k_anchor) if np.isfinite(k_anchor) else 70
            bad=((rr<0.97)|(rr>kmax))&rr.notna()&pd.Series([p<SPLIT for p in idx],index=idx)
            if bad.any():
                good=rr[(~bad)&rr.notna()]
                for p in bad[bad].index:
                    if len(good):
                        kp=np.array([q.ordinal for q in good.index]); q=good.index[np.argmin(np.abs(kp-p.ordinal))]; kk=good[q]
                    else: kk=1.0
                    T[p]=F[p]*kk
                fF=F.dropna()
                if len(fF):
                    p0=fF.index[0]
                    if bad.get(p0,False) and pd.notna(sh.get(p0,np.nan)):
                        c=T[p0]/sh[p0]
                        for p in idx:
                            if p<p0 and pd.notna(T[p]): T[p]=T[p]*c
        l2w_first=sh.dropna().index.min()
        gap=(l2w_first-idx[0]).n
        if gap>3:   # 借壳等：L2W 起始前的月份另行估算
            switch[sym]=str(l2w_first)
            for p in idx:
                if p<l2w_first:
                    if pd.notna(F.get(p,np.nan)): T[p]=F[p]; est[k,pos[p]]=True
                    else: T[p]=np.nan; need_amount[k].append(p)
            known_after=T[[p>=l2w_first for p in idx]]
            T2=nearest_fill(known_after, [p for p in idx if p>=l2w_first], fac)
            for p in T2.index: T[p]=T2[p]
            fb=T[[p<l2w_first for p in idx]].dropna()
            if len(fb):
                T3=nearest_fill(fb,[p for p in idx if p<l2w_first and p not in need_amount[k]],fac)
                for p in T3.index: T[p]=T3[p]
        else:
            T=nearest_fill(T, idx, fac)
        kind.append('l2w')
    else:
        if len(F.dropna()):
            Ff=F.copy()
            vals=Ff.dropna()
            for j in range(1,len(vals)):
                p_prev,p_cur=vals.index[j-1],vals.index[j]
                ratio=(vals.iloc[j]/fac[p_cur])/(vals.iloc[j-1]/fac[p_prev])
                if ratio>1.5:
                    for p in idx:
                        if p<p_cur and (p_cur-p).n<=36 and pd.notna(Ff[p]):
                            Ff[p]=max(Ff[p], vals.iloc[j]*fac[p]/fac[p_cur])
            T=nearest_fill(Ff, idx, fac); kind.append('float')
            for p in idx: est[k,pos[p]]=True
        else:
            kind.append('amount'); need_amount[k]=list(idx)
    if T is not None:
        for p in idx:
            if p in need_amount[k]: continue
            v=T[p]*close[p]
            if np.isfinite(v): caps[k,pos[p]]=v

kind=np.array(kind); syms=np.array(syms)
r=np.full(NM,np.nan)
for t in range(NM):
    kk=(~np.isnan(caps[:,t]))&(~np.isnan(amt[:,t]))&(amt[:,t]>0)&(kind=='l2w')&(~est[:,t])
    if kk.sum()<20: continue
    c=caps[kk,t]; small=c<=np.nanmedian(c); r[t]=np.median((amt[kk,t]/c)[small])
for k in range(N):
    if not need_amount[k]: continue
    sym,mclose,mfac,mamt,sh=rows[k]
    ids=np.array([pos[p] for p in need_amount[k]])
    a=amt[k,ids]; ok=np.isfinite(a)&(a>0)
    if ok.sum()==0: continue
    a12=pd.Series(a).rolling(12,min_periods=1,center=True).median().values
    e=a12/r[ids]
    close=mclose.reindex(PI).ffill().values[ids]; fac=mfac.reindex(PI).ffill().bfill().values[ids]
    shs=e/close*fac[-1]/fac; Sh=np.nanmedian(shs)
    caps[k,ids]=Sh*fac/fac[-1]*close; est[k,ids]=True
print(pd.Series(kind).value_counts().to_dict())
print('switch',switch)

# ---------------- 行业 ----------------
KEYS=[s[0] for s in S.SECTORS]; KI={k:i for i,k in enumerate(KEYS)}
l2wind=pd.read_parquet(IN+'l2w/stock_industry.parquet')
L2WI=dict(zip(l2wind.ts_code.str[-2:]+l2wind.ts_code.str[:6], l2wind.industry_name))
OV=S.build_overrides()
OV.setdefault('SZ300059',[]).clear(); OV['SZ300059'].append(('2016-01','broker'))
OV.setdefault('SH600061',[]).append(('2015-01','broker'))
# 借壳前的壳公司：(截止月, 板块, 名称)
SHELL={'SH600837':('2006-12','trade','都市股份'),'SZ000783':('2007-01','oil','石炼化'),'SZ000728':('2007-02','chem','北京化二'),
       'SZ000686':('2006-12','trade','锦州六陆'),'SH600109':('2007-02','build','成都建投'),'SZ000776':('2010-01','transp','延边公路'),
       'SH600369':('2008-11','transp','长运股份'),'SZ000750':('2011-07','pharma','桂林集琦'),'SZ000987':('2016-12','trade','广州友谊'),
       'SZ002670':('2015-11','power','华声股份')}
sec=np.full((N,NM),-1,dtype=np.int16)
for i,s in enumerate(syms):
    if kind[i]=='skip': continue
    alive=np.where(~np.isnan(caps[i]))[0]
    hist=CSRC.get(s,[])
    first_new=next((c for m,c in hist if S.from_new(c)),None)
    old_first=next((c for m,c in hist if c),None)
    for t in alive:
        m=months[t]; cur=None
        for hm,hc in hist:
            if hm<=m: cur=hc
        if m<'2013-01':
            k=S.from_new(first_new) if first_new else None
            if k is None: k=S.map_csrc(cur or old_first or '')
        else:
            k=S.map_csrc(cur) if cur else None
            if k is None and first_new: k=S.from_new(first_new)
        if k is None and isinstance(L2WI.get(s),str): k=S.map_csrc(L2WI[s])
        if k is None:
            for hm,hc in hist:
                k=S.map_csrc(hc)
                if k: break
        best=None
        for st,sk in OV.get(s,[]):
            if st is None or st<=m:
                if best is None or (st or '')>=(best[0] or ''): best=(st,sk)
        if best: k=best[1]
        if s in SHELL and m<=SHELL[s][0]: k=SHELL[s][1]
        if k is None: k='trade'
        sec[i,t]=KI[k]

# ---------------- 名称 ----------------
PRE=re.compile(r'^(S\*ST|\*ST|SST|ST|S|PT|XD|XR|DR)(?=[一-鿿A-Za-z])')
def clean(n):
    n=str(n).strip().replace(' ','')
    for _ in range(2): n=PRE.sub('',n)
    n=re.sub(r'^退市','',n); n=re.sub(r'退$','',n)
    return n
BASE={'SZ002024':'苏宁易购','SZ300104':'乐视网','SH600696':'岩石股份'}
RENAME={  # 截止月(含)之前使用的旧名
 'SZ000001':[('2012-07','深发展A')],'SH601766':[('2015-05','中国南车')],'SZ002352':[('2017-01','鼎泰新材')],
 'SH601360':[('2018-02','江南嘉捷')],'SH600690':[('2019-05','青岛海尔')],'SH601211':[('2025-03','国泰君安')],
 'SZ000100':[('2020-01','TCL集团')],'SZ002024':[('2013-01','苏宁电器'),('2017-12','苏宁云商')],
 'SH600871':[('2015-01','仪征化纤')],'SZ000927':[('2020-12','一汽夏利')],'SH600348':[('2020-10','阳泉煤业')],
 'SZ000983':[('2020-12','西山煤电')],'SH600188':[('2021-12','兖州煤业')],'SH600320':[('2009-04','振华港机')],
 'SH600026':[('2016-11','中海发展')],'SH601919':[('2016-11','中国远洋')],'SH600061':[('2014-12','中纺投资')],
 'SH600606':[('2015-07','金丰投资')],'SZ002739':[('2017-06','万达院线'),('2024-12','万达电影')],
 'SH600637':[('2011-11','广电信息'),('2015-05','百视通')],'SH603501':[('2025-06','韦尔股份')],
 'SZ000708':[('2019-11','大冶特钢')],'SH601888':[('2020-05','中国国旅')],'SZ000401':[('2018-12','冀东水泥')],
 'SH600876':[('2021-12','洛阳玻璃')],'SZ000048':[('2019-12','康达尔')],
}
for s,(u,_,nm) in SHELL.items(): RENAME.setdefault(s,[]).insert(0,(u,nm))
companies=[]
for i,s in enumerate(syms):
    if kind[i]=='skip': continue
    alive=np.where(~np.isnan(caps[i]))[0]
    if len(alive)==0: continue
    h=NAMES.get(s,[])
    base=BASE.get(s) or (clean(h[-1][1]) if h else s[2:])
    # BaoStock 中途改名记录（少数）
    ren=[]
    for (m1,n1),(m2,n2) in zip(h,h[1:]):
        p=pd.Period(m2,'M')-1; ren.append((str(p),clean(n1)))
    ren=[x for x in ren if x[1]!=base and len(x[1])>=3 and x[1] not in base and base not in x[1]]
    if s in RENAME: ren=list(RENAME[s])
    ren=sorted(set(ren),key=lambda x:x[0])
    companies.append(dict(i=i,sym=s,name=base,ren=ren,a=int(alive[0]),b=int(alive[-1]),kind=kind[i]))
pickle.dump(dict(months=months,syms=syms,caps=caps,est=est,sec=sec,companies=companies,keys=KEYS,switch=switch),open(O+'final.pkl','wb'))
tot=np.nansum(caps,0)
print('companies',len(companies))
for t in [0,71,95,131,185,251,299,320,321]:
    print(months[t], round(tot[t]/1e12,2), int((~np.isnan(caps[:,t])).sum()), 'est%', round(np.nansum(np.where(est[:,t],caps[:,t],0))/tot[t]*100,2))
